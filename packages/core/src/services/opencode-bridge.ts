import { eq } from 'drizzle-orm';
import type { getConnection } from '../db/connection.js';
import { agents, tasks } from '../db/schema.js';
import { ATCError } from '../types.js';
import type { DispatchResult, DispatchTaskInput, OpenCodeMessage } from '../types.js';
import type { AgentRegistry } from './agent-registry.js';
import type { EventBus } from './event-bus.js';
import type { LockEngine } from './lock-engine.js';
import type { TaskService } from './task-service.js';

type DbType = ReturnType<typeof getConnection>;

/**
 * Append `[agentName]` suffix to a session title.
 * Strips any existing `[...]` suffix first to avoid duplication
 * (e.g. after agent rename or session reconnect).
 */
function tagSessionTitle(title: string, agentName: string): string {
  const stripped = title.replace(/\s*\[.*\]\s*$/, '');
  return `${stripped} [${agentName}]`;
}

export class OpenCodeBridge {
  private db: DbType;
  private eventBus: EventBus;
  private taskService: TaskService;
  private agentRegistry: AgentRegistry;
  private lockEngine: LockEngine | null = null;

  constructor(
    db: DbType,
    eventBus: EventBus,
    taskService: TaskService,
    agentRegistry: AgentRegistry,
  ) {
    this.db = db;
    this.eventBus = eventBus;
    this.taskService = taskService;
    this.agentRegistry = agentRegistry;
  }

  /**
   * Inject LockEngine after service container assembly to avoid circular deps.
   */
  setLockEngine(le: LockEngine): void {
    this.lockEngine = le;
  }

  /**
   * Fetch available agent types from an OpenCode instance.
   * Calls GET /agent on the OpenCode server.
   */
  async fetchOpenCodeAgents(agentId: string): Promise<{ name: string; description?: string }[]> {
    const agent = this.agentRegistry.getById(agentId);
    if (agent.connectionType !== 'opencode' || !agent.serverUrl) {
      throw new ATCError('NOT_OPENCODE', 'Agent is not an OpenCode agent', 400);
    }

    try {
      const res = await fetch(`${agent.serverUrl}/agent`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        throw new ATCError('OPENCODE_API_ERROR', `Failed to fetch agents: ${res.statusText}`, 502);
      }
      return (await res.json()) as { name: string; description?: string }[];
    } catch (error) {
      if (error instanceof ATCError) throw error;
      throw new ATCError(
        'OPENCODE_API_ERROR',
        `Failed to fetch agents from ${agent.serverUrl}: ${(error as Error).message}`,
        502,
      );
    }
  }

  /**
   * Fetch session messages from an OpenCode agent.
   * Calls GET /session/:sessionId/message on the OpenCode server.
   */
  async fetchSessionMessages(agentId: string): Promise<OpenCodeMessage[]> {
    const agent = this.agentRegistry.getById(agentId);
    if (agent.connectionType !== 'opencode' || !agent.serverUrl) {
      throw new ATCError('NOT_OPENCODE', 'Agent is not an OpenCode agent', 400);
    }

    if (!agent.sessionId) {
      return []; // No active session yet
    }

    try {
      const res = await fetch(`${agent.serverUrl}/session/${agent.sessionId}/message`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new ATCError('OPENCODE_API_ERROR', `Failed to fetch session: ${res.statusText}`, 502);
      }

      const messages = (await res.json()) as Array<{
        info: {
          id: string;
          role: string;
          time?: { created?: number };
        };
        parts?: Array<{ type: string; text?: string }>;
      }>;

      return messages
        .filter((m) => m.info.role === 'user' || m.info.role === 'assistant')
        .map((m) => {
          const textParts = (m.parts || []).filter((p) => p.type === 'text' && p.text);
          const content = textParts.map((p) => p.text).join('\n');
          return {
            id: m.info.id,
            role: m.info.role as 'user' | 'assistant',
            parts: (m.parts || []).map((p) => ({ type: p.type, text: p.text })),
            content,
            createdAt: m.info.time?.created
              ? new Date(m.info.time.created).toISOString()
              : new Date().toISOString(),
          };
        });
    } catch (error) {
      if (error instanceof ATCError) throw error;
      throw new ATCError(
        'OPENCODE_API_ERROR',
        `Failed to fetch session messages from ${agent.serverUrl}: ${(error as Error).message}`,
        502,
      );
    }
  }

