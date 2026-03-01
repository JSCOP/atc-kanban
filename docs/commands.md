# Commands

## Development

| Command | Description | Notes |
|---------|-------------|-------|
| `pnpm dev` | Start server + dashboard concurrently | Server `:4000` (tsx watch), Dashboard `:5173` (vite) |
| `pnpm dev:server` | Server only | `pnpm -F agent-task-coordinator dev` → tsx watch |
| `pnpm dev:dashboard` | Dashboard only | `pnpm -F @atc/dashboard dev` → vite |

## Build & Production

| Command | Description | Notes |
|---------|-------------|-------|
| `pnpm build` | Build all packages | Order: core → server → dashboard |
| `pnpm build:publish` | Build for npm publish | Order: core → dashboard → server → copy dashboard into dist/public |
| `pnpm start` | Production server | `node packages/server/dist/index.js` — serves dashboard static |

## npm Publishing

| Command | Description | Notes |
|---------|-------------|-------|
| `pnpm build:publish` | Full publish build | Bundles core into server, copies dashboard assets |
| `npm pack --dry-run` | Preview tarball | Run from `packages/server/` |
| `npm publish` | Publish to npm | Run from `packages/server/` after `build:publish` |

### User Installation

```jsonc
// opencode.json or claude_desktop_config.json
{
  "mcp": {
    "agent-task-coordinator": {
      "command": ["npx", "agent-task-coordinator", "--mcp"]
    }
  }
}
```

Or run directly: `npx agent-task-coordinator` (HTTP + Dashboard mode)

## Code Quality

| Command | Description | Notes |
|---------|-------------|-------|
| `pnpm lint` | Check linting | `biome check .` |
| `pnpm format` | Auto-format | `biome format --write .` |

## Testing

| Command | Description | Notes |
|---------|-------------|-------|
| `pnpm test` | Unit tests | `vitest` |
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

## Per-Package Scripts

| Package | `dev` | `build` |
|---------|-------|---------|
| core | `tsup --watch` | `tsup` |
| server | `tsx watch src/index.ts` | `tsup` (inlines @atc/core via noExternal) |
| dashboard | `vite` | `vite build` |
