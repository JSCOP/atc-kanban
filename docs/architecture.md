# Architecture

## Overview

| Aspect | Detail |
|--------|--------|
| Type | pnpm monorepo, 3 packages |
| Backend | Hono HTTP + WebSocket + MCP stdio |
| Frontend | React 19 SPA (Vite + Tailwind v4) |
| Database | SQLite via Drizzle ORM (better-sqlite3) |
| State | Zustand (frontend), service container (backend) |

## Package Dependency Graph

```
@atc/dashboard  (standalone SPA, no code imports from other packages)
       ↓ HTTP/WS at runtime
@atc/server     (imports @atc/core via workspace:*)
       ↓
@atc/core       (zero upstream deps)
```

## Service Container

`createServices()` in `packages/core/src/index.ts` — manual constructor injection, no DI framework.

| Service | Responsibility | Key Dependencies |
|---------|---------------|------------------|
| EventBus | Event recording + in-memory pub/sub | db |
| AgentRegistry | Agent CRUD + PID health checking | db, eventBus |
| RoleManager | Main/worker role enforcement (max 1 main) | agentRegistry |
| DependencyResolver | Task DAG validation, cycle detection | db |
| TaskService | Task CRUD + status transitions + board summary | db, eventBus, depResolver, agentRegistry |
| LockEngine | Exclusive task locking + TTL expiry checker | db, eventBus, depResolver |
| ProjectService | Project CRUD + default project | db |
| OpenCodeBridge | Session management, health checks, task dispatch | db, eventBus, taskService |
| WorkspaceService | Git worktree create/archive/delete | db, eventBus |

**Circular dep**: `lockEngine.setWorkspaceService(workspaceService)` called post-construction.

## Server-Side Services (not in core)

| Service | Location | Responsibility |
|---------|----------|----------------|
| OpenCodeDiscovery | `server/src/services/` | Port scan (4096 + 14000-14100) + OS process detection (wmic/ps) |
| OpenCodeSpawner | `server/src/services/` | Spawn `opencode serve --port N`, track PID, kill on shutdown |

## Discovery System

Two detection vectors running in parallel:

| Vector | Method | Finds |
|--------|--------|-------|
| Port probe | `GET /global/health` with 500ms timeout | `opencode serve` / `--port N` instances |
| Process detection | `wmic` (Win) / `ps` (Unix) | ALL opencode processes incl. TUI-only |

**Critical limitation**: Plain `opencode` (TUI mode) has NO HTTP server — uses in-process Bun Worker RPC. Only `opencode serve` or `opencode --port N` are discoverable via port scan.

Priority ports: `[4096]` (OpenCode default serve port), then range `14000-14100` (spawner range).

## Data Flow

```
┌─────────────┐    WebSocket     ┌──────────┐
│  Dashboard   │ ←─── events ──── │ EventBus │
│  (React 19)  │                  └────┬─────┘
└──────┬───────┘                       ↑ publish
       │ HTTP /api/*              ┌────┴─────┐
       ▼                          │ Services │ ← shared container
┌──────────────┐                  └────┬─────┘
│ Hono Routes  │ ──→ Services ──→ Drizzle ──→ SQLite
└──────────────┘                       ↑
┌──────────────┐                       │
│  MCP Tools   │ ──→ Services ─────────┘
│  (stdio)     │
└──────────────┘
```

## Server Modes

| Mode | Trigger | Transport | Use Case |
|------|---------|-----------|----------|
| HTTP+WS | Default | Port 4000 | Dashboard + REST API + WebSocket |
| MCP stdio | `--mcp` flag | stdin/stdout | AI agent consumption (no HTTP) |

## Background Processes

| Process | Interval | Purpose |
|---------|----------|---------|
| Lock expiry checker | 30s | Reverts expired locks → task back to `todo` |
| PID health checker | 10s | Detects dead agents → auto-disconnect + release locks |

## Module Boundaries

- **core** → exports everything from `src/index.ts`. Never imports upstream.
- **server** → imports `@atc/core`. Serves dashboard as static files in production.
- **dashboard** → standalone SPA. Communicates only via HTTP + WebSocket at runtime.
