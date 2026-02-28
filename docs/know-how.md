# Know-How (Gotchas & Workarounds)

## ESM Quirks

| Issue | Solution |
|-------|----------|
| Import extensions required in core/server | Always use `.js` extension: `import { foo } from './bar.js'` |
| `better-sqlite3` is native (CJS) | Server's `tsup.config.ts` has a CJS shim — don't add another |
| No `require()` anywhere | ESM-only codebase — use dynamic `import()` if needed |

## MCP Stdout Restriction

**CRITICAL**: In MCP mode (`--mcp`), `stdout` IS the MCP transport. Any `console.log()` corrupts the protocol.

- Use `console.error()` for all diagnostics in server code
- MCP tools must return structured `{ content: [{ type: 'text', text }] }` only

## Database Gotchas

| Issue | Solution |
|-------|----------|
| Labels stored as JSON string | Service layer parses `tasks.labels` — don't query directly |
| No migration files needed | Use `initializeDatabase()` with `ALTER TABLE` pragma checks |
| Timestamps are text | ISO 8601 strings via `.$defaultFn(() => new Date().toISOString())` |
| Partial unique index hack | `idx_unique_active_main` uses `undefined` cast — enforced in service layer instead |

## Service Layer Rules

| Rule | Detail |
|------|--------|
| Single entry point | Always use `createServices()` — never instantiate services directly |
| Circular dep workaround | `lockEngine.setWorkspaceService()` called post-construction |
| Import direction | core → nothing; server → core; dashboard → neither (HTTP only) |
| `drizzle-orm` in server | Import `eq` from `@atc/core` which re-exports it — never import `drizzle-orm` directly |

## Dashboard Patterns

| Pattern | Detail |
|---------|--------|
| API calls | Always through `src/api/client.ts` — never direct fetch |
| WebSocket | Single connection via `useWebSocket` hook — never create additional |
| State | Zustand stores only — no Context or Redux |
| Styling | Tailwind v4 utility classes — no CSS modules or styled-components |

## OpenCode Integration

| Gotcha | Detail |
|--------|--------|
| TUI mode has no HTTP | Only `opencode serve` or `opencode --port N` are discoverable |
| Port scan range | Default: 4096 + 14000-14100 for OpenCode discovery |
| Spawner tracks PIDs | Only spawned processes are killed on DELETE — manually registered agents untouched |

## Task Status Transitions

```
todo → locked (claim_task acquires lock)
locked → in_progress (worker starts work)
in_progress → review | done | failed
review → done (approve) | todo (reject)
done/failed → todo (re-open from dashboard)
```

## Workspace & Merge Lifecycle

| Behavior | Detail |
|----------|--------|
| Merge strategy | Squash merge via temp detached worktree (avoids `git checkout` conflicts) |
| Conflict pre-check | Uses `git merge-tree --write-tree` before actual merge (fallback for old git) |
| On approve (review→done) | Auto squash-merge workspace branch into base, then archive worktree |
| On task failed | Try `removeWorktree` first, fallback to `archiveWorktree` |
| On lock expiry | Archive workspace (preserve for inspection, don't delete) |
| `sync_with_base` tool | Worker rebases branch onto latest base — use after merge conflict rejection |
## Common Mistakes to Avoid

- Don't suppress types: no `as any`, `@ts-ignore`, `@ts-expect-error`
- Don't use static `.default(new Date().toISOString())` — use `.$defaultFn()`
- Don't bypass service layer for DB writes
- Don't generate DB migrations — use pragmatic ALTER TABLE approach
