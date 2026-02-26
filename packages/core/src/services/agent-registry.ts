import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { getConnection } from '../db/connection.js';
import { agents, taskLocks, tasks } from '../db/schema.js';
import type { Agent, AgentInfo, RegisterAgentInput, RegisterAgentResult } from '../types.js';
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

export class AgentRegistry {
  private db: DbType;
  private eventBus: EventBus;

  constructor(db: DbType, eventBus: EventBus) {
    this.db = db;
    this.eventBus = eventBus;
  }

  /**
   * Register a new agent. If role=main, enforces uniqueness.
   */
  async register(input: RegisterAgentInput): Promise<RegisterAgentResult> {
    const { name, role, agentType, processId } = input;
    const agentId = uuidv4();
    const agentToken = uuidv4();
    const now = new Date().toISOString();

    if (role === 'main') {
      // Check if an active main exists
      const existingMain = this.db
        .select()
        .from(agents)
        .where(and(eq(agents.role, 'main'), eq(agents.status, 'active')))
        .get();

      if (existingMain) {
        // Check if existing main's process is still alive
        const mainAlive = existingMain.processId ? isProcessAlive(existingMain.processId) : false; // no PID → can't verify → allow replacement

        if (mainAlive) {
          throw new ATCError('MAIN_ALREADY_ACTIVE', 'Main agent already active', 409);
        }

        // Process is dead → force disconnect stale main
        this.db
          .update(agents)
          .set({ status: 'disconnected' })
          .where(eq(agents.id, existingMain.id))
          .run();

        await this.eventBus.publish('AGENT_DISCONNECTED', {
          agentId: existingMain.id,
          payload: { reason: 'process_dead', replacedBy: agentId },
        });
      }
    }

    this.db
      .insert(agents)
      .values({
        id: agentId,
        name,
        role,
        agentType: agentType ?? null,
        agentToken,
        status: 'active',
        connectedAt: now,
        lastHeartbeat: now,
        processId: processId ?? null,
      })
      .run();

    await this.eventBus.publish('AGENT_CONNECTED', {
      agentId,
      payload: { name, role, agentType, processId },
    });

    return { agentId, agentToken, role };
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

    return {
      id: agent.id,
      name: agent.name,
      role: agent.role as 'main' | 'worker',
      agentType: agent.agentType,
      agentToken: agent.agentToken,
      status: agent.status as 'active' | 'disconnected',
      connectedAt: agent.connectedAt,
      lastHeartbeat: agent.lastHeartbeat,
      processId: agent.processId,
    };
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
        id: agent.id,
        name: agent.name,
        role: agent.role as 'main' | 'worker',
        agentType: agent.agentType,
        agentToken: agent.agentToken,
        status: agent.status as 'active' | 'disconnected',
        connectedAt: agent.connectedAt,
        lastHeartbeat: agent.lastHeartbeat,
        processId: agent.processId,
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
  async checkProcessHealth(): Promise<void> {
    const activeAgents = this.db.select().from(agents).where(eq(agents.status, 'active')).all();

    for (const agent of activeAgents) {
      if (agent.processId == null) {
        // No PID recorded (e.g., HTTP-mode agent) — skip PID check
        continue;
      }

      if (!isProcessAlive(agent.processId)) {
        // Process is dead → disconnect + release locks
        await this.disconnectById(agent.id, 'process_dead');
      }
    }
  }
}
