import { eq, and, lt } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { tasks, taskLocks, progressLogs } from '../db/schema.js';
import { getRawDb, type getConnection } from '../db/connection.js';
import type { EventBus } from './event-bus.js';
import type { DependencyResolver } from './dependency-resolver.js';
import type { WorkspaceService } from './workspace-service.js';
import type { ClaimResult, TaskDetail, TaskStatus } from '../types.js';
import { ATCError } from '../types.js';

type DbType = ReturnType<typeof getConnection>;

export class LockEngine {
  private db: DbType;
  private eventBus: EventBus;
  private dependencyResolver: DependencyResolver;
  private lockTtlMinutes: number;
  private expiryInterval: ReturnType<typeof setInterval> | null = null;
  private workspaceService: WorkspaceService | null = null;

  constructor(
    db: DbType,
    eventBus: EventBus,
    dependencyResolver: DependencyResolver,
    lockTtlMinutes: number = 30,
  ) {
    this.db = db;
    this.eventBus = eventBus;
    this.dependencyResolver = dependencyResolver;
    this.lockTtlMinutes = lockTtlMinutes;
  }

  /**
   * Inject WorkspaceService for workspace validation during task claims.
   * Called after service container is assembled to avoid circular deps.
   */
  setWorkspaceService(ws: WorkspaceService): void {
    this.workspaceService = ws;
  }

  /**
   * Claim a task atomically using SQLite BEGIN IMMEDIATE.
   */
  async claimTask(agentId: string, taskId: string, agentCwd?: string): Promise<ClaimResult> {
    const raw = getRawDb();
    const lockToken = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.lockTtlMinutes * 60 * 1000).toISOString();

    // Workspace validation: workers must be in a registered workspace
    let claimedWorkspace: { worktreePath: string; branchName: string } | undefined;
    if (agentCwd && this.workspaceService) {
      const workspace = this.workspaceService.findWorkspaceForCwd(agentCwd);
      if (!workspace) {
        throw new ATCError(
          'WORKSPACE_NOT_FOUND',
          `No registered workspace found for agent directory: ${agentCwd}. Register a workspace first.`,
          403,
        );
      }
      // Create a worktree for this task
      const worktree = await this.workspaceService.createWorktreeForTask(
        workspace.repoRoot,
        workspace.baseBranch,
        taskId,
        agentId,
      );
      claimedWorkspace = { worktreePath: worktree.worktreePath, branchName: worktree.branchName };
    }

    // Use raw SQLite transaction for atomicity
    const claimTxn = raw.transaction(() => {
      // 1. Check task exists
      const task = raw
        .prepare('SELECT id, status, assigned_agent_id FROM tasks WHERE id = ?')
        .get(taskId) as
        | { id: string; status: string; assigned_agent_id: string | null }
        | undefined;

      if (!task) {
        throw new ATCError('TASK_NOT_FOUND', `Task ${taskId} does not exist`);
      }

      // 2. Determine if task is claimable
      let needsForceRelease = false;

      if (task.status === 'todo') {
        // Direct claim — standard path
      } else if (
        (task.status === 'in_progress' || task.status === 'locked') &&
        task.assigned_agent_id
      ) {
        // Check if the assigned agent is disconnected
        const assignedAgent = raw
          .prepare('SELECT id, status FROM agents WHERE id = ?')
          .get(task.assigned_agent_id) as { id: string; status: string } | undefined;

        if (assignedAgent && assignedAgent.status === 'disconnected') {
          // Agent is offline — allow takeover
          needsForceRelease = true;
        } else {
          throw new ATCError(
            'TASK_NOT_CLAIMABLE',
            `Task ${taskId} is '${task.status}' and assigned to an active agent`,
          );
        }
      } else {
        throw new ATCError(
          'TASK_NOT_CLAIMABLE',
          `Task ${taskId} is in '${task.status}' status and cannot be claimed`,
        );
      }

      // 3. Check dependencies
      const unmetDeps = raw
        .prepare(
          `SELECT COUNT(*) as cnt FROM task_dependencies d
           JOIN tasks t ON d.depends_on = t.id
           WHERE d.task_id = ? AND t.status != 'done'`,
        )
        .get(taskId) as { cnt: number };

      if (unmetDeps.cnt > 0) {
        throw new ATCError('DEPENDENCY_NOT_MET', `Task ${taskId} has unmet dependencies`);
      }

      // 4. Force-release existing lock if taking over from disconnected agent
      if (needsForceRelease) {
        raw.prepare('DELETE FROM task_locks WHERE task_id = ?').run(taskId);
      } else {
        // Verify no existing lock for todo tasks
        const existingLock = raw
          .prepare('SELECT task_id FROM task_locks WHERE task_id = ?')
          .get(taskId);

        if (existingLock) {
          throw new ATCError('ALREADY_LOCKED', `Task ${taskId} is already locked`);
        }
      }

      // 5. Create lock
      raw
        .prepare(
          'INSERT INTO task_locks (task_id, agent_id, lock_token, locked_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(taskId, agentId, lockToken, now, expiresAt);

      // 6. Update task status
      raw
        .prepare('UPDATE tasks SET status = ?, assigned_agent_id = ?, updated_at = ? WHERE id = ?')
        .run('in_progress', agentId, now, taskId);
    });

    claimTxn();

    // Emit event through EventBus (for WebSocket broadcasting)
    await this.eventBus.publish('TASK_CLAIMED', {
      taskId,
      agentId,
      payload: { lockToken },
    });

    // Build task detail
    const taskDetail = this.getTaskDetail(taskId);

    return { lockToken, task: taskDetail, workspace: claimedWorkspace };
  }

