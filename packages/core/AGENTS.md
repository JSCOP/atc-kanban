# @atc/core — Domain Layer

## OVERVIEW

Shared library: Drizzle ORM database layer + 8 domain service classes. Consumed by `@atc/server` via `workspace:*`.

## STRUCTURE

```
src/
├── index.ts          # createServices() factory + all re-exports
├── types.ts          # All TypeScript interfaces, types, ATCError class
├── db/
│   ├── connection.ts # SQLite connection (better-sqlite3 via Drizzle)
│   └── schema.ts     # 9 tables with indexes and constraints
└── services/
    ├── event-bus.ts           # Event recording + in-memory pub/sub for WS broadcast
    ├── agent-registry.ts      # Agent CRUD + PID-based health checking
    ├── task-service.ts        # Task CRUD + status transitions
    ├── lock-engine.ts         # Exclusive task locking with TTL + expiry checker
    ├── role-manager.ts        # Main/worker role enforcement (max 1 main)
    ├── dependency-resolver.ts # Task DAG validation + dependency checks
    ├── project-service.ts     # Project CRUD + default project creation
    └── workspace-service.ts   # Git worktree lifecycle (create/archive/delete)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a DB table | `src/db/schema.ts` | Then `pnpm db:generate` + `pnpm db:migrate` |
| Add a domain service | `src/services/` | Wire in `src/index.ts` createServices() + ATCServices interface |
| Add/change a type | `src/types.ts` | Re-export from `src/index.ts` |
| DB connection config | `src/db/connection.ts` | Path via env `DB_PATH`, default `./data/atc.sqlite` |
| Understand data model | `src/db/schema.ts` | Tables: projects, tasks, task_dependencies, agents, task_locks, events, task_comments, progress_logs, workspaces |

## CONVENTIONS

- **Service wiring**: All instantiated in `createServices()` — no DI framework, manual constructor injection
- **Circular dep workaround**: `lockEngine.setWorkspaceService()` called post-construction
- **DB dates**: ISO 8601 text strings via `.$defaultFn(() => new Date().toISOString())`
- **Labels**: JSON string in `tasks.labels` column, parsed in service layer
- **IDs**: UUID text for all entities
- **Events**: Payload stored as JSON text, parsed on read
- **Schema indexes**: Named `idx_{table}_{column}` convention
- **Exports**: Everything re-exported from `src/index.ts` — consumers import from `@atc/core`

## ANTI-PATTERNS

- **NEVER** import from `@atc/server` or `@atc/dashboard` — core has zero upstream deps
- **NEVER** bypass service layer for DB writes — always use service methods
- **NEVER** use static `.default(new Date().toISOString())` for timestamps — use `.$defaultFn()`
- `better-sqlite3` is external in tsup build — don't try to bundle native modules
- Don't add `migrations/` to gitignore — migration SQL files are tracked
