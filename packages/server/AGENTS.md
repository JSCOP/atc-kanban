# @atc/server — API Layer

## OVERVIEW

Multi-protocol server: Hono REST API + WebSocket event broadcast + MCP stdio for AI agents. All protocols share one `@atc/core` service container via `createServices()`.

## STRUCTURE

```
src/
├── index.ts               # Bootstrap: env config, services init, dual-mode (HTTP+WS vs --mcp)
├── static.ts              # Serves dashboard dist/ in production
├── http/
│   ├── app.ts             # Hono app factory, route registration, CORS
│   ├── middleware/
│   │   └── error-handler.ts   # ATCError → JSON error response
│   └── routes/
│       ├── agents.ts      # POST register, GET list, DELETE disconnect
│       ├── tasks.ts       # CRUD + claim/release/status transitions
│       ├── board.ts       # GET board summary (counts + agents + events)
│       ├── events.ts      # GET recent events with pagination
│       ├── projects.ts    # CRUD projects
│       └── workspaces.ts  # CRUD workspaces + git worktree management
├── mcp/
│   ├── server.ts          # McpServer factory + stdio lifecycle + agent cleanup on exit
│   ├── middleware/
│   │   └── role-guard.ts  # Main/worker role enforcement for MCP tools
│   └── tools/
│       ├── common-tools.ts    # All agents: register, heartbeat, list/get tasks+agents+events
│       ├── main-tools.ts      # Main-only: create task, review, force release, manage deps
│       └── worker-tools.ts    # Worker-only: claim, report progress, update status, release
└── ws/
    ├── handler.ts         # WebSocket upgrade on /ws path, connection tracking
    └── broadcaster.ts     # EventBus subscriber → broadcast JSON to all WS clients
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add REST endpoint | `src/http/routes/` | Create route factory, register in `app.ts` |
| Add MCP tool | `src/mcp/tools/` | Pick common/main/worker based on role access |
| Change WS events | `src/ws/broadcaster.ts` | Subscribes to EventBus |
| Server startup config | `src/index.ts` | ENV: PORT, DB_PATH, LOCK_TTL_MINUTES |
| Error handling | `src/http/middleware/error-handler.ts` | Catches ATCError → JSON |
| Role-based MCP access | `src/mcp/middleware/role-guard.ts` | Validates agent role before tool execution |

## CONVENTIONS

- **Route factories**: `createXRoutes(services: ATCServices)` → returns Hono sub-app
- **MCP tool registration**: `registerXTools(server, services)` pattern
- **Error responses**: Throw `ATCError(code, message, statusCode)` — middleware handles JSON conversion
- **MCP session tracking**: `McpSessionTracker` tracks agent ID per stdio session; auto-cleanup on disconnect
- **Graceful shutdown**: SIGINT/SIGTERM → stop expiry checker, close WS, close HTTP, close DB
- **Health endpoint**: `GET /api/health` returns `{ status: 'ok', timestamp }` — no auth required
- **API prefix**: All REST routes under `/api/*`; WebSocket on `/ws`

## ANTI-PATTERNS

- **NEVER** `console.log` in MCP mode — stdout is the transport; use `console.error` for diagnostics
- **NEVER** import from dashboard — server serves it as static files only
- **NEVER** create new service instances — always use the shared `services` object from `index.ts`
- MCP cleanup is async — exit handlers must `await cleanup()` before `process.exit()`
- Don't add a second CommonJS shim — `tsup.config.ts` already has one for `better-sqlite3`