  /**
   * Update task status. Requires valid lock token.
   */
  async updateStatus(lockToken: string, taskId: string, status: TaskStatus): Promise<TaskDetail> {
    this.validateLock(lockToken, taskId);
    const now = new Date().toISOString();

    const validTransitions: Record<string, TaskStatus[]> = {
      in_progress: ['review', 'done', 'failed'],
      review: [], // Only main can change review status
    };

    const task = this.db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!task) {
      throw new ATCError('TASK_NOT_FOUND', `Task ${taskId} not found`, 404);
    }

    const allowed = validTransitions[task.status] || [];
    if (!allowed.includes(status)) {
      throw new ATCError(
        'INVALID_TRANSITION',
        `Cannot transition from '${task.status}' to '${status}'`,
      );
    }

    this.db.update(tasks).set({ status, updatedAt: now }).where(eq(tasks.id, taskId)).run();

    // If done or failed, release the lock
    if (status === 'done' || status === 'failed') {
      this.db.delete(taskLocks).where(eq(taskLocks.taskId, taskId)).run();
    }

    await this.eventBus.publish('STATUS_CHANGED', {
      taskId,
      agentId: task.assignedAgentId ?? undefined,
      payload: { oldStatus: task.status, newStatus: status },
    });

    return this.getTaskDetail(taskId);
  }

  /**
   * Report progress on a task. Also refreshes lock expiry.
   */
  async reportProgress(
    lockToken: string,
    taskId: string,
    agentId: string,
    message: string,
  ): Promise<void> {
    this.validateLock(lockToken, taskId);
    const now = new Date().toISOString();
    const newExpiresAt = new Date(Date.now() + this.lockTtlMinutes * 60 * 1000).toISOString();

    // Refresh lock expiry
    this.db
      .update(taskLocks)
      .set({ expiresAt: newExpiresAt })
      .where(eq(taskLocks.lockToken, lockToken))
      .run();

    // Record progress
    this.db
      .insert(progressLogs)
      .values({
        taskId,
        agentId,
        message,
        createdAt: now,
      })
      .run();

    await this.eventBus.publish('PROGRESS_REPORTED', {
      taskId,
      agentId,
      payload: { message },
    });
  }

  /**
   * Release a task (worker gives up). Returns to todo.
   */
  async releaseTask(lockToken: string, taskId: string, reason?: string): Promise<void> {
    const lock = this.validateLock(lockToken, taskId);
    const now = new Date().toISOString();

    this.db.delete(taskLocks).where(eq(taskLocks.taskId, taskId)).run();

    this.db
      .update(tasks)
      .set({ status: 'todo', assignedAgentId: null, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .run();

    await this.eventBus.publish('TASK_RELEASED', {
      taskId,
      agentId: lock.agentId,
      payload: { reason: reason || 'voluntary_release' },
    });
  }

  /**
   * Force release a task (main agent action).
   */
  async forceRelease(taskId: string): Promise<void> {
    const lock = this.db.select().from(taskLocks).where(eq(taskLocks.taskId, taskId)).get();

    if (!lock) {
      throw new ATCError('NO_LOCK', `Task ${taskId} is not locked`);
    }

    const now = new Date().toISOString();

    this.db.delete(taskLocks).where(eq(taskLocks.taskId, taskId)).run();

    this.db
      .update(tasks)
      .set({ status: 'todo', assignedAgentId: null, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .run();

    await this.eventBus.publish('TASK_RELEASED', {
      taskId,
      agentId: lock.agentId,
      payload: { reason: 'force_released' },
    });
  }

  /**
   * Review a task (main agent action).
   */
  async reviewTask(
    taskId: string,
    verdict: 'approve' | 'reject',
    comment?: string,
    reviewerAgentId?: string,
  ): Promise<void> {
    const task = this.db.select().from(tasks).where(eq(tasks.id, taskId)).get();

    if (!task) {
      throw new ATCError('TASK_NOT_FOUND', `Task ${taskId} not found`, 404);
    }

    if (task.status !== 'review') {
      throw new ATCError(
        'INVALID_STATUS',
        `Task ${taskId} is not in 'review' status (current: ${task.status})`,
      );
    }

    const now = new Date().toISOString();
    const newStatus: TaskStatus = verdict === 'approve' ? 'done' : 'todo';

    this.db
      .update(tasks)
      .set({
        status: newStatus,
        assignedAgentId: newStatus === 'todo' ? null : task.assignedAgentId,
        updatedAt: now,
      })
      .where(eq(tasks.id, taskId))
      .run();

    // Release lock if exists
    this.db.delete(taskLocks).where(eq(taskLocks.taskId, taskId)).run();

    // Add review comment if provided
    if (comment && reviewerAgentId) {
      this.db
        .insert(progressLogs)
        .values({
          taskId,
          agentId: reviewerAgentId,
          message: `[Review ${verdict}] ${comment}`,
          createdAt: now,
        })
        .run();
    }

    await this.eventBus.publish('TASK_REVIEWED', {
      taskId,
      agentId: reviewerAgentId,
      payload: { verdict, comment, oldStatus: 'review', newStatus },
    });
  }

  /**
   * Check and expire stale locks. Run periodically.
   */
  async checkExpiredLocks(): Promise<void> {
    const now = new Date().toISOString();

    const expiredLocks = this.db.select().from(taskLocks).where(lt(taskLocks.expiresAt, now)).all();

    for (const lock of expiredLocks) {
      this.db.delete(taskLocks).where(eq(taskLocks.taskId, lock.taskId)).run();

      this.db
        .update(tasks)
        .set({ status: 'todo', assignedAgentId: null, updatedAt: now })
        .where(eq(tasks.id, lock.taskId))
        .run();

      await this.eventBus.publish('LOCK_EXPIRED', {
        taskId: lock.taskId,
        agentId: lock.agentId,
        payload: { expiredAt: lock.expiresAt },
      });
    }
  }

  /**
   * Start periodic lock expiry checker.
   */
  startExpiryChecker(intervalMs: number = 30000): void {
    this.expiryInterval = setInterval(() => {
      this.checkExpiredLocks().catch(console.error);
    }, intervalMs);
  }

  /**
   * Stop periodic lock expiry checker.
   */
  stopExpiryChecker(): void {
    if (this.expiryInterval) {
      clearInterval(this.expiryInterval);
      this.expiryInterval = null;
    }
  }

  /**
   * Validate a lock token against a task.
   */
  private validateLock(lockToken: string, taskId: string) {
    const lock = this.db
      .select()
      .from(taskLocks)
      .where(and(eq(taskLocks.lockToken, lockToken), eq(taskLocks.taskId, taskId)))
      .get();

    if (!lock) {
      throw new ATCError('INVALID_LOCK', 'Invalid or expired lock token', 403);
    }

    if (new Date(lock.expiresAt) < new Date()) {
      throw new ATCError('LOCK_EXPIRED', 'Lock has expired', 403);
    }

    return lock;
  }

  private getTaskDetail(taskId: string): TaskDetail {
    const row = this.db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!row) throw new ATCError('TASK_NOT_FOUND', `Task ${taskId} not found`, 404);

    const dependsOn = this.dependencyResolver.getDependencies(taskId);
    const blockedBy = this.dependencyResolver.getBlockedBy(taskId);

    const comments = this.db
      .select()
      .from(progressLogs)
      .where(eq(progressLogs.taskId, taskId))
      .all()
      .filter((r) => r.message.startsWith('[Review'))
      .map((r) => ({
        id: r.id,
        taskId: r.taskId,
        agentId: r.agentId,
        content: r.message,
        createdAt: r.createdAt,
      }));

    const logs = this.db
      .select()
      .from(progressLogs)
      .where(eq(progressLogs.taskId, taskId))
      .all()
      .map((r) => ({
        id: r.id,
        taskId: r.taskId,
        agentId: r.agentId,
        message: r.message,
        createdAt: r.createdAt,
      }));

    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      description: row.description,
      status: row.status as TaskDetail['status'],
      priority: row.priority as TaskDetail['priority'],
      labels: row.labels ? JSON.parse(row.labels) : [],
      assignedAgentId: row.assignedAgentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      dependsOn,
      blockedBy,
      comments,
      progressLogs: logs,
    };
  }
}
