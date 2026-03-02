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
| Headless TUI false-positive | `opencode serve` returns `true` for `/tui/*` endpoints but doesn't process them — v0.6.1 regression |
| Message delivery (v0.6.2+) | Always use `prompt_async` — reliable on both TUI and headless; TUI dispatch removed from `sendMessage` |
| `prompt_async` in TUI | Message enters session, LLM processes it, response streams in TUI naturally (no SSE gap) |
| Agent disconnect (v0.6.2+) | `DELETE /api/agents/:id` calls `POST /global/dispose` on OpenCode instance before DB removal |
| `/global/dispose` vs `/instance/dispose` | `/global/dispose` disposes ALL instances + triggers process exit; `/instance/dispose` is single-instance only |
| Untitled sessions in discovery | `scan()` and `track()` ignore untitled/default sessions; `track()` rejects instances with no titled session |
| Port scan range | Default: 4096 + 14000-14100 for OpenCode discovery |
| Spawner tracks PIDs | Only spawned processes are killed on DELETE — manually registered agents untouched |
| Dispatch auto-claims task | `dispatchTask` claims server-side, injects `lock_token`/`task_id`, releases on prompt send failure |
| `OPENCODE_SERVER_PASSWORD` | Env var only — NOT in `opencode.json` (schema has `additionalProperties: false` on `server` block) |
| Serve + attach pattern | `opencode serve --port N` + `opencode attach http://127.0.0.1:N` for headless + TUI combo |
## Task Status Transitions

```
todo → locked (claim_task acquires lock)
locked → in_progress (worker starts work)
in_progress → review | done | failed
review → done (approve) | todo (reject)
done/failed → todo (re-open from dashboard)
ANY → ANY (admin-move, bypasses rules, emits ADMIN_OVERRIDE event)
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

## Workspace Mode

| Mode | When | Behavior |
|------|------|----------|
| `required` | Task-based agent sessions | `claimTask` calls `ensureActiveBaseWorkspace` → auto-reactivates archived workspaces → creates worktree |
| `disabled` | TUI / direct chat sessions | Workspace handling skipped entirely |

- `register_agent` MCP tool accepts optional `workspace_mode` param (defaults to `'disabled'`)
- `createWorktreeForTask` is idempotent — returns existing workspace if one already exists for taskId
- `ensureActiveBaseWorkspace` tries active → archived (reactivates) → null (caller must create)

## Playwright Testing Convention

**"Playwright 테스트" = Playwright MCP 브라우저 도구로 직접 조작. `.spec.ts` 파일 작성 금지.**

- Use `playwright_browser_navigate`, `_click`, `_type`, `_snapshot` etc.
- Set up test data via bash (direct `better-sqlite3` DB manipulation)
- Verify via `playwright_browser_snapshot` (accessibility tree)
- Do NOT create `tests/e2e/*.spec.ts` files for new tests

## Common Mistakes to Avoid

- Don't suppress types: no `as any`, `@ts-ignore`, `@ts-expect-error`
- Don't use static `.default(new Date().toISOString())` — use `.$defaultFn()`
- Don't bypass service layer for DB writes
- Don't generate DB migrations — use pragmatic ALTER TABLE approach
- Don't write Playwright `.spec.ts` files — use MCP browser tools interactively
