# SESSION INIT — READ DOCS BEFORE ANY WORK

**This is NOT optional. Execute this checklist before responding to ANY user request.**

If `docs/` directory exists in this project:

1. **Read** all docs marked `always: yes` in the Doc Inventory below — these are mandatory session context
2. **Read** `docs/_tracking/task-status.md` — check for in-progress work
3. **Skip** if you already read docs in THIS session (not a previous one)
4. **Skip** after compact — you already have content in context

After reading, proceed normally. After modifying code, update affected docs (see Auto-Update Rule below).

---

# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-28
**Commit:** master (latest)

## OVERVIEW

Agent Task Coordinator (ATC) — multi-agent task orchestration system with kanban board. pnpm monorepo: Drizzle+SQLite core, Hono HTTP/WS/MCP server, React+Vite dashboard.

## STRUCTURE

```
agent-task-coordinator/
├── packages/
│   ├── core/          # Domain services + Drizzle ORM (SQLite)
│   ├── server/        # Hono HTTP API + WebSocket + MCP stdio server
│   └── dashboard/     # React 19 SPA (Vite + Tailwind v4 + Zustand)
├── tests/e2e/         # Playwright E2E tests (Chromium only)
├── prompts/           # AI agent role definitions (main-orchestrator, worker-executor)
├── docs/              # Project docs (AI-optimized, max 100 lines each)
└── data/              # SQLite DB (gitignored, auto-created)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| DB schema / migrations | `packages/core/src/db/` | Drizzle ORM, SQLite |
| Domain services | `packages/core/src/services/` | 8 service classes |
| Service container | `packages/core/src/index.ts` | `createServices()` factory |
| Types / interfaces | `packages/core/src/types.ts` | All domain types + ATCError |
| REST API routes | `packages/server/src/http/routes/` | Hono route handlers |
| OpenCode discovery | `packages/server/src/services/opencode-discovery.ts` | Port scan + process detection |
| OpenCode spawner | `packages/server/src/services/opencode-spawner.ts` | Spawn `opencode serve` processes |
| MCP tools (AI agents) | `packages/server/src/mcp/tools/` | common/main/worker tool sets |
| WebSocket broadcast | `packages/server/src/ws/` | Event broadcast to dashboard |
| Dashboard pages | `packages/dashboard/src/pages/` | Board, Agents, Events, TaskDetail, Settings |
| State management | `packages/dashboard/src/stores/` | Zustand stores |
| Agent role prompts | `prompts/` | System prompts for main + worker agents |
| Environment config | `.env.example` | PORT, DB_PATH, LOCK_TTL_MINUTES |
| MCP integration | `opencode.json` | Configures ATC as MCP server for AI agents |
| E2E tests | `tests/e2e/` | Playwright: agent-health, discovery-flow, spawn, dispatch |

## DOMAIN MODEL

ATC orchestrates AI agents (main + workers) collaborating on tasks via a kanban board:

- **Project** → contains Tasks
- **Task** → status flow: `todo → locked → in_progress → review → done/failed`. Has priority, labels, dependencies
- **Agent** → registers as `main` (orchestrator, max 1) or `worker` (executor), tracked by OS PID. Can be `mcp` or `opencode` connection type.
- **TaskLock** → exclusive lock with TTL (default 30 min), auto-expires if agent dies
- **Workspace** → git worktree per task for branch isolation
- **Event** → audit trail for all state changes, broadcast via WebSocket
- **OpenCode Discovery** → port scan (4096 + 14000-14100) + OS process detection (wmic/ps) to find running OpenCode instances

**Key invariants:**
- Only ONE active main agent at a time (enforced in service layer)
- Workers must report progress or lose lock (30 min TTL)
- Task dependencies form a DAG — no circular deps
- PID-based health check every 10s auto-disconnects dead agents

## CONVENTIONS

- **Package manager**: pnpm with workspace protocol (`workspace:*`)
- **Linter/Formatter**: Biome (not ESLint/Prettier) — single quotes, always semicolons, 100-char line width, 2-space indent
- **Module format**: ESM-only throughout (no CommonJS)
- **Build**: tsup for core+server, Vite for dashboard
- **TypeScript**: ES2022 target, strict mode, bundler resolution
- **No path aliases**: Standard relative imports only
- **Import extensions**: `.js` in core+server imports (ESM requirement)
- **IDs**: UUIDs as text strings
- **Dates**: ISO 8601 text strings (not unix timestamps)

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER** suppress types with `as any`, `@ts-ignore`, `@ts-expect-error`
- **NEVER** add CommonJS `require()` — ESM-only (server tsup has a shim for better-sqlite3 already)
- **NEVER** import upstream: core imports nothing; server imports core only; dashboard imports neither
- **NEVER** use `console.log` in MCP mode — stdout is the MCP transport; use `console.error`
- **NEVER** instantiate services directly — use `createServices()` container
- **NEVER** import `drizzle-orm` directly in server — import `eq` from `@atc/core` which re-exports it
- **NEVER** generate DB migrations — use `initializeDatabase()` in `connection.ts` with `ALTER TABLE` pragmatic checks

## COMMANDS

```bash
pnpm dev              # Server (tsx watch :4000) + Dashboard (vite :5173) concurrently
pnpm build            # Build all: core → server → dashboard
pnpm start            # Production: node packages/server/dist/index.js
pnpm lint             # biome check .
pnpm format           # biome format --write .
pnpm test             # vitest (unit — currently no test files)
pnpm test:e2e         # playwright test (requires built server running on :4000)
pnpm db:generate      # Drizzle: generate migration from schema changes
pnpm db:migrate       # Drizzle: apply pending migrations
```

## NOTES

- **Dual-mode server**: HTTP+WS by default; `--mcp` flag switches to MCP stdio (for AI agent consumption)
- **Dashboard proxy**: Dev mode proxies `/api` → `:4000` and `/ws` → `ws://localhost:4000` via Vite config
- **PID health check**: Server polls agent PIDs every 10s; dead agents auto-disconnect, locks released
- **Lock expiry**: Separate 30s interval checks lock TTL; expired locks revert task to `todo`
- **No CI/CD**: No GitHub Actions, Docker, or deployment configs yet
- **E2E tests**: Use Playwright MCP browser tools interactively (NOT `.spec.ts` files). Legacy specs in `tests/e2e/` run via `pnpm test:e2e`.
- **Static serving**: Production mode serves `packages/dashboard/dist/` from the server
- **OpenCode TUI limitation**: Plain `opencode` (TUI mode) has NO HTTP server — only `opencode serve` or `opencode --port N` are discoverable

