# Commands

## Development

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run server + dashboard concurrently |
| `pnpm dev:server` | Server only (tsx watch, port 4000) |
| `pnpm dev:dashboard` | Dashboard only (Vite, port 5173) |

## Build

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all: core → server → dashboard (order matters) |
| `pnpm start` | Run built server: `node packages/server/dist/index.js` |

Build outputs:
- `packages/core/dist/index.js` + `index.d.ts`
- `packages/server/dist/index.js`
- `packages/dashboard/dist/` (static files)

## Database

| Command | Description |
|---------|-------------|
| `pnpm db:generate` | Generate Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations to SQLite |

**Workflow**: Edit `schema.ts` → `db:generate` → `db:migrate`

## Code Quality

| Command | Description |
|---------|-------------|
| `pnpm lint` | `biome check .` — lint all files |
| `pnpm format` | `biome format --write .` — auto-format |

## Testing

| Command | Description |
|---------|-------------|
| `pnpm test` | Vitest (unit tests — currently no test files) |
| `pnpm test:e2e` | Playwright E2E (requires `pnpm build` first) |

E2E auto-starts server on port 4000. Chromium only.

## MCP Mode

```bash
node packages/server/dist/index.js --mcp    # Start MCP stdio server
```

Used by AI agents (OpenCode, Claude Code) via `opencode.json` config.

## Per-Package Commands

| Package | Dev | Build |
|---------|-----|-------|
| `@atc/core` | — | `tsup` |
| `@atc/server` | `tsx watch src/index.ts` | `tsup` |
| `@atc/dashboard` | `vite` | `vite build` |

Run via filter: `pnpm -F @atc/server dev`
