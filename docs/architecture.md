# Architecture

## Overview

Agent Task Coordinator (ATC) — multi-agent kanban orchestration system. pnpm monorepo with 3 packages sharing a SQLite-backed core.

## Package Dependency Graph

```
@atc/dashboard (React 19 SPA)
    ↓ HTTP/WS only (no code imports)
@atc/server (Hono API + WS + MCP)
    ↓ workspace:*
@atc/core (Drizzle ORM + domain services)
    ↓
SQLite (better-sqlite3, WAL mode)
```

## Package Responsibilities

| Package | Runtime | Purpose | Entry |
|---------|---------|---------|-------|
| `core` | Node | DB schema (9 tables), 9 domain services, types, ATCError | `src/index.ts` → `createServices()` |
| `server` | Node | REST API (9 route files), WebSocket broadcast, MCP stdio, FS browser, OpenCode spawner/discovery | `src/index.ts` |
| `dashboard` | Browser | Kanban board, agent management, event log, task detail, directory picker | `src/main.tsx` |

## Server Dual-Mode Architecture

```
Default mode (HTTP+WS):        MCP mode (--mcp flag):
┌─────────────┐                ┌─────────────┐
│ Hono REST   │ :4000/api      │ MCP stdio   │ stdin/stdout
│ WebSocket   │ :4000/ws       │ (no HTTP)   │
│ Static SPA  │ :4000/         └─────────────┘
└─────────────┘
```

## Data Flow

1. **Dashboard → Server**: HTTP fetch via `api/client.ts`, WS for real-time events
2. **AI Agents → Server**: MCP tools (stdio) or OpenCode HTTP bridge
3. **Server → OpenCode (TUI dispatch)**: `POST /tui/clear-prompt` → `/tui/append-prompt` → `/tui/submit-prompt` (real-time TUI streaming)
4. **Server → OpenCode (headless fallback)**: `POST /session/:id/prompt_async` (no TUI visibility)
5. **Server → Core**: `createServices()` container, all DB access through service layer
6. **Core → DB**: Drizzle ORM queries, raw SQL for migrations via `initializeDatabase()`
## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| SQLite (not Postgres) | Single-file, zero-config, embedded — fits local dev tool |
| MCP stdio (not HTTP) | AI agents consume tools via Model Context Protocol standard |
| No DI framework | Manual constructor injection in `createServices()` — simple, explicit |
| Drizzle + raw SQL | Drizzle for queries, raw `CREATE TABLE IF NOT EXISTS` for migrations |
| Zustand (not Redux) | Lightweight, one store per domain, no boilerplate |
| Tailwind v4 | Utility-first, `@tailwindcss/vite` plugin — no config file needed |

## Background Processes

| Process | Interval | Purpose |
|---------|----------|---------|
| PID health checker | 10s | Polls OS for agent PIDs, auto-disconnects dead agents |
| Lock expiry checker | 30s | Reverts expired task locks to `todo` status, archives orphaned workspaces |
| OpenCode discovery | On-demand | Port scan (4096 + 14000-14100) + process detection |

## Workspace Lifecycle

```
claim_task → worktree created (branch: task/<id>)
  → worker edits in isolated worktree
  → sync_with_base (optional rebase onto latest main)
  → review_task approve → squash merge → archive worktree
  → review_task reject → worker fixes → re-submit
  → task failed → remove worktree (fallback: archive)
  → lock expired → archive worktree
```
## File Conventions

- ESM-only, `.js` extensions in core/server imports
- Biome for lint+format (not ESLint/Prettier)
- UUIDs as text IDs, ISO 8601 text dates
- No path aliases — standard relative imports
