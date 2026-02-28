# Commands

## Development

| Command | Description | Notes |
|---------|-------------|-------|
| `pnpm dev` | Start server + dashboard concurrently | Server `:4000` (tsx watch), Dashboard `:5173` (vite) |
| `pnpm dev:server` | Server only | `pnpm -F @atc/server dev` → tsx watch |
| `pnpm dev:dashboard` | Dashboard only | `pnpm -F @atc/dashboard dev` → vite |

## Build & Production

| Command | Description | Notes |
|---------|-------------|-------|
| `pnpm build` | Build all packages | Order: core → server → dashboard |
| `pnpm start` | Production server | `node packages/server/dist/index.js` — serves dashboard static |

## Code Quality

| Command | Description | Notes |
|---------|-------------|-------|
| `pnpm lint` | Check linting | `biome check .` |
| `pnpm format` | Auto-format | `biome format --write .` |

## Testing

| Command | Description | Notes |
|---------|-------------|-------|
| `pnpm test` | Unit tests | `vitest` — currently no test files |
| `pnpm test:e2e` | E2E tests | `playwright test` — requires built server on `:4000` |

## Database

| Command | Description | Notes |
|---------|-------------|-------|
| `pnpm db:generate` | Generate Drizzle migration | `drizzle-kit generate` |
| `pnpm db:migrate` | Apply migrations | `drizzle-kit migrate` |

## Server Modes

| Mode | Command | Protocol |
|------|---------|----------|
| HTTP+WS (default) | `pnpm start` | REST API + WebSocket on `:4000` |
| MCP stdio | `node packages/server/dist/index.js --mcp` | stdin/stdout MCP protocol |

## E2E Test Prerequisites

```bash
# 1. Build everything
pnpm build

# 2. Start server (separate terminal)
pnpm start

# 3. Run E2E tests
pnpm test:e2e
```

## Per-Package Scripts

| Package | `dev` | `build` |
|---------|-------|---------|
| core | `tsup --watch` | `tsup` |
| server | `tsx watch src/index.ts` | `tsup` |
| dashboard | `vite` | `vite build` |
