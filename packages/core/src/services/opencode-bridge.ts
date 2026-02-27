import { eq } from 'drizzle-orm';
import type { getConnection } from '../db/connection.js';
import { agents, tasks } from '../db/schema.js';
import { ATCError } from '../types.js';
import type { DispatchResult, DispatchTaskInput, OpenCodeMessage } from '../types.js';
import type { AgentRegistry } from './agent-registry.js';
import type { EventBus } from './event-bus.js';
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
   * Calls GET /session/:sessionId on the OpenCode server.
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
      const res = await fetch(`${agent.serverUrl}/session/${agent.sessionId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new ATCError(
          'OPENCODE_API_ERROR',
          `Failed to fetch session: ${res.statusText}`,
          502,
        );
      }

      const session = (await res.json()) as {
        id: string;
        title?: string;
        messages?: Array<{
          id: string;
          role: string;
          parts?: Array<{ type: string; text?: string }>;
          createdAt?: string;
        }>;
      };

      if (!session.messages) return [];

      return session.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => {
          const textParts = (m.parts || []).filter((p) => p.type === 'text' && p.text);
          const content = textParts.map((p) => p.text).join('\n');
          return {
            id: m.id,
            role: m.role as 'user' | 'assistant',
            parts: (m.parts || []).map((p) => ({ type: p.type, text: p.text })),
            content,
            createdAt: m.createdAt || new Date().toISOString(),
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
  async listSessions(agentId: string): Promise<{ id: string; title?: string; createdAt?: string }[]> {
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
      return (await res.json()) as { id: string; title?: string; createdAt?: string }[];
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
        throw new ATCError('OPENCODE_API_ERROR', `Failed to create session: ${res.statusText}`, 502);
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
   * Calls POST /session/:sessionId/prompt_async on the OpenCode server.
   * Returns 204 immediately (async).
   */
  async sendMessage(
    agentId: string,
    sessionId: string,
    message: string,
    opencodeAgent?: string,
  ): Promise<void> {
    const agent = this.agentRegistry.getById(agentId);
    if (agent.connectionType !== 'opencode' || !agent.serverUrl) {
      throw new ATCError('NOT_OPENCODE', 'Agent is not an OpenCode agent', 400);
    }

    const body: Record<string, unknown> = {
      parts: [{ type: 'text', text: message }],
    };
    if (opencodeAgent) {
      body.agent = opencodeAgent;
    }

    try {
      const res = await fetch(`${agent.serverUrl}/session/${sessionId}/prompt_async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new ATCError('OPENCODE_API_ERROR', `Failed to send message: ${res.statusText}`, 502);
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
        `Failed to send message to ${agent.serverUrl}: ${(error as Error).message}`,
        502,
      );
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
      const res = await fetch(`${agent.serverUrl}/session/${sessionId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new ATCError(
          'OPENCODE_API_ERROR',
          `Failed to fetch session: ${res.statusText}`,
          502,
        );
      }

      const session = (await res.json()) as {
        id: string;
        title?: string;
        messages?: Array<{
          id: string;
          role: string;
          parts?: Array<{ type: string; text?: string }>;
          createdAt?: string;
        }>;
      };

      if (!session.messages) return [];

      return session.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => {
          const textParts = (m.parts || []).filter((p) => p.type === 'text' && p.text);
          const content = textParts.map((p) => p.text).join('\n');
          return {
            id: m.id,
            role: m.role as 'user' | 'assistant',
            parts: (m.parts || []).map((p) => ({ type: p.type, text: p.text })),
            content,
            createdAt: m.createdAt || new Date().toISOString(),
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

    const prompt =
      input.prompt ||
      `You have been assigned a task from the Agent Task Coordinator (ATC). ` +
        `Claim task "${task.title}" (ID: ${task.id}) and work on it. ` +
        (task.description ? `Description: ${task.description}. ` : '') +
        `Use the ATC MCP tools to: 1) claim_task, 2) report_progress as you work, ` +
        `3) update_status to 'review' or 'done' when complete.`;

    try {
      // Create a session on the OpenCode server
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

      const session = (await sessionRes.json()) as { id: string };

      // Build the message body with optional agent type (build/plan/etc.)
      const messageBody: Record<string, unknown> = {
        parts: [{ type: 'text', text: prompt }],
      };
      if (input.opencodeAgent) {
        messageBody.agent = input.opencodeAgent;
      }

      // Send the prompt asynchronously (don't wait for AI response)
      const promptRes = await fetch(`${agent.serverUrl}/session/${session.id}/prompt_async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody),
        signal: AbortSignal.timeout(10000),
      });

      if (!promptRes.ok) {
        throw new ATCError(
          'OPENCODE_PROMPT_ERROR',
          `Failed to send prompt: ${promptRes.statusText}`,
          502,
        );
      }

      // Update agent session tracking
      const now = new Date().toISOString();
      this.db
        .update(agents)
        .set({
          sessionId: session.id,
          lastHeartbeat: now,
        })
        .where(eq(agents.id, input.agentId))
        .run();

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
        sessionId: session.id,
        message: `Task dispatched to ${agent.name}`,
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
