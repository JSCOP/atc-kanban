# Configuration

## Environment Variables

Source: `.env.example` — loaded in `packages/server/src/index.ts`

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP server port |
| `DB_PATH` | `./data/atc.sqlite` | SQLite database file path |
| `LOCK_TTL_MINUTES` | `30` | Task lock expiry timeout |
| `HEARTBEAT_TIMEOUT_SECONDS` | `60` | (Legacy) heartbeat timeout |
| `LOG_LEVEL` | `info` | Logging verbosity |

Data directory is auto-created if it doesn't exist.

## TypeScript

Base config: `tsconfig.base.json` — extended by each package.

| Option | Value | Note |
|--------|-------|------|
| target | ES2022 | Node 20 compatible |
| module | ESNext | ESM-only |
| moduleResolution | bundler | |
| strict | true | Full strict mode |
| declaration | true | Type declarations for library consumers |
| isolatedModules | true | Required for esbuild/tsup |
| forceConsistentCasingInFileNames | true | |

**Package overrides**: Dashboard adds `jsx: react-jsx` + DOM libs, no declaration emit.

## Biome (Linting + Formatting)

Config: `biome.json`

| Rule | Setting |
|------|---------|
| Indent | 2 spaces |
| Line width | 100 chars |
| Quotes | Single |
| Semicolons | Always |
| Unused imports | Warn |
| Unused variables | Warn |
| Import organization | Enabled (auto-sort) |

**Ignored**: `node_modules`, `dist`, `data`, `*.sqlite`

```bash
pnpm lint    # biome check .
pnpm format  # biome format --write .
```

## Build Tools

| Package | Tool | Format | Target | Notes |
|---------|------|--------|--------|-------|
| core | tsup | ESM | Node 20 | Generates `.d.ts`, externals: `better-sqlite3` |
| server | tsup | ESM | Node 20 | CJS require banner for native modules |
| dashboard | Vite | ESM | Browsers | React + Tailwind plugins |

## Vite Dev Proxy

Config: `packages/dashboard/vite.config.ts`

| Path | Target | Note |
|------|--------|------|
| `/api` | `http://localhost:4000` | REST API proxy |
| `/ws` | `ws://localhost:4000` | WebSocket proxy |

## MCP Integration

Config: `opencode.json`

```json
{
  "mcp": {
    "agent-task-coordinator": {
      "type": "local",
      "command": ["node", "packages/server/dist/index.js", "--mcp"]
    }
  }
}
```

## Drizzle ORM

Config: `packages/core/drizzle.config.ts`

| Setting | Value |
|---------|-------|
| Dialect | SQLite |
| Schema | `packages/core/src/db/schema.ts` |
| Migrations | `packages/core/src/db/migrations/` |
| DB path | `../../data/atc.sqlite` (relative to core) |
