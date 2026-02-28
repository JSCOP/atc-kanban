import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ── Projects ────────────────────────────────────────────────────────────────

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at')
    .notNull()
    .default(new Date().toISOString())
    .$defaultFn(() => new Date().toISOString()),
});

// ── Tasks ───────────────────────────────────────────────────────────────────

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', {
      enum: ['todo', 'locked', 'in_progress', 'review', 'done', 'failed'],
    })
      .notNull()
      .default('todo'),
    priority: text('priority', {
      enum: ['critical', 'high', 'medium', 'low'],
    })
      .notNull()
      .default('medium'),
    labels: text('labels'), // JSON array
    assignedAgentId: text('assigned_agent_id').references(() => agents.id),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('idx_tasks_status').on(table.status),
    index('idx_tasks_project').on(table.projectId),
    index('idx_tasks_priority').on(table.priority),
  ],
);

// ── Task Dependencies ───────────────────────────────────────────────────────

export const taskDependencies = sqliteTable(
  'task_dependencies',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOn: text('depends_on')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.dependsOn] })],
);

// ── Agents ──────────────────────────────────────────────────────────────────

export const agents = sqliteTable(
  'agents',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    role: text('role', { enum: ['main', 'worker'] }).notNull(),
    agentType: text('agent_type'),
    connectionType: text('connection_type', { enum: ['mcp', 'opencode'] })
      .notNull()
      .default('mcp'),
    serverUrl: text('server_url'),
    agentToken: text('agent_token').notNull().unique(),
    status: text('status', { enum: ['active', 'disconnected'] })
      .notNull()
      .default('active'),
    connectedAt: text('connected_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    lastHeartbeat: text('last_heartbeat')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    processId: integer('process_id'),
    cwd: text('cwd'),
    sessionId: text('session_id'),
    spawnedPid: integer('spawned_pid'),
    workspaceMode: text('workspace_mode', { enum: ['required', 'disabled'] })
      .notNull()
      .default('disabled'),
  },
  (table) => [
    uniqueIndex('idx_unique_active_main')
      .on(table.role)
      .where(
        // SQLite partial unique index: only one active main allowed
        // drizzle doesn't directly support WHERE on index, using raw SQL
        // We'll enforce this in the service layer instead
        undefined as unknown as ReturnType<typeof table.role.getSQL>,
      ),
    index('idx_agents_status').on(table.status),
  ],
);

// ── Task Locks ──────────────────────────────────────────────────────────────

export const taskLocks = sqliteTable('task_locks', {
  taskId: text('task_id')
    .primaryKey()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id),
  lockToken: text('lock_token').notNull().unique(),
  lockedAt: text('locked_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  expiresAt: text('expires_at').notNull(),
});

// ── Events ──────────────────────────────────────────────────────────────────

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    taskId: text('task_id'),
    agentId: text('agent_id'),
    payload: text('payload'), // JSON
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('idx_events_created').on(table.createdAt),
    index('idx_events_type').on(table.type),
  ],
);

// ── Task Comments ───────────────────────────────────────────────────────────

export const taskComments = sqliteTable(
  'task_comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    content: text('content').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('idx_comments_task').on(table.taskId)],
);

// ── Progress Logs ───────────────────────────────────────────────────────────

export const progressLogs = sqliteTable(
  'progress_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    message: text('message').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('idx_progress_task').on(table.taskId)],
);

// ── Workspaces ──────────────────────────────────────────────────────────────────

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').references(() => tasks.id),
    agentId: text('agent_id').references(() => agents.id),
    worktreePath: text('worktree_path').notNull(),
    branchName: text('branch_name').notNull(),
    baseBranch: text('base_branch').notNull().default('main'),
    repoRoot: text('repo_root').notNull(),
    status: text('status', { enum: ['active', 'archived', 'deleted'] })
      .notNull()
      .default('active'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('idx_workspaces_repo').on(table.repoRoot),
    index('idx_workspaces_task').on(table.taskId),
    index('idx_workspaces_agent').on(table.agentId),
    index('idx_workspaces_status').on(table.status),
  ],
);