---

# Document Protocol

## Doc Inventory

| file | scope | always |
|------|-------|--------|
| architecture.md | Project structure, monorepo layout, package boundaries, data flow | yes |
| api.md | REST endpoints, MCP tools, WebSocket, request/response | yes |
| schema.md | DB tables, columns, indexes, relationships, migration strategy | yes |
| config.md | Environment variables, Biome, TypeScript, Vite, SQLite pragmas | yes |
| commands.md | pnpm scripts, dev/build/test commands, server modes | yes |
| know-how.md | Gotchas, workarounds, ESM quirks, MCP restrictions, patterns | yes |
| testing.md | Vitest unit tests, Playwright MCP testing convention, test gaps | no |

(`always: yes` = read every session start. `always: no` = read when agent judges relevant or user requests.)

## When to Read Docs

### Session Start
Read all docs marked `always: yes` above. Then read `docs/_tracking/task-status.md` to resume prior work.

### On-Demand
Read `always: no` docs when:
- You judge them relevant to the area you're about to modify
- User explicitly asks you to read them

### After Compact
Do NOT re-read any docs. You already have the content in context.

## Doc-First Workflow

When analyzing or modifying code, **read relevant docs BEFORE touching code**:

1. Check the Doc Inventory above to find docs covering the area you're working on
2. Read those docs to understand current architecture/patterns/conventions
3. Use doc knowledge to locate the right files and modules
4. Then explore and modify the actual code

## Auto-Update Rule

When you modify any code, update any doc whose topic was affected. This is **mandatory** — no exceptions.

1. Check the Doc Inventory above for affected docs
2. If your change affects a doc's scope → read it → update affected sections → keep under 100 lines

Only update docs that exist. Never create new docs without user request.

## Task Continuity

Before session end or compact, write progress to `docs/_tracking/task-status.md`:
```
## Current
- [ ] Task description
  - Done: what was completed
  - Next: what remains
  - Blocker: if any
```

## Doc Style

All docs are AI-optimized:
- Tables over paragraphs
- Code blocks for examples
- No filler text
- Max 100 lines per doc
