# API Reference

## REST Endpoints

All routes prefixed with `/api`. Responses wrapped in `{ key: data }`.

### Tasks (`/api/tasks`)

| Method | Path | Description | Query/Body |
|--------|------|-------------|------------|
| GET | `/` | List tasks | `?status=...&priority=...&assignee=ID&label=NAME&projectId=ID` |
| GET | `/:id` | Get task detail | — |
| POST | `/` | Create task | `{ projectId, title, description?, priority?, labels?, dependsOn? }` |
| PUT | `/:id` | Update task | `{ title?, description?, priority?, labels? }` |
| DELETE | `/:id` | Delete task | — |
| POST | `/:id/force-release` | Force release lock | — |
| POST | `/:id/review` | Review task | `{ verdict: "approve"\|"reject", comment? }` |
| POST | `/:id/move` | Move status | `{ status }` |
| POST | `/:id/assign` | Assign agent | `{ agentId }` |

### Agents (`/api/agents`)

| Method | Path | Description | Query/Body |
|--------|------|-------------|------------|
| GET | `/` | List all agents | — |
| PATCH | `/:id` | Rename agent | `{ name }` |
| DELETE | `/:id` | Remove agent (disconnect + delete) | — |
| POST | `/opencode` | Register OpenCode agent | `{ name, serverUrl }` |
| POST | `/:id/health` | Check OpenCode health | — |
| GET | `/:id/opencode-agents` | List OpenCode agent types | — |
| GET | `/:id/sessions` | List sessions | — |
| POST | `/:id/sessions` | Create session | `{ title? }` |
| GET | `/:id/sessions/:sid/messages` | Get session messages | — |
| POST | `/:id/sessions/:sid/messages` | Send message | `{ message, opencodeAgent? }` |
| GET | `/:id/session-messages` | Get current session messages | — |

### Discovery (`/api/agents/discover`)

| Method | Path | Description | Query/Body |
|--------|------|-------------|------------|
| GET | `/discover` | Scan for OpenCode instances | `?portStart=14000&portEnd=14100` |
| POST | `/discover/track` | Register discovered instance | `{ serverUrl, name? }` |

Scan probes port 4096 (priority) + range 14000–14100 via `GET /global/health`.
Also detects OS processes via `wmic` (Win) / `ps` (Unix), filtering out LSP subprocesses.

Response: `{ discovered: DiscoveredInstance[], processes: DetectedProcess[], scannedRange, duration }`

### Spawn (`/api/agents`)

| Method | Path | Description | Body |
|--------|------|-------------|------|
| POST | `/spawn` | Spawn new OpenCode server | `{ name?, cwd?, port? }` |
| GET | `/spawned` | List spawned processes | — |
| POST | `/:id/kill` | Kill spawned process | — |

### Dispatch (`/api/dispatch`)

| Method | Path | Description | Body |
|--------|------|-------------|------|
| POST | `/` | Dispatch task to OpenCode agent | `{ taskId, agentId, prompt?, opencodeAgent? }` |

### Admin (`/api/admin`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/shutdown` | Graceful server shutdown |
| POST | `/restart` | Restart server process |
| GET | `/info` | Server process info (pid, uptime, memory) |

### Projects, Events, Board, Workspaces, Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects` | List projects |
| GET/POST/PUT/DELETE | `/projects/:id` | Project CRUD |
| GET | `/events` | List events (`?since=ISO&type=...&limit=50`) |
| GET | `/board/summary` | Board summary (`?projectId=default`) |
| GET | `/workspaces` | List workspaces (`?status=active`) |
| GET | `/api/health` | `{ status: "ok", timestamp }` |

## MCP Tools (AI Agent Interface)

Tools registered via `@modelcontextprotocol/sdk`. Accessed over stdio transport.

### Common (all agents): `register_agent`, `heartbeat`, `list_tasks`, `get_task`
### Main-only: `create_task`, `update_task`, `delete_task`, `set_dependency`, `review_task`, `force_release`, `poll_events`, `get_board_summary`, `create_workspace`, `list_workspaces`, `delete_workspace`
### Worker-only: `claim_task`, `update_status`, `report_progress`, `release_task`

## WebSocket Events (`/ws`)

Connection sends `BOARD_SNAPSHOT` on connect, then streams: `TASK_CREATED`, `TASK_CLAIMED`, `TASK_RELEASED`, `STATUS_CHANGED`, `PROGRESS_REPORTED`, `TASK_REVIEWED`, `AGENT_CONNECTED`, `AGENT_DISCONNECTED`, `LOCK_EXPIRED`

## Error Format

```json
{ "error": { "code": "TASK_NOT_FOUND", "message": "Task abc not found" } }
```

Thrown via `ATCError(code, message, statusCode)` — caught by error-handler middleware.
