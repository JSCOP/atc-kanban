import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { agents, taskLocks, tasks } from '../db/schema.js';
import type { getConnection } from '../db/connection.js';
import type { EventBus } from './event-bus.js';
import type { Agent, AgentInfo, RegisterAgentInput, RegisterAgentResult } from '../types.js';
import { ATCError } from '../types.js';

type DbType = ReturnType<typeof getConnection>;

export class AgentRegistry {
  private db: DbType;
  private eventBus: EventBus;
  private heartbeatTimeoutMs: number;

  constructor(db: DbType, eventBus: EventBus, heartbeatTimeoutSeconds: number = 60) {
    this.db = db;
    this.eventBus = eventBus;
    this.heartbeatTimeoutMs = heartbeatTimeoutSeconds * 1000;
  }

  /**
   * Register a new agent. If role=main, enforces uniqueness.
   */
  async register(input: RegisterAgentInput): Promise<RegisterAgentResult> {
    const { name, role, agentType } = input;
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
        // Check if heartbeat expired
        const lastBeat = new Date(existingMain.lastHeartbeat).getTime();
        const elapsed = Date.now() - lastBeat;

        if (elapsed > this.heartbeatTimeoutMs) {
          // Force disconnect stale main
          this.db
            .update(agents)
            .set({ status: 'disconnected' })
            .where(eq(agents.id, existingMain.id))
            .run();

          await this.eventBus.publish('AGENT_DISCONNECTED', {
            agentId: existingMain.id,
            payload: { reason: 'heartbeat_expired', replacedBy: agentId },
          });
        } else {
          throw new ATCError('MAIN_ALREADY_ACTIVE', 'Main agent already active', 409);
        }
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
      })
      .run();

    await this.eventBus.publish('AGENT_CONNECTED', {
      agentId,
      payload: { name, role, agentType },
    });

    return { agentId, agentToken, role };
  }

  /**
   * Update heartbeat timestamp for an agent.
   */
  heartbeat(agentToken: string): Agent {
    const agent = this.getByToken(agentToken);
    const now = new Date().toISOString();

    this.db
      .update(agents)
      .set({ lastHeartbeat: now })
      .where(eq(agents.id, agent.id))
      .run();

    return { ...agent, lastHeartbeat: now };
  }

  /**
   * Disconnect an agent (graceful).
   */
  async disconnect(agentToken: string): Promise<void> {
    const agent = this.getByToken(agentToken);

    this.db
      .update(agents)
      .set({ status: 'disconnected' })
      .where(eq(agents.id, agent.id))
      .run();

    await this.eventBus.publish('AGENT_DISCONNECTED', {
      agentId: agent.id,
      payload: { reason: 'graceful_disconnect' },
    });
  }

  /**
   * Get agent by token (validates existence + active status).
   */
  getByToken(agentToken: string): Agent {
    const agent = this.db
      .select()
      .from(agents)
      .where(eq(agents.agentToken, agentToken))
      .get();

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
    };
  }

  /**
   * List all agents with extended info.
   */
  listAgents(): AgentInfo[] {
    const allAgents = this.db.select().from(agents).all();

    return allAgents.map((agent) => {
      // Find current task lock
      const lock = this.db
        .select()
        .from(taskLocks)
        .where(eq(taskLocks.agentId, agent.id))
        .get();

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
        currentTaskId,
        currentTaskTitle,
        tasksCompleted: completed,
        tasksFailed: failed,
      };
    });
  }

  /**
   * Check and disconnect agents with expired heartbeats.
   */
  async checkHeartbeats(): Promise<void> {
    const cutoff = new Date(Date.now() - this.heartbeatTimeoutMs).toISOString();
    const staleAgents = this.db
      .select()
      .from(agents)
      .where(and(eq(agents.status, 'active')))
      .all()
      .filter((a) => a.lastHeartbeat < cutoff);

    for (const agent of staleAgents) {
      this.db
        .update(agents)
        .set({ status: 'disconnected' })
        .where(eq(agents.id, agent.id))
        .run();

      await this.eventBus.publish('AGENT_DISCONNECTED', {
        agentId: agent.id,
        payload: { reason: 'heartbeat_expired' },
      });
    }
  }
}
