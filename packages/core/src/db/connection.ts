import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;

export interface ConnectionOptions {
  dbPath?: string;
  enableWAL?: boolean;
}

export function getConnection(options: ConnectionOptions = {}): ReturnType<typeof drizzle> {
  if (dbInstance) return dbInstance;

  const dbPath = options.dbPath || process.env.DB_PATH || './data/atc.sqlite';

  sqliteInstance = new Database(dbPath);

  // Performance optimizations for SQLite
  sqliteInstance.pragma('journal_mode = WAL');
  sqliteInstance.pragma('busy_timeout = 5000');
  sqliteInstance.pragma('synchronous = NORMAL');
  sqliteInstance.pragma('foreign_keys = ON');

  dbInstance = drizzle(sqliteInstance, { schema });

  return dbInstance;
}

export function getRawDb(): Database.Database {
  if (!sqliteInstance) {
    throw new Error('Database not initialized. Call getConnection() first.');
  }
  return sqliteInstance;
}

export function closeConnection(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}

/**
 * Initialize database with required tables.
 * Uses raw SQL for maximum control over schema.
 */
export function initializeDatabase(dbPath?: string): ReturnType<typeof drizzle> {
  const db = getConnection({ dbPath });
  const raw = getRawDb();

  raw.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      role            TEXT NOT NULL CHECK(role IN ('main','worker')),
      agent_type      TEXT,
      connection_type  TEXT NOT NULL DEFAULT 'mcp' CHECK(connection_type IN ('mcp','opencode')),
      server_url      TEXT,
      agent_token     TEXT NOT NULL UNIQUE,
      status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disconnected')),
      connected_at    TEXT NOT NULL DEFAULT (datetime('now')),
      last_heartbeat  TEXT NOT NULL DEFAULT (datetime('now')),
      process_id      INTEGER,
      cwd             TEXT,
      session_id      TEXT,
      spawned_pid     INTEGER,
      workspace_mode  TEXT NOT NULL DEFAULT 'disabled' CHECK(workspace_mode IN ('required','disabled')),
      project_id      TEXT REFERENCES projects(id),
      session_title   TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id                TEXT PRIMARY KEY,
      project_id        TEXT NOT NULL REFERENCES projects(id),
      title             TEXT NOT NULL,
      description       TEXT,
      status            TEXT NOT NULL DEFAULT 'todo'
                        CHECK(status IN ('todo','locked','in_progress','review','done','failed')),
      priority          TEXT NOT NULL DEFAULT 'medium'
                        CHECK(priority IN ('critical','high','medium','low')),
      labels            TEXT,
      assigned_agent_id TEXT REFERENCES agents(id),
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, depends_on),
      CHECK(task_id != depends_on)
    );

    CREATE TABLE IF NOT EXISTS task_locks (
      task_id     TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      agent_id    TEXT NOT NULL REFERENCES agents(id),
      lock_token  TEXT NOT NULL UNIQUE,
      locked_at   TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,
      task_id     TEXT,
      agent_id    TEXT,
      payload     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      agent_id    TEXT NOT NULL REFERENCES agents(id),
      content     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS progress_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      agent_id    TEXT NOT NULL REFERENCES agents(id),
      message     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id            TEXT PRIMARY KEY,
      task_id       TEXT REFERENCES tasks(id),
      agent_id      TEXT REFERENCES agents(id),
      worktree_path TEXT NOT NULL,
      branch_name   TEXT NOT NULL,
      base_branch   TEXT NOT NULL DEFAULT 'main',
      repo_root     TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','deleted')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_comments_task ON task_comments(task_id);
    CREATE INDEX IF NOT EXISTS idx_progress_task ON progress_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_workspaces_repo ON workspaces(repo_root);
    CREATE INDEX IF NOT EXISTS idx_workspaces_task ON workspaces(task_id);
    CREATE INDEX IF NOT EXISTS idx_workspaces_agent ON workspaces(agent_id);
    CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
  `);

  // ── Migrations ──────────────────────────────────────────────────────────────────────
  // ALTER TABLE is safe with IF NOT EXISTS-style checks.
  // SQLite doesn't support IF NOT EXISTS for columns, so we check pragmatically.
  const agentColumns = raw.prepare("PRAGMA table_info('agents')").all() as { name: string }[];
  const agentColNames = new Set(agentColumns.map((c) => c.name));

  if (!agentColNames.has('process_id')) {
    raw.exec('ALTER TABLE agents ADD COLUMN process_id INTEGER');
  }
  if (!agentColNames.has('cwd')) {
    raw.exec('ALTER TABLE agents ADD COLUMN cwd TEXT');
  }
  if (!agentColNames.has('session_id')) {
    raw.exec('ALTER TABLE agents ADD COLUMN session_id TEXT');
  }
  if (!agentColNames.has('connection_type')) {
    raw.exec("ALTER TABLE agents ADD COLUMN connection_type TEXT NOT NULL DEFAULT 'mcp'");
  }
  if (!agentColNames.has('server_url')) {
    raw.exec('ALTER TABLE agents ADD COLUMN server_url TEXT');
  }
  if (!agentColNames.has('spawned_pid')) {
    raw.exec('ALTER TABLE agents ADD COLUMN spawned_pid INTEGER');
  }
  if (!agentColNames.has('workspace_mode')) {
    raw.exec("ALTER TABLE agents ADD COLUMN workspace_mode TEXT NOT NULL DEFAULT 'disabled'");
  }
  if (!agentColNames.has('project_id')) {
    raw.exec('ALTER TABLE agents ADD COLUMN project_id TEXT REFERENCES projects(id)');
  }
  if (!agentColNames.has('session_title')) {
    raw.exec('ALTER TABLE agents ADD COLUMN session_title TEXT');
  }

  // ── Project migrations ──────────────────────────────────────────────────────
  const projectColumns = raw.prepare("PRAGMA table_info('projects')").all() as { name: string }[];
  const projectColNames = new Set(projectColumns.map((c) => c.name));
  if (!projectColNames.has('repo_root')) {
    raw.exec('ALTER TABLE projects ADD COLUMN repo_root TEXT');
  }
  if (!projectColNames.has('base_branch')) {
    raw.exec("ALTER TABLE projects ADD COLUMN base_branch TEXT DEFAULT 'main'");
  }
  if (!projectColNames.has('auto_dispatch')) {
    raw.exec('ALTER TABLE projects ADD COLUMN auto_dispatch INTEGER NOT NULL DEFAULT 0');
  }

  // ── Task migrations ─────────────────────────────────────────────────────────
  const taskColumns = raw.prepare("PRAGMA table_info('tasks')").all() as { name: string }[];
  const taskColNames = new Set(taskColumns.map((c) => c.name));
  if (!taskColNames.has('requires_review')) {
    raw.exec('ALTER TABLE tasks ADD COLUMN requires_review INTEGER NOT NULL DEFAULT 1');
  }

  return db;
}
