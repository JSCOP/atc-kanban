import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { getConnection } from '../db/connection.js';
import { agents, progressLogs, taskComments, taskLocks, tasks, workspaces } from '../db/schema.js';
import type {
  Agent,
  AgentInfo,
  AgentStatus,
  ConnectionType,
  RegisterAgentInput,
  RegisterAgentResult,
  RegisterOpenCodeAgentInput,
  WorkspaceMode,
} from '../types.js';
import { ATCError } from '../types.js';
import type { EventBus } from './event-bus.js';

type DbType = ReturnType<typeof getConnection>;

/**
 * Check if a process with the given PID is still alive.
 * Cross-platform: Windows (OpenProcess), Linux (/proc), macOS (kill -0).
 * Zero external dependencies.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0); // signal 0 = existence check only, does NOT kill
    return true;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EPERM') return true; // process exists, no permission
    if (error.code === 'ESRCH') return false; // no such process
    return false;
  }
}

function extractPort(url: string): number | null {
  try {
    const parsed = new URL(url);
    return parsed.port ? Number.parseInt(parsed.port, 10) : null;
  } catch {
    return null;
  }
}

export class AgentRegistry {
  private db: DbType;
  private eventBus: EventBus;

  constructor(db: DbType, eventBus: EventBus) {
    this.db = db;
    this.eventBus = eventBus;
  }

  /**
   * Register or reconnect an agent.
   * - If sessionId provided → match by sessionId (most precise, for OpenCode session continuity).
   * - Else if a disconnected agent with the same name+role exists → reactivate it (preserves ID + history).
   * - If an active agent with the same name+role exists → check PID, reactivate if dead.
   * - If role=main, still enforces uniqueness (only one active main).
   * - Otherwise → create a new agent.
   */
  async register(input: RegisterAgentInput): Promise<RegisterAgentResult> {
    const { name, role, agentType, processId, cwd, sessionId, workspaceMode, projectId } = input;
    const now = new Date().toISOString();

    // 1a. If sessionId provided, try exact session match first (most precise)
    if (sessionId) {
      const bySession = this.db.select().from(agents).where(eq(agents.sessionId, sessionId)).get();

      if (bySession) {
        if (role === 'main' && bySession.role !== 'main') {
          const mainConditions = projectId
            ? and(
                eq(agents.role, 'main'),
                eq(agents.status, 'active'),
                eq(agents.projectId, projectId),
              )
            : and(eq(agents.role, 'main'), eq(agents.status, 'active'));

          const existingMain = this.db.select().from(agents).where(mainConditions).get();

          if (existingMain) {
            const mainAlive = existingMain.processId
              ? isProcessAlive(existingMain.processId)
              : false;
            if (mainAlive) {
              const scopeMsg = projectId ? ` for project ${projectId}` : '';
              throw new ATCError(
                'MAIN_ALREADY_ACTIVE',
                `Main agent already active${scopeMsg}`,
                409,
              );
            }
            await this.disconnectById(existingMain.id, 'process_dead');
          }
        }

        if (bySession.status === 'active') {
          const alive = bySession.processId ? isProcessAlive(bySession.processId) : false;
          if (alive && bySession.processId !== (processId ?? null)) {
            if (role === 'main') {
              throw new ATCError('MAIN_ALREADY_ACTIVE', 'Main agent already active', 409);
            }
            // Different live process with same sessionId — fall through to name+role
          } else {
            return this.reactivateAgent(bySession.id, {
              agentType,
              processId,
              cwd,
              sessionId,
              now,
              name,
              role,
              connectionType: 'mcp',
            });
          }
        } else {
          return this.reactivateAgent(bySession.id, {
            agentType,
            processId,
            cwd,
            sessionId,
            now,
            name,
            role,
            connectionType: 'mcp',
          });
        }
      }
    }

    // 1b. Fallback: find existing agent with same name+role to reconnect
    const existing = this.db
      .select()
      .from(agents)
      .where(and(eq(agents.name, name), eq(agents.role, role)))
      .get();

    if (existing) {
      if (existing.status === 'active') {
        // Active agent with same name+role — check if its process is alive
        const alive = existing.processId ? isProcessAlive(existing.processId) : false;
        if (alive && existing.processId !== (processId ?? null)) {
          // Different live process with same name+role
          if (role === 'main') {
            throw new ATCError('MAIN_ALREADY_ACTIVE', 'Main agent already active', 409);
          }
          // For workers, allow multiple — fall through to create new
        } else {
          // Same process reconnecting, or old process dead → reactivate
          return this.reactivateAgent(existing.id, {
            agentType,
            processId,
            cwd,
            sessionId,
            now,
            connectionType: 'mcp',
          });
        }
      } else {
        // Disconnected agent → reactivate
        return this.reactivateAgent(existing.id, {
          agentType,
          processId,
          cwd,
          sessionId,
          now,
          connectionType: 'mcp',
        });
      }
    }

    // 2. No reconnectable agent found — enforce main uniqueness (per-project scope)
    if (role === 'main') {
      // Build query conditions: role=main, status=active, scoped by projectId
      const mainConditions = projectId
        ? and(eq(agents.role, 'main'), eq(agents.status, 'active'), eq(agents.projectId, projectId))
        : and(eq(agents.role, 'main'), eq(agents.status, 'active'));

      const existingMain = this.db.select().from(agents).where(mainConditions).get();

      if (existingMain) {
        const mainAlive = existingMain.processId ? isProcessAlive(existingMain.processId) : false;
        if (mainAlive) {
          const scopeMsg = projectId ? ` for project ${projectId}` : '';
          throw new ATCError('MAIN_ALREADY_ACTIVE', `Main agent already active${scopeMsg}`, 409);
        }
        // Dead main → disconnect it
        await this.disconnectById(existingMain.id, 'process_dead');
      }
    }

    // 3. Create new agent
    const agentId = uuidv4();
    const agentToken = uuidv4();

    this.db
      .insert(agents)
      .values({
        id: agentId,
        name,
        role,
        agentType: agentType ?? null,
        connectionType: 'mcp',
        agentToken,
        status: 'active',
        connectedAt: now,
        lastHeartbeat: now,
        processId: processId ?? null,
        cwd: cwd ?? null,
        sessionId: sessionId ?? null,
        workspaceMode: workspaceMode ?? 'disabled',
        projectId: projectId ?? null,
      })
      .run();

    await this.eventBus.publish('AGENT_CONNECTED', {
      agentId,
      payload: { name, role, agentType, processId, cwd, sessionId, reconnected: false },
    });

    return { agentId, agentToken, role, reconnected: false };
  }

  /**
   * Reactivate a disconnected/stale agent — preserves ID and task history.
   */
  private async reactivateAgent(
    agentId: string,
    opts: {
      agentType?: string;
      processId?: number;
      cwd?: string;
      sessionId?: string;
      name?: string;
      role?: 'main' | 'worker';
      connectionType?: 'mcp' | 'opencode';
      now: string;
    },
  ): Promise<RegisterAgentResult> {
    const newToken = uuidv4();
    const setData: Record<string, unknown> = {
      agentToken: newToken,
      status: 'active',
      lastHeartbeat: opts.now,
    };

    if (opts.processId !== undefined) setData.processId = opts.processId;
    if (opts.cwd !== undefined) setData.cwd = opts.cwd;
    if (opts.agentType !== undefined) setData.agentType = opts.agentType;
    if (opts.sessionId !== undefined) setData.sessionId = opts.sessionId;
    if (opts.name !== undefined) setData.name = opts.name;
    if (opts.role !== undefined) setData.role = opts.role;
    if (opts.connectionType !== undefined) setData.connectionType = opts.connectionType;

    this.db.update(agents).set(setData).where(eq(agents.id, agentId)).run();

    const agent = this.db.select().from(agents).where(eq(agents.id, agentId)).get();

    await this.eventBus.publish('AGENT_CONNECTED', {
      agentId,
      payload: {
        name: agent!.name,
        role: agent!.role,
        agentType: opts.agentType,
        processId: opts.processId,
        cwd: opts.cwd,
        reconnected: true,
      },
    });

    return {
      agentId,
      agentToken: newToken,
      role: agent!.role as 'main' | 'worker',
      reconnected: true,
    };
  }

  /**
   * Update heartbeat timestamp for an agent.
   * Still useful for main agents to retrieve pending events.
   * No longer used for health determination.
   */
  heartbeat(agentToken: string): Agent {
    const agent = this.getByToken(agentToken);
    const now = new Date().toISOString();

    this.db.update(agents).set({ lastHeartbeat: now }).where(eq(agents.id, agent.id)).run();

    return { ...agent, lastHeartbeat: now };
  }

  /**
   * Disconnect an agent (graceful).
   */
  async disconnect(agentToken: string): Promise<void> {
    const agent = this.getByToken(agentToken);

    this.db.update(agents).set({ status: 'disconnected' }).where(eq(agents.id, agent.id)).run();

    await this.eventBus.publish('AGENT_DISCONNECTED', {
      agentId: agent.id,
      payload: { reason: 'graceful_disconnect' },
    });
  }

  /**
   * Disconnect an agent by ID and release all its task locks.
   * Used for process-based cleanup when MCP stdio process terminates.
   */
  async disconnectById(agentId: string, reason = 'process_terminated'): Promise<void> {
    const agent = this.db.select().from(agents).where(eq(agents.id, agentId)).get();

    if (!agent || agent.status === 'disconnected') {
      return; // Already disconnected or doesn't exist
    }

    const now = new Date().toISOString();

    // 1. Set agent status to disconnected
    this.db.update(agents).set({ status: 'disconnected' }).where(eq(agents.id, agentId)).run();

    // 2. Find and release all task locks held by this agent
    const agentLocks = this.db.select().from(taskLocks).where(eq(taskLocks.agentId, agentId)).all();

    for (const lock of agentLocks) {
      this.db.delete(taskLocks).where(eq(taskLocks.taskId, lock.taskId)).run();

      this.db
        .update(tasks)
        .set({ status: 'todo', assignedAgentId: null, updatedAt: now })
        .where(eq(tasks.id, lock.taskId))
        .run();

      await this.eventBus.publish('TASK_RELEASED', {
        taskId: lock.taskId,
        agentId,
        payload: { reason },
      });
    }

    await this.eventBus.publish('AGENT_DISCONNECTED', {
      agentId,
      payload: { reason, releasedTasks: agentLocks.map((l) => l.taskId) },
    });
  }

  /**
   * Remove an agent from the database entirely.
   * If active, disconnects first (releases locks). Then deletes the row.
   */
  async removeById(agentId: string): Promise<void> {
    const agent = this.db.select().from(agents).where(eq(agents.id, agentId)).get();
    if (!agent) return;

    // Disconnect first if still active (releases locks + publishes events)
    if (agent.status === 'active') {
      await this.disconnectById(agentId, 'manual_removal');
    }

    // Clean up all FK references before deleting the agent row
    this.db
      .update(tasks)
      .set({ assignedAgentId: null })
      .where(eq(tasks.assignedAgentId, agentId))
      .run();
    this.db.delete(taskComments).where(eq(taskComments.agentId, agentId)).run();
    this.db.delete(progressLogs).where(eq(progressLogs.agentId, agentId)).run();
    this.db.update(workspaces).set({ agentId: null }).where(eq(workspaces.agentId, agentId)).run();

    // Delete agent row from DB
    this.db.delete(agents).where(eq(agents.id, agentId)).run();
  }

  /**
   * Get agent by token (validates existence + active status).
   */
  getByToken(agentToken: string): Agent {
    const agent = this.db.select().from(agents).where(eq(agents.agentToken, agentToken)).get();

    if (!agent) {
      throw new ATCError('AGENT_NOT_FOUND', 'Agent not found', 404);
    }

    if (agent.status !== 'active') {
      throw new ATCError('AGENT_DISCONNECTED', 'Agent is disconnected', 403);
    }

    return this.mapAgent(agent);
  }

  /**
   * List all agents with extended info.
   */
  listAgents(): AgentInfo[] {
    const allAgents = this.db.select().from(agents).all();

    return allAgents.map((agent) => {
      // Find current task lock
      const lock = this.db.select().from(taskLocks).where(eq(taskLocks.agentId, agent.id)).get();

      let currentTaskId: string | null = null;
      let currentTaskTitle: string | null = null;

      if (lock) {
        const task = this.db
          .select({ title: tasks.title })
          .from(tasks)
          .where(eq(tasks.id, lock.taskId))
          .get();
        currentTaskId = lock.taskId;
        currentTaskTitle = task?.title ?? null;
      }

      // Count completed and failed tasks
      const completed = this.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.assignedAgentId, agent.id), eq(tasks.status, 'done')))
        .all().length;

      const failed = this.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.assignedAgentId, agent.id), eq(tasks.status, 'failed')))
        .all().length;

      return {
        ...this.mapAgent(agent),
        currentTaskId,
        currentTaskTitle,
        tasksCompleted: completed,
        tasksFailed: failed,
      };
    });
  }

  /**
   * Check process health for all active agents.
   * Uses OS-level PID checking — no heartbeat needed.
   * Agents whose process has died are disconnected and their locks released.
   */
  async checkHealth(): Promise<void> {
    const activeAgents = this.db.select().from(agents).where(eq(agents.status, 'active')).all();

    for (const agent of activeAgents) {
      if (agent.connectionType === 'opencode') {
        // OpenCode agents: PID check first (fastest, most reliable), then HTTP fallback
        if (agent.processId != null && !isProcessAlive(agent.processId)) {
          // PID is known and process is dead — disconnect immediately
          await this.disconnectById(agent.id, 'process_dead');
          continue;
        }

        // HTTP health check (for agents without PID or as additional validation)
        if (agent.serverUrl) {
          try {
            const res = await fetch(`${agent.serverUrl}/global/health`, {
              signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) {
              await this.disconnectById(agent.id, 'health_check_failed');
            } else {
              // Update heartbeat on successful health check
              this.db
                .update(agents)
                .set({ lastHeartbeat: new Date().toISOString() })
                .where(eq(agents.id, agent.id))
                .run();
            }
          } catch {
            await this.disconnectById(agent.id, 'health_check_failed');
          }
        }
      } else {
        // MCP agents: PID-based health check
        if (agent.processId == null) continue;
        if (!isProcessAlive(agent.processId)) {
          await this.disconnectById(agent.id, 'process_dead');
        }
      }
    }
  }

  /**
   * Register an OpenCode agent from dashboard UI.
   * Creates agent with connectionType='opencode' and serverUrl.
   */
  async registerOpenCodeAgent(input: RegisterOpenCodeAgentInput): Promise<Agent> {
    const now = new Date().toISOString();

    // Check for existing agent with same serverUrl to reconnect
    const existing = this.db
      .select()
      .from(agents)
      .where(eq(agents.serverUrl, input.serverUrl))
      .get();

    if (existing) {
      // Reactivate existing agent with same serverUrl
      const newToken = uuidv4();
      this.db
        .update(agents)
        .set({
          name: input.name,
          agentToken: newToken,
          status: 'active',
          lastHeartbeat: now,
          ...(input.cwd ? { cwd: input.cwd } : {}),
          ...(input.processId != null ? { processId: input.processId } : {}),
        })
        .where(eq(agents.id, existing.id))
        .run();

      await this.eventBus.publish('AGENT_CONNECTED', {
        agentId: existing.id,
        payload: { name: input.name, connectionType: 'opencode', reconnected: true },
      });

      return this.getById(existing.id);
    }

    const inputPort = extractPort(input.serverUrl);

    if (inputPort !== null) {
      const agentsWithServerUrl = this.db
        .select()
        .from(agents)
        .all()
        .filter((agent) => agent.serverUrl !== null);

      const byPort = agentsWithServerUrl.find((agent) => {
        if (!agent.serverUrl) return false;
        return extractPort(agent.serverUrl) === inputPort;
      });

      if (byPort) {
        const newToken = uuidv4();
        const setData: Record<string, unknown> = {
          serverUrl: input.serverUrl,
          agentToken: newToken,
          status: 'active',
          lastHeartbeat: now,
        };

        if (input.name !== undefined) setData.name = input.name;
        if (input.cwd !== undefined) setData.cwd = input.cwd;
        if (input.processId != null) setData.processId = input.processId;

        this.db.update(agents).set(setData).where(eq(agents.id, byPort.id)).run();

        await this.eventBus.publish('AGENT_CONNECTED', {
          agentId: byPort.id,
          payload: {
            name: input.name ?? byPort.name,
            connectionType: 'opencode',
            reconnected: true,
          },
        });

        return this.getById(byPort.id);
      }
    }

    // Create new OpenCode agent
    const agentId = uuidv4();
    const agentToken = uuidv4();

    this.db
      .insert(agents)
      .values({
        id: agentId,
        name: input.name,
        role: 'worker',
        agentType: 'opencode',
        connectionType: 'opencode',
        serverUrl: input.serverUrl,
        agentToken,
        status: 'active',
        connectedAt: now,
        lastHeartbeat: now,
        cwd: input.cwd ?? null,
        processId: input.processId ?? null,
        workspaceMode: 'disabled',
      })
      .run();

    await this.eventBus.publish('AGENT_CONNECTED', {
      agentId,
      payload: { name: input.name, connectionType: 'opencode', reconnected: false },
    });

    return this.getById(agentId);
  }

  /**
   * Update the CWD (working directory) of an agent.
   */
  updateCwd(agentId: string, cwd: string): void {
    this.db.update(agents).set({ cwd }).where(eq(agents.id, agentId)).run();
  }
  /**
   * Update the session info (CWD and session title) of an agent.
   */
  updateSessionInfo(
    agentId: string,
    info: { cwd?: string; sessionId?: string | null; sessionTitle?: string | null },
  ): void {
    const setData: Record<string, unknown> = {};
    if (info.cwd !== undefined) setData.cwd = info.cwd;
    if (info.sessionId !== undefined) setData.sessionId = info.sessionId;
    if (info.sessionTitle !== undefined) setData.sessionTitle = info.sessionTitle;
    if (Object.keys(setData).length === 0) return;
    this.db.update(agents).set(setData).where(eq(agents.id, agentId)).run();
  }
  /**
   * Check health of a specific OpenCode agent via HTTP.
   */
  async checkOpenCodeHealth(agentId: string): Promise<Agent> {
    const agent = this.getById(agentId);
    if (agent.connectionType !== 'opencode' || !agent.serverUrl) {
      throw new ATCError('NOT_OPENCODE', 'Agent is not an OpenCode agent', 400);
    }

    try {
      const res = await fetch(`${agent.serverUrl}/global/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const now = new Date().toISOString();
      const newStatus: AgentStatus = res.ok ? 'active' : 'disconnected';
      this.db
        .update(agents)
        .set({ status: newStatus, lastHeartbeat: now })
        .where(eq(agents.id, agentId))
        .run();
      return { ...agent, status: newStatus, lastHeartbeat: now };
    } catch {
      const now = new Date().toISOString();
      this.db
        .update(agents)
        .set({ status: 'disconnected', lastHeartbeat: now })
        .where(eq(agents.id, agentId))
        .run();
      return { ...agent, status: 'disconnected', lastHeartbeat: now };
    }
  }

  /**
   * Reconnect an existing OpenCode agent to a new server URL.
   * Used when an OpenCode instance restarts on a different port.
   */
  async reconnectOpenCodeAgent(
    agentId: string,
    serverUrl: string,
    opts?: { cwd?: string; processId?: number },
  ): Promise<Agent> {
    const agent = this.getById(agentId);
    const now = new Date().toISOString();
    const setData: Record<string, unknown> = {
      serverUrl,
      status: 'active',
      lastHeartbeat: now,
    };
    if (opts?.cwd) setData.cwd = opts.cwd;
    if (opts?.processId) setData.processId = opts.processId;

    this.db.update(agents).set(setData).where(eq(agents.id, agentId)).run();

    await this.eventBus.publish('AGENT_CONNECTED', {
      agentId,
      payload: {
        name: agent.name,
        connectionType: 'opencode',
        reconnected: true,
        previousServerUrl: agent.serverUrl,
        newServerUrl: serverUrl,
      },
    });

    return this.getById(agentId);
  }

  /**
   * Rename an agent.
   */
  async renameAgent(agentId: string, newName: string): Promise<Agent> {
    const agent = this.getById(agentId);

    this.db.update(agents).set({ name: newName }).where(eq(agents.id, agentId)).run();

    await this.eventBus.publish('AGENT_CONNECTED', {
      agentId,
      payload: { name: newName, previousName: agent.name, renamed: true },
    });

    return { ...agent, name: newName };
  }

  /**
   * Update an agent's role (main ↔ worker).
   * Enforces max-one-active-main invariant:
   * - If promoting to 'main', demote any existing active main to 'worker' first.
   */
  async updateRole(agentId: string, role: 'main' | 'worker'): Promise<Agent> {
    const agent = this.getById(agentId);

    if (agent.role === role) {
      return agent;
    }

    if (role === 'main') {
      // Scope main uniqueness by projectId (same as register)
      const mainConditions = agent.projectId
        ? and(
            eq(agents.role, 'main'),
            eq(agents.status, 'active'),
            eq(agents.projectId, agent.projectId),
          )
        : and(eq(agents.role, 'main'), eq(agents.status, 'active'));

      const existingMain = this.db.select().from(agents).where(mainConditions).get();

      if (existingMain && existingMain.id !== agentId) {
        this.db.update(agents).set({ role: 'worker' }).where(eq(agents.id, existingMain.id)).run();

        await this.eventBus.publish('AGENT_CONNECTED', {
          agentId: existingMain.id,
          payload: { name: existingMain.name, role: 'worker', demoted: true },
        });
      }
    }

    this.db.update(agents).set({ role }).where(eq(agents.id, agentId)).run();

    await this.eventBus.publish('AGENT_CONNECTED', {
      agentId,
      payload: { name: agent.name, role, promoted: role === 'main' },
    });

    return { ...agent, role };
  }

  /**
   * Get agent by ID.
   */
  getById(agentId: string): Agent {
    const agent = this.db.select().from(agents).where(eq(agents.id, agentId)).get();
    if (!agent) {
      throw new ATCError('AGENT_NOT_FOUND', `Agent ${agentId} not found`, 404);
    }
    return this.mapAgent(agent);
  }

  /**
   * Map a raw DB agent row to the Agent interface.
   */
  private mapAgent(row: typeof agents.$inferSelect): Agent {
    return {
      id: row.id,
      name: row.name,
      role: row.role as 'main' | 'worker',
      agentType: row.agentType,
      connectionType: (row.connectionType ?? 'mcp') as ConnectionType,
      serverUrl: row.serverUrl ?? null,
      agentToken: row.agentToken,
      status: row.status as AgentStatus,
      connectedAt: row.connectedAt,
      lastHeartbeat: row.lastHeartbeat,
      processId: row.processId,
      cwd: row.cwd,
      sessionId: row.sessionId ?? null,
      sessionTitle: row.sessionTitle ?? null,
      spawnedPid: row.spawnedPid ?? null,
      workspaceMode: (row.workspaceMode ?? 'disabled') as WorkspaceMode,
      projectId: row.projectId ?? null,
    };
  }
}
