import { eq, and, inArray, like, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { tasks, taskDependencies, taskComments, progressLogs } from '../db/schema.js';
import type { getConnection } from '../db/connection.js';
import type { EventBus } from './event-bus.js';
import type { DependencyResolver } from './dependency-resolver.js';
import type {
  Task,
  TaskDetail,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
  TaskComment,
  ProgressLog,
  BoardSummary,
} from '../types.js';
import { ATCError } from '../types.js';
import type { AgentRegistry } from './agent-registry.js';

type DbType = ReturnType<typeof getConnection>;

export class TaskService {
  private db: DbType;
  private eventBus: EventBus;
  private dependencyResolver: DependencyResolver;
  private agentRegistry: AgentRegistry;

  constructor(
    db: DbType,
    eventBus: EventBus,
    dependencyResolver: DependencyResolver,
    agentRegistry: AgentRegistry,
  ) {
    this.db = db;
    this.eventBus = eventBus;
    this.dependencyResolver = dependencyResolver;
    this.agentRegistry = agentRegistry;
  }

  /**
   * Create a new task.
   */
  async createTask(input: CreateTaskInput, agentId?: string): Promise<Task> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const projectId = input.projectId || 'default';

    this.db
      .insert(tasks)
      .values({
        id,
        projectId,
        title: input.title,
        description: input.description ?? null,
        status: 'todo',
        priority: input.priority ?? 'medium',
        labels: input.labels ? JSON.stringify(input.labels) : null,
        assignedAgentId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Set dependencies if provided
    if (input.dependsOn && input.dependsOn.length > 0) {
      this.dependencyResolver.setDependencies(id, input.dependsOn);
    }

    const task = this.getTask(id);

    await this.eventBus.publish('TASK_CREATED', {
      taskId: id,
      agentId,
      payload: { title: input.title, priority: input.priority || 'medium' },
    });

    return task;
  }

  /**
   * Update task metadata (not status).
   */
  async updateTask(taskId: string, input: UpdateTaskInput, agentId?: string): Promise<Task> {
    const existing = this.getTask(taskId);
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.labels !== undefined) updateData.labels = JSON.stringify(input.labels);

    this.db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId))
      .run();

    return this.getTask(taskId);
  }

  /**
   * Delete a task. Only todo/done/failed tasks can be deleted.
   */
  async deleteTask(taskId: string, agentId?: string): Promise<void> {
    const task = this.getTask(taskId);

    if (['locked', 'in_progress'].includes(task.status)) {
      throw new ATCError(
        'TASK_IN_PROGRESS',
        'Cannot delete a task that is locked or in progress',
      );
    }

    // Delete dependencies first
    this.db
      .delete(taskDependencies)
      .where(eq(taskDependencies.taskId, taskId))
      .run();

    this.db
      .delete(taskDependencies)
      .where(eq(taskDependencies.dependsOn, taskId))
      .run();

    this.db.delete(tasks).where(eq(tasks.id, taskId)).run();
  }

  /**
   * Get a single task by ID.
   */
  getTask(taskId: string): Task {
    const row = this.db.select().from(tasks).where(eq(tasks.id, taskId)).get();

    if (!row) {
      throw new ATCError('TASK_NOT_FOUND', `Task ${taskId} not found`, 404);
    }

    return this.rowToTask(row);
  }

  /**
   * Get task with full details (dependencies, comments, progress).
   */
  getTaskDetail(taskId: string): TaskDetail {
    const task = this.getTask(taskId);

    const dependsOn = this.dependencyResolver.getDependencies(taskId);
    const blockedBy = this.dependencyResolver.getBlockedBy(taskId);

    const comments = this.db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, taskId))
      .all()
      .map((r) => ({
        id: r.id,
        taskId: r.taskId,
        agentId: r.agentId,
        content: r.content,
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
      ...task,
      dependsOn,
      blockedBy,
      comments,
      progressLogs: logs,
    };
  }

  /**
   * List tasks with optional filters.
   */
  listTasks(filters: {
    status?: TaskStatus[];
    priority?: string;
    assignee?: string;
    label?: string;
    projectId?: string;
  } = {}): Task[] {
    const conditions = [];

    if (filters.status && filters.status.length > 0) {
      conditions.push(inArray(tasks.status, filters.status));
    }
    if (filters.priority) {
      conditions.push(eq(tasks.priority, filters.priority as 'critical' | 'high' | 'medium' | 'low'));
    }
    if (filters.assignee) {
      conditions.push(eq(tasks.assignedAgentId, filters.assignee));
    }
    if (filters.projectId) {
      conditions.push(eq(tasks.projectId, filters.projectId));
    }

    const rows = this.db
      .select()
      .from(tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tasks.createdAt))
      .all();

    let result = rows.map((r) => this.rowToTask(r));

    // Label filtering (JSON contains)
    if (filters.label) {
      result = result.filter((t) => t.labels.includes(filters.label!));
    }

    return result;
  }

  /**
   * Add a comment to a task.
   */
  addComment(taskId: string, agentId: string, content: string): TaskComment {
    // Validate task exists
    this.getTask(taskId);

    const [row] = this.db
      .insert(taskComments)
      .values({
        taskId,
        agentId,
        content,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .all();

    return {
      id: row.id,
      taskId: row.taskId,
      agentId: row.agentId,
      content: row.content,
      createdAt: row.createdAt,
    };
  }

  /**
   * Get board summary.
   */
  getBoardSummary(projectId: string = 'default'): BoardSummary {
    const allTasks = this.db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .all();

    const counts = {
      todo: 0,
      locked: 0,
      inProgress: 0,
      review: 0,
      done: 0,
      failed: 0,
    };

    for (const t of allTasks) {
      switch (t.status) {
        case 'todo': counts.todo++; break;
        case 'locked': counts.locked++; break;
        case 'in_progress': counts.inProgress++; break;
        case 'review': counts.review++; break;
        case 'done': counts.done++; break;
        case 'failed': counts.failed++; break;
      }
    }

    return {
      ...counts,
      agents: this.agentRegistry.listAgents(),
      recentEvents: this.eventBus.getRecentEvents(10),
    };
  }

  private rowToTask(row: typeof tasks.$inferSelect): Task {
    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      description: row.description,
      status: row.status as TaskStatus,
      priority: row.priority as Task['priority'],
      labels: row.labels ? JSON.parse(row.labels) : [],
      assignedAgentId: row.assignedAgentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
