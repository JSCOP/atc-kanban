# Contributing to ATC

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/JSCOP/atc-kanban.git
cd atc-kanban

# Install dependencies (requires pnpm)
pnpm install

# Start dev server (API :4000 + Dashboard :5173)
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint
```

## Project Structure

This is a pnpm monorepo with three packages:

| Package | Purpose |
|---------|---------|
| `packages/core` | Domain services, Drizzle ORM, SQLite |
| `packages/server` | Hono HTTP API, WebSocket, MCP server |
| `packages/dashboard` | React 19 SPA (Vite + Tailwind v4) |

## Conventions

- **ESM-only** — no `require()` or CommonJS
- **Biome** for linting/formatting — not ESLint/Prettier
- **No type suppression** — never use `as any`, `@ts-ignore`, `@ts-expect-error`
- **No `console.log` in server** — stdout is the MCP transport; use `console.error`
- **Import direction** — core imports nothing; server imports core; dashboard imports neither
- **IDs** — UUIDs as text strings
- **Dates** — ISO 8601 text strings

## Making Changes

1. Fork the repo and create a branch from `master`
2. Make your changes following the conventions above
3. Run `pnpm build && pnpm test && pnpm lint` to verify
4. Submit a pull request using the PR template

## Bug Reports & Feature Requests

Use the [issue templates](https://github.com/JSCOP/atc-kanban/issues/new/choose) on GitHub.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