  /**
   * List all sessions for an OpenCode agent.
   * Calls GET /session on the OpenCode server.
   */
  async listSessions(
    agentId: string,
  ): Promise<{ id: string; title?: string; createdAt?: string }[]> {
    const agent = this.agentRegistry.getById(agentId);
    if (agent.connectionType !== 'opencode' || !agent.serverUrl) {
      throw new ATCError('NOT_OPENCODE', 'Agent is not an OpenCode agent', 400);
    }

    try {
      const res = await fetch(`${agent.serverUrl}/session`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        throw new ATCError('OPENCODE_API_ERROR', `Failed to list sessions: ${res.statusText}`, 502);
      }
      const raw = (await res.json()) as Array<{
        id: string;
        title?: string;
        time?: { created?: number; updated?: number };
      }>;
      return raw.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.time?.created ? new Date(s.time.created).toISOString() : undefined,
      }));
    } catch (error) {
      if (error instanceof ATCError) throw error;
      throw new ATCError(
        'OPENCODE_API_ERROR',
        `Failed to list sessions from ${agent.serverUrl}: ${(error as Error).message}`,
        502,
      );
    }
  }
  /**
   * Fetch the working directory (CWD) and current session title from an OpenCode instance.
   * Calls GET {serverUrl}/session and extracts the `directory` and `title` fields.
   * When sessionId is provided, returns the title of that specific session.
   * Otherwise falls back to the most recent session's title.
   * Returns nulls if no sessions exist or on any error.
   */
  async fetchSessionInfo(
    serverUrl: string,
    sessionId?: string | null,
  ): Promise<{ cwd: string | null; sessionTitle: string | null }> {
    try {
      const res = await fetch(`${serverUrl}/session`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { cwd: null, sessionTitle: null };
      const sessions = (await res.json()) as Array<{ id?: string; directory?: string; title?: string }>;
      if (sessions.length === 0) return { cwd: null, sessionTitle: null };

      // If a specific sessionId is provided, find that session's title
      let titleSession = sessions[sessions.length - 1]; // fallback: most recent
      if (sessionId) {
        const matched = sessions.find((s) => s.id === sessionId);
        if (matched) {
          titleSession = matched;
        }
      }

      return {
        cwd: sessions[0].directory ?? null,
        sessionTitle: titleSession.title ?? null,
      };
    } catch {
      return { cwd: null, sessionTitle: null };
    }
  }

  /**
   * Fetch ALL sessions from an OpenCode instance.
   * Returns the raw session list for group-based assignment.
   * Each session has id, title, and directory.
   */
  async fetchAllSessions(
    serverUrl: string,
  ): Promise<Array<{ id: string; title: string | null; directory: string | null }>> {
    try {
      const res = await fetch(`${serverUrl}/session`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const sessions = (await res.json()) as Array<{ id?: string; directory?: string; title?: string }>;
      return sessions.map((s) => ({
        id: s.id ?? '',
        title: s.title ?? null,
        directory: s.directory ?? null,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetch the working directory (CWD) from an OpenCode instance.
   * @deprecated Use fetchSessionInfo() instead.
   */
  async fetchCwd(serverUrl: string): Promise<string | null> {
    const info = await this.fetchSessionInfo(serverUrl);
    return info.cwd;
  }

  /**
   * Fetch instance path info from an OpenCode server.
   * Calls GET /path to get directory and worktree paths.
   * This is a lightweight probe — does NOT require an agent record.
   */
  async fetchInstancePath(
    serverUrl: string,
  ): Promise<{ directory: string; worktree: string } | null> {
    try {
      const res = await fetch(`${serverUrl}/path`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { directory?: string; worktree?: string };
      return {
        directory: data.directory ?? '',
        worktree: data.worktree ?? '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch session busy/idle statuses from an OpenCode instance.
   * Calls GET /session/status to get live status of all sessions.
   * Returns a map of sessionId → { type: 'busy' | 'idle' }.
   */
  async fetchSessionStatuses(
    serverUrl: string,
  ): Promise<Record<string, { type: string }>> {
    try {
      const res = await fetch(`${serverUrl}/session/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return {};
      return (await res.json()) as Record<string, { type: string }>;
    } catch {
      return {};
    }
  }

  /**
   * Create a new session on an OpenCode agent.
   * Calls POST /session on the OpenCode server.
   */
  async createSession(agentId: string, title?: string): Promise<{ id: string }> {
    const agent = this.agentRegistry.getById(agentId);
    if (agent.connectionType !== 'opencode' || !agent.serverUrl) {
      throw new ATCError('NOT_OPENCODE', 'Agent is not an OpenCode agent', 400);
    }

    try {
      const res = await fetch(`${agent.serverUrl}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: tagSessionTitle(title || 'Chat session', agent.name) }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new ATCError(
          'OPENCODE_API_ERROR',
          `Failed to create session: ${res.statusText}`,
          502,
        );
      }
      const session = (await res.json()) as { id: string };

      // Update agent's sessionId
      const now = new Date().toISOString();
      this.db
        .update(agents)
        .set({ sessionId: session.id, lastHeartbeat: now })
        .where(eq(agents.id, agentId))
        .run();

      return session;
    } catch (error) {
      if (error instanceof ATCError) throw error;
      throw new ATCError(
        'OPENCODE_API_ERROR',
        `Failed to create session on ${agent.serverUrl}: ${(error as Error).message}`,
        502,
      );
    }
  }

  /**
   * Send a message to a session on an OpenCode agent.
   * Uses prompt_async first (session-targeted by ID) for correct delivery regardless of
   * port↔session mapping. Falls back to TUI dispatch if prompt_async fails.
   */
  async sendMessage(
    agentId: string,
    sessionId: string,
    message: string,
    opencodeAgent?: string,
    serverUrlOverride?: string,
  ): Promise<void> {
    const agent = this.agentRegistry.getById(agentId);
    const serverUrl = serverUrlOverride || agent.serverUrl;
    if (!serverUrl) {
      throw new ATCError('NOT_OPENCODE', 'Agent has no serverUrl and no override provided', 400);
    }

    try {
      // Strategy 1: prompt_async — session-targeted by ID (primary)
      // Works correctly even when port↔session mapping is wrong for same-CWD groups.
      // The session is identified by ID, so any port in the group can process it.
      // TUI instances viewing this session will see the activity via sync context.
      try {
        await this.sendViaPromptAsync(serverUrl, sessionId, message, opencodeAgent);
      } catch {
        // Strategy 2: TUI dispatch fallback — for when prompt_async is unavailable
        const tuiSuccess = await this.trySendViaTui(serverUrl, message);
        if (!tuiSuccess) {
          throw new ATCError(
            'OPENCODE_API_ERROR',
            `Failed to send message to ${serverUrl} (both prompt_async and TUI failed)`,
            502,
          );
        }
      }

      // Update agent's sessionId if needed
      if (agent.sessionId !== sessionId) {
        const now = new Date().toISOString();
        this.db
          .update(agents)
          .set({ sessionId, lastHeartbeat: now })
          .where(eq(agents.id, agentId))
          .run();
      }
    } catch (error) {
      if (error instanceof ATCError) throw error;
      throw new ATCError(
        'OPENCODE_API_ERROR',
        `Failed to send message to ${serverUrl}: ${(error as Error).message}`,
        502,
      );
    }
  }

  /**
   * Try sending via TUI endpoints (append-prompt + submit-prompt).
   * This is a FALLBACK strategy — sends to whatever session the TUI is currently showing.
   * Returns true if successful, false if TUI endpoints are unavailable.
   */
  private async trySendViaTui(serverUrl: string, message: string): Promise<boolean> {
    try {
      // Clear any existing prompt text first
      const clearRes = await fetch(`${serverUrl}/tui/clear-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (!clearRes.ok) return false;

      // Append the message to the TUI prompt
      const appendRes = await fetch(`${serverUrl}/tui/append-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
        signal: AbortSignal.timeout(3000),
      });
      if (!appendRes.ok) return false;

      // Submit the prompt — this triggers LLM processing with TUI streaming
      const submitRes = await fetch(`${serverUrl}/tui/submit-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      return submitRes.ok;
    } catch {
      // TUI endpoints unavailable (headless serve mode) — not an error
      return false;
    }
  }

  /**
   * Send via prompt_async — PRIMARY dispatch strategy.
   * Targets a specific session by ID, so it works correctly regardless of which
   * session the TUI is currently displaying. Any port in the same CWD group works.
   * TUI instances viewing the targeted session will see the activity via sync context.
   */
  private async sendViaPromptAsync(
    serverUrl: string,
    sessionId: string,
    message: string,
    opencodeAgent?: string,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      parts: [{ type: 'text', text: message }],
    };
    if (opencodeAgent) {
      body.agent = opencodeAgent;
    }

    const res = await fetch(`${serverUrl}/session/${sessionId}/prompt_async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new ATCError('OPENCODE_API_ERROR', `Failed to send message: ${res.statusText}`, 502);
    }
  }

  /**
   * Gracefully dispose an OpenCode instance.
   * Calls POST /global/dispose which cleans up all instances and triggers process exit.
   * For TUI instances, this triggers the shutdown chain (disposeAll → process.exit).
   * For headless `opencode serve`, the process exits after the event loop drains.
   * Returns true if the dispose call succeeded, false if unreachable.
   */
  async disposeInstance(serverUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${serverUrl}/global/dispose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      // Instance unreachable — already dead or network issue
      return false;
    }
  }

  /**
   * Fetch messages from a specific session on an OpenCode agent.
   */
  async fetchSessionMessagesBySessionId(
    agentId: string,
    sessionId: string,
  ): Promise<OpenCodeMessage[]> {
    const agent = this.agentRegistry.getById(agentId);
    if (agent.connectionType !== 'opencode' || !agent.serverUrl) {
      throw new ATCError('NOT_OPENCODE', 'Agent is not an OpenCode agent', 400);
    }

    try {
      const res = await fetch(`${agent.serverUrl}/session/${sessionId}/message`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new ATCError('OPENCODE_API_ERROR', `Failed to fetch session: ${res.statusText}`, 502);
      }

      const messages = (await res.json()) as Array<{
        info: {
          id: string;
          role: string;
          time?: { created?: number };
        };
        parts?: Array<{ type: string; text?: string }>;
      }>;

      return messages
        .filter((m) => m.info.role === 'user' || m.info.role === 'assistant')
        .map((m) => {
          const textParts = (m.parts || []).filter((p) => p.type === 'text' && p.text);
          const content = textParts.map((p) => p.text).join('\n');
          return {
            id: m.info.id,
            role: m.info.role as 'user' | 'assistant',
            parts: (m.parts || []).map((p) => ({ type: p.type, text: p.text })),
            content,
            createdAt: m.info.time?.created
              ? new Date(m.info.time.created).toISOString()
              : new Date().toISOString(),
          };
        });
    } catch (error) {
      if (error instanceof ATCError) throw error;
      throw new ATCError(
        'OPENCODE_API_ERROR',
        `Failed to fetch session messages from ${agent.serverUrl}: ${(error as Error).message}`,
        502,
      );
    }
  }

  /**
   * Dispatch a task to an OpenCode agent.
   * Creates a session on the OpenCode server, sends the prompt, and updates task assignment.
   */
  async dispatchTask(input: DispatchTaskInput): Promise<DispatchResult> {
    const agent = this.agentRegistry.getById(input.agentId);

    if (agent.connectionType !== 'opencode' || !agent.serverUrl) {
      throw new ATCError('NOT_OPENCODE', 'Agent is not an OpenCode agent', 400);
    }

    if (agent.status !== 'active') {
      throw new ATCError('AGENT_DISCONNECTED', `Agent ${agent.name} is not active`, 400);
    }

    // Get task details for the prompt
    const task = this.taskService.getTaskDetail(input.taskId);

    if (task.status !== 'todo') {
      throw new ATCError(
        'TASK_NOT_TODO',
        `Task ${input.taskId} is not in 'todo' status (current: ${task.status})`,
        400,
      );
    }

    try {
      let sessionIdToUse: string;
      let sessionTitleToUse: string | null = null;

      if (input.sessionId) {
        // Validate the existing session is reachable
        const validateRes = await fetch(`${agent.serverUrl}/session/${input.sessionId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!validateRes.ok) {
          throw new ATCError(
            'OPENCODE_SESSION_NOT_FOUND',
            `Session ${input.sessionId} not found or unreachable (${validateRes.status})`,
            400,
          );
        }
        const sessionData = (await validateRes.json()) as { id: string; title?: string };
        sessionIdToUse = input.sessionId;
        sessionTitleToUse = sessionData.title ?? null;
      } else if (agent.sessionId) {
        // Agent has an active session — try to reuse it before creating a new one
        const validateRes = await fetch(`${agent.serverUrl}/session/${agent.sessionId}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (validateRes.ok) {
          const sessionData = (await validateRes.json()) as { id: string; title?: string };
          sessionIdToUse = agent.sessionId;
          sessionTitleToUse = sessionData.title ?? null;
        } else {
          // Active session is stale/gone — create a new one
          const sessionRes = await fetch(`${agent.serverUrl}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: tagSessionTitle(`ATC: ${task.title}`, agent.name) }),
            signal: AbortSignal.timeout(10000),
          });

          if (!sessionRes.ok) {
            throw new ATCError(
              'OPENCODE_SESSION_ERROR',
              `Failed to create session: ${sessionRes.statusText}`,
              502,
            );
          }

          const session = (await sessionRes.json()) as { id: string; title?: string };
          sessionIdToUse = session.id;
          sessionTitleToUse = session.title ?? null;
        }
      } else {
        // No session provided, no active session on agent — create a new one
        const sessionRes = await fetch(`${agent.serverUrl}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: tagSessionTitle(`ATC: ${task.title}`, agent.name) }),
          signal: AbortSignal.timeout(10000),
        });

        if (!sessionRes.ok) {
          throw new ATCError(
            'OPENCODE_SESSION_ERROR',
            `Failed to create session: ${sessionRes.statusText}`,
            502,
          );
        }

        const session = (await sessionRes.json()) as { id: string; title?: string };
        sessionIdToUse = session.id;
        sessionTitleToUse = session.title ?? null;
      }

      if (!this.lockEngine) {
        throw new ATCError('LOCK_ENGINE_NOT_CONFIGURED', 'Lock engine is not configured', 500);
      }

      const claimResult = await this.lockEngine!.claimTask(
        { id: agent.id, cwd: agent.cwd, workspaceMode: agent.workspaceMode },
        input.taskId,
      );

      const lockCredentials =
        `The task has already been claimed for you. Use the ATC MCP tools with these credentials:\n` +
        `- lock_token: ${claimResult.lockToken}\n` +
        `- task_id: ${task.id}\n` +
        `To: 1) report_progress(lock_token, task_id, message) as you work, ` +
        `2) update_status(lock_token, task_id, 'review') or ` +
        `update_status(lock_token, task_id, 'done') when complete.\n` +
        `Do NOT call claim_task - the task is already claimed.`;

      const prompt = input.prompt
        ? `${input.prompt}\n\n${lockCredentials}`
        : `You have been assigned task "${task.title}" (ID: ${task.id}) from the Agent Task Coordinator (ATC).\n` +
          (task.description ? `Description: ${task.description}.\n` : '') +
          lockCredentials;

      // Build the message body with optional agent type (build/plan/etc.)
      const messageBody: Record<string, unknown> = {
        parts: [{ type: 'text', text: prompt }],
      };
      if (input.opencodeAgent) {
        messageBody.agent = input.opencodeAgent;
      }

      try {
        // Strategy 1: prompt_async — session-targeted by ID (primary)
        // Works correctly regardless of port↔session mapping for same-CWD groups.
        const promptRes = await fetch(`${agent.serverUrl}/session/${sessionIdToUse}/prompt_async`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messageBody),
          signal: AbortSignal.timeout(10000),
        });

        if (!promptRes.ok) {
          // Strategy 2: TUI dispatch fallback
          const tuiSuccess = await this.trySendViaTui(agent.serverUrl!, prompt);
          if (!tuiSuccess) {
            throw new ATCError(
              'OPENCODE_PROMPT_ERROR',
              `Failed to send prompt: ${promptRes.statusText}`,
              502,
            );
          }
        }
      } catch (error) {
        await this.lockEngine!.releaseTask(
          claimResult.lockToken,
          input.taskId,
          'Dispatch prompt failed',
        );
        throw error;
      }

      // Update agent session tracking
      const now = new Date().toISOString();
      this.db
        .update(agents)
        .set({
          sessionId: sessionIdToUse,
          sessionTitle: sessionTitleToUse,
          lastHeartbeat: now,
        })
        .where(eq(agents.id, input.agentId))
        .run();

      // Broadcast agent update so dashboard reflects new session immediately
      await this.eventBus.publish('AGENT_CONNECTED', {
        agentId: input.agentId,
        payload: { reason: 'session_changed', sessionId: sessionIdToUse },
      });

      // Assign task to agent
      this.db
        .update(tasks)
        .set({
          assignedAgentId: input.agentId,
          updatedAt: now,
        })
        .where(eq(tasks.id, input.taskId))
        .run();

      return {
        success: true,
        agentId: input.agentId,
        taskId: input.taskId,
        sessionId: sessionIdToUse,
        message: input.sessionId
          ? `Task dispatched to ${agent.name} (reusing requested session)`
          : sessionIdToUse === agent.sessionId
            ? `Task dispatched to ${agent.name} (reusing active session)`
            : `Task dispatched to ${agent.name} (new session)`,
        lockToken: claimResult.lockToken,
      };
    } catch (error) {
      if (error instanceof ATCError) throw error;
      throw new ATCError(
        'OPENCODE_DISPATCH_ERROR',
        `Failed to dispatch to ${agent.name}: ${(error as Error).message}`,
        502,
      );
    }
  }
}
