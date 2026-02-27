# Know-How

## ESM-Only Codebase

| Issue | Solution |
|-------|----------|
| `require()` fails | ESM-only — use `import`. Server tsup has CJS shim for `better-sqlite3` only |
| Import paths | Use `.js` extension in core+server: `import { X } from './foo.js'` |
| `__dirname` unavailable | Use `import.meta.url` + `fileURLToPath` if needed |

## better-sqlite3 (Native Module)

| Issue | Solution |
|-------|----------|
| Bundle fails | Marked as `external` in both tsup configs — never bundled |
| CJS in ESM | Server's `tsup.config.ts` adds `createRequire` banner automatically |
| Rebuild needed | After Node version change: `pnpm rebuild better-sqlite3` |

## MCP stdio Pitfalls

| Issue | Solution |
|-------|----------|
| Output corrupts MCP | **Never** `console.log()` in MCP mode — stdout IS the transport |
| Use `console.error()` | All server diagnostics go to stderr |
| Agent cleanup | MCP server hooks stdin EOF + SIGINT/SIGTERM → auto-disconnect agent + release locks |
| Session tracking | `McpSessionTracker` stores agentId per session for cleanup |

## Lock & Health System

| Behavior | Detail |
|----------|--------|
| Lock TTL | 30 min default. `report_progress` refreshes timer |
| Expiry check | Every 30s. Expired → task reverts to `todo`, `LOCK_EXPIRED` event |
| PID health | Every 10s. Dead process → agent disconnected + all locks released |
| Main agent | Max 1 active. Enforced in AgentRegistry service layer |
| Worker stall | Must call `report_progress` every 5 min (recommended) or risk lock expiry |

## OpenCode Discovery

| Topic | Detail |
|-------|--------|
| TUI + HTTP server | CLI `--port 0` (auto-port) or config `server.mdns: true` enables HTTP in TUI mode |
| Config schema | `server.port` requires `exclusiveMinimum: 0` — `port: 0` is invalid in config. Use CLI `--port 0` instead |
| Multi-instance | Auto-port assigns random ports in ~14000-15000 range (OS-dependent). First tries 4096, rest random |
| opencode.json ref | Schema: `https://opencode.ai/config.json`. Fields: `port`, `hostname`, `mdns`, `mdnsDomain`, `cors` |
| Discoverable modes | `opencode serve`, `opencode --port N`, `opencode web`, TUI with `--port`/`--mdns` flag |
| Port scan range | `[4096]` priority, then `14000-14100` fallback range. PID→Port mapping catches ports outside range |
| PID→Port mapping | `netstat -ano` (Win) / `ss -tlnp` (Unix) resolves random ports from detected PIDs |
| Process detection | `wmic` (Win) / `ps` (Unix) — filters out LSP subprocesses (`typescript-language-server`) |
| Health probe | `GET /global/health` → `{ healthy: true, version: "1.2.15" }` with 500ms timeout |
| Windows port exclusions | Hyper-V reserves dynamic ranges (check `netsh interface ipv4 show excludedportrange`) |

## Dashboard Dev Proxy

| Issue | Solution |
|-------|----------|
| CORS in dev | Vite proxies `/api` and `/ws` to `:4000` — no CORS issues |
| WS connection | Single connection via `useWebSocket` hook — don't create additional |
| State sync | WS events dispatch to Zustand stores automatically |

## Database Gotchas

| Issue | Solution |
|-------|----------|
| Timestamps | Always `.$defaultFn(() => new Date().toISOString())`, never static `.default()` |
| JSON fields | `labels` and `payload` are text columns — parse/stringify in service layer |
| Unique main | Partial unique index doesn't work in Drizzle — enforced in service layer instead |
| No migrations | Use `initializeDatabase()` in `connection.ts` with `ALTER TABLE` pragmatic checks |
| FK cleanup | `deleteTask()` cleans `taskDependencies`, `workspaces` before task delete. `removeById()` cleans agent refs. |

## Task Status Flow

```
todo → locked (claim_task) → in_progress → review → done
                                  ↓              ↓
                                failed      rejected → todo
                                  ↓
Lock expired/released → todo
```

## Server drizzle-orm Import Rule

Server must NOT import `drizzle-orm` directly. Import `eq` from `@atc/core` which re-exports it:

```typescript
// CORRECT (server code)
import { eq, schema } from '@atc/core';

// WRONG (server code)
import { eq } from 'drizzle-orm';
```
