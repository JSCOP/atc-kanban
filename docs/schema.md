# Database Schema

## Engine

SQLite via `better-sqlite3` + Drizzle ORM. WAL mode, foreign keys ON, 5s busy timeout.

## Tables

| Table | PK | Purpose |
|-------|-----|---------|
| `projects` | `id` (text) | Project containers for tasks |
| `tasks` | `id` (text) | Kanban items with status, priority, labels |
| `task_dependencies` | `(task_id, depends_on)` | DAG edges between tasks |
| `agents` | `id` (text) | Registered AI agents (main/worker) |
| `task_locks` | `task_id` (text) | Exclusive locks with TTL |
| `events` | `id` (integer auto) | Audit trail for all state changes |
| `task_comments` | `id` (integer auto) | Agent comments on tasks |
| `progress_logs` | `id` (integer auto) | Agent progress reports |
| `workspaces` | `id` (text) | Git worktree records |

## Key Columns

### tasks
```
status:   'todo' | 'locked' | 'in_progress' | 'review' | 'done' | 'failed'
priority: 'critical' | 'high' | 'medium' | 'low'
labels:   TEXT (JSON array, parsed in service layer)
```

### agents
```
role:            'main' | 'worker'  (max 1 active main enforced in service layer)
connection_type: 'mcp' | 'opencode'
status:          'active' | 'disconnected'
process_id:      INTEGER (for PID-based health checks)
spawned_pid:     INTEGER (for spawned OpenCode processes)
workspace_mode:  'required' | 'disabled' (task workspace requirement)
```

### task_locks
```
lock_token:  TEXT UNIQUE (UUID for lock ownership)
expires_at:  TEXT (ISO 8601, default 30 min TTL)
```

### workspaces
```
status: 'active' | 'archived' | 'deleted'
```

## Indexes

| Index | Table | Column(s) |
|-------|-------|-----------|
| `idx_tasks_status` | tasks | status |
| `idx_tasks_project` | tasks | project_id |
| `idx_tasks_priority` | tasks | priority |
| `idx_agents_status` | agents | status |
| `idx_events_created` | events | created_at |
| `idx_events_type` | events | type |
| `idx_comments_task` | task_comments | task_id |
| `idx_progress_task` | progress_logs | task_id |
| `idx_workspaces_*` | workspaces | repo, task, agent, status |

## Migration Strategy

No migration files. `initializeDatabase()` in `connection.ts` uses:
1. `CREATE TABLE IF NOT EXISTS` for initial schema
2. `PRAGMA table_info()` + `ALTER TABLE ADD COLUMN` for incremental changes
3. Default project (`id='default'`) auto-created via `INSERT OR IGNORE`

## Relationships

```
projects 1──* tasks
tasks    *──* tasks       (via task_dependencies, self-referencing DAG)
tasks    1──1 task_locks  (exclusive lock)
tasks    1──* task_comments
tasks    1──* progress_logs
tasks    1──* workspaces
agents   1──* task_locks
agents   1──* task_comments
agents   1──* progress_logs
```
