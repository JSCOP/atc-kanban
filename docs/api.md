# API Reference

## REST Endpoints (prefix: `/api`)

### Agents (`/api/agents`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all agents (MCP + OpenCode) |
| POST | `/opencode` | Register OpenCode agent from dashboard |
| POST | `/:id/health` | Check OpenCode agent health |
| GET | `/:id/opencode-agents` | List available OpenCode agent types |
| GET | `/:id/session-messages` | Get current session messages |
| GET | `/:id/sessions` | List all sessions |
| POST | `/:id/sessions` | Create new session |
| GET | `/:id/sessions/:sid/messages` | Fetch messages from specific session |
| POST | `/:id/sessions/:sid/messages` | Send message to session |
| PATCH | `/:id` | Rename agent (`{ name }`) |
| DELETE | `/:id` | Remove agent (kills spawned process) |
| POST | `/spawn` | Spawn new OpenCode server (`{ name, cwd, port }`) |
| GET | `/spawned` | List spawned processes |
| POST | `/:id/kill` | Kill spawned OpenCode process |
| GET | `/discover` | Scan for running OpenCode instances (`?portStart&portEnd`) |
| POST | `/discover/track` | Register discovered instance (`{ serverUrl, name }`) |

### Tasks (`/api/tasks`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List tasks (`?status,priority,assignee,label,projectId`) |
| GET | `/:id` | Get task detail (with deps, comments, progress) |
| POST | `/` | Create task (`{ title, description, priority, labels, dependsOn }`) |
| PUT | `/:id` | Update task metadata |
| DELETE | `/:id` | Delete task |
| POST | `/:id/force-release` | Force release task lock |
| POST | `/:id/review` | Review task (`{ verdict, comment }`) |
| POST | `/:id/move` | Move task status (dashboard drag-drop) |
| POST | `/:id/assign` | Assign agent to task (`{ agentId }`) |

### Other Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/board/summary` | Board summary with counts + agents + events |
| GET/POST/PUT/DELETE | `/projects/*` | Project CRUD |
| GET | `/events` | List events (`?since,type,limit`) |
| GET | `/workspaces` | List workspaces (`?status,repo_root`) |
| GET | `/workspaces/:id` | Get workspace |
| GET | `/workspaces/by-task/:taskId` | Get workspace linked to a task |
| POST | `/workspaces/:id/merge` | Squash-merge workspace branch into base |
| POST | `/workspaces/:id/archive` | Archive workspace and prune worktree |
| POST | `/workspaces/:id/sync` | Rebase workspace branch onto latest base |
| DELETE | `/workspaces/:id` | Remove worktree and delete workspace record |
| POST | `/dispatch` | Dispatch task to OpenCode worker |
| GET | `/health` | Health check → `{ status: 'ok' }` |
| POST | `/admin/shutdown` | Graceful shutdown |
| POST | `/admin/restart` | Restart server process |
| GET | `/admin/info` | Server process info (pid, uptime, memory) |

## MCP Tools (stdio mode, `--mcp` flag)

### Common (all agents)

`register_agent`, `heartbeat`, `list_tasks`, `get_task`, `list_agents`, `poll_events`

### Main-only (orchestrator)

`create_task`, `update_task`, `delete_task`, `set_dependency`, `review_task`, `force_release`, `get_board_summary`, `create_workspace`, `list_workspaces`, `delete_workspace`

### Worker-only (executor)

`claim_task`, `update_status`, `report_progress`, `release_task`, `sync_with_base`

## WebSocket (`/ws`)

Single connection, broadcasts all `EventBus` events as JSON to connected dashboard clients.

## Auth Model

No authentication — local development tool. MCP tools use agent tokens for role enforcement.
