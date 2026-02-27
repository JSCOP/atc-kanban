# Database Schema

## Overview

| Aspect | Detail |
|--------|--------|
| Database | SQLite (file: `./data/atc.sqlite`) |
| ORM | Drizzle ORM with `better-sqlite3` driver |
| Schema | `packages/core/src/db/schema.ts` |
| Migrations | `packages/core/src/db/migrations/` |

## Tables

### projects

| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| name | text | NOT NULL |
| description | text | nullable |
| created_at | text | NOT NULL, default now ISO |

### tasks

| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| project_id | text | NOT NULL, FK → projects.id |
| title | text | NOT NULL |
| description | text | nullable |
| status | text | NOT NULL, enum: `todo, locked, in_progress, review, done, failed` |
| priority | text | NOT NULL, enum: `critical, high, medium, low`, default `medium` |
| labels | text | nullable, JSON array string |
| assigned_agent_id | text | nullable, FK → agents.id |
| created_at | text | NOT NULL |
| updated_at | text | NOT NULL |

**Indexes**: `idx_tasks_status`, `idx_tasks_project`, `idx_tasks_priority`

### task_dependencies

| Column | Type | Constraints |
|--------|------|-------------|
| task_id | text | NOT NULL, FK → tasks.id (cascade delete) |
| depends_on | text | NOT NULL, FK → tasks.id (cascade delete) |

**PK**: composite (task_id, depends_on)

### agents

| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| name | text | NOT NULL |
| role | text | NOT NULL, enum: `main, worker` |
| agent_type | text | nullable |
| agent_token | text | NOT NULL, UNIQUE |
| status | text | NOT NULL, enum: `active, disconnected` |
| connected_at | text | NOT NULL |
| last_heartbeat | text | NOT NULL |
| process_id | integer | nullable (OS PID for health checks) |
| cwd | text | nullable |
| session_id | text | nullable (OpenCode session ID for reconnection) |

**Indexes**: `idx_agents_status`. Unique main enforced in service layer.

### task_locks

| Column | Type | Constraints |
|--------|------|-------------|
| task_id | text | PK, FK → tasks.id (cascade delete) |
| agent_id | text | NOT NULL, FK → agents.id |
| lock_token | text | NOT NULL, UNIQUE |
| locked_at | text | NOT NULL |
| expires_at | text | NOT NULL |

### events

| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK, autoIncrement |
| type | text | NOT NULL |
| task_id | text | nullable |
| agent_id | text | nullable |
| payload | text | nullable, JSON string |
| created_at | text | NOT NULL |

**Indexes**: `idx_events_created`, `idx_events_type`

### task_comments

| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK, autoIncrement |
| task_id | text | NOT NULL, FK → tasks.id (cascade) |
| agent_id | text | NOT NULL, FK → agents.id |
| content | text | NOT NULL |
| created_at | text | NOT NULL |

**Index**: `idx_comments_task`

### progress_logs

| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK, autoIncrement |
| task_id | text | NOT NULL, FK → tasks.id (cascade) |
| agent_id | text | NOT NULL, FK → agents.id |
| message | text | NOT NULL |
| created_at | text | NOT NULL |

**Index**: `idx_progress_task`

### workspaces

| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| task_id | text | nullable, FK → tasks.id |
| agent_id | text | nullable, FK → agents.id |
| worktree_path | text | NOT NULL |
| branch_name | text | NOT NULL |
| base_branch | text | NOT NULL, default `main` |
| repo_root | text | NOT NULL |
| status | text | NOT NULL, enum: `active, archived, deleted` |
| created_at | text | NOT NULL |

**Indexes**: `idx_workspaces_repo`, `idx_workspaces_task`, `idx_workspaces_agent`, `idx_workspaces_status`

### opencode_workers

| Column | Type | Constraints |
|--------|------|-------------|
| id | text | PK |
| name | text | NOT NULL |
| server_url | text | NOT NULL |
| status | text | NOT NULL, enum: `online, offline, busy`, default `offline` |
| current_session_id | text | nullable |
| current_task_id | text | nullable, FK → tasks.id |
| last_health_check | text | nullable |
| created_at | text | NOT NULL |

**Index**: `idx_opencode_workers_status`

## Conventions

- **IDs**: UUID text strings for all entities
- **Dates**: ISO 8601 text strings, generated via `.$defaultFn(() => new Date().toISOString())`
- **JSON fields**: `labels` and `payload` stored as text, parsed in service layer
- **Index naming**: `idx_{table}_{column}`
- **Cascade deletes**: task_dependencies, task_comments, progress_logs cascade on task delete
