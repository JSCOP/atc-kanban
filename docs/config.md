# Configuration

## Environment Variables (`.env.example`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP server port |
| `DB_PATH` | `resolve('./data/atc.sqlite')` | SQLite database file path (default resolved to absolute path) |
| `LOCK_TTL_MINUTES` | `30` | Task lock expiry time (minutes) |
| `HEARTBEAT_TIMEOUT_SECONDS` | `60` | (Legacy) Heartbeat timeout — replaced by PID health check |
| `LOG_LEVEL` | `info` | Log verbosity |

## Biome (`biome.json`)

```json
{
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "quoteStyle": "single", "semicolons": "always" },
  "linter": { "rules": { "recommended": true, "noUnusedImports": "warn", "noUnusedVariables": "warn" } },
  "files": { "ignore": ["node_modules", "dist", "data", "*.sqlite"] }
}
```

## TypeScript (`tsconfig.base.json`)

```json
{
  "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
  "strict": true, "esModuleInterop": true, "declaration": true,
  "sourceMap": true, "isolatedModules": true
}
```

## Build Tools

| Package | Tool | Config |
|---------|------|--------|
| core | tsup | `tsup.config.ts` — ESM, `better-sqlite3` external |
| server | tsup | `tsup.config.ts` — ESM, CJS shim for `better-sqlite3` |
| dashboard | Vite | `vite.config.ts` — React plugin, Tailwind v4, proxy `/api`→`:4000` |

## Vite Dev Proxy

```typescript
// dashboard/vite.config.ts
proxy: {
  '/api': 'http://localhost:4000',
  '/ws': { target: 'ws://localhost:4000', ws: true }
}
```

## SQLite Pragmas (set in `connection.ts`)

| Pragma | Value | Purpose |
|--------|-------|---------|
| `journal_mode` | WAL | Concurrent reads during writes |
| `busy_timeout` | 5000ms | Wait instead of immediate SQLITE_BUSY |
| `synchronous` | NORMAL | Balance between safety and speed |
| `foreign_keys` | ON | Enforce FK constraints |

## pnpm Workspace (`pnpm-workspace.yaml`)

```yaml
packages:
  - packages/*
```

## MCP Integration (`opencode.json`)

Configures ATC as MCP server for AI agents. Uses `--mcp` flag for stdio mode.
