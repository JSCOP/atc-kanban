# ATC — Agent Task Coordinator

[![npm version](https://img.shields.io/npm/v/atc-kanban)](https://www.npmjs.com/package/atc-kanban)
[![license](https://img.shields.io/github/license/JSCOP/atc-kanban)](LICENSE)
[![node](https://img.shields.io/node/v/atc-kanban)](https://nodejs.org)
[![GitHub stars](https://img.shields.io/github/stars/JSCOP/atc-kanban)](https://github.com/JSCOP/atc-kanban)

Multi-agent task orchestration with kanban board for AI coding agents.

ATC coordinates multiple AI agents (Claude Code, Codex, Gemini CLI, OpenCode) working on the same codebase — providing task locking, branch isolation via git worktrees, and a real-time dashboard to monitor everything.

## Why ATC?

When you run multiple AI coding agents on a single project, they step on each other. Two agents edit the same file, branches conflict, and nobody knows who's working on what.

ATC solves this by acting as a central coordinator:

- **Task locking** — only one agent works on a task at a time (30 min TTL, auto-expires if agent dies)
- **Git worktree isolation** — each task gets its own worktree and branch, no file conflicts
- **Merge conflict detection** — blocks task completion when merge conflicts exist
- **Agent health monitoring** — PID-based checks auto-disconnect dead agents and release their locks
- **One orchestrator per project** — enforces a single main agent to prevent conflicting directives

## Features

- 🔌 **MCP Server** — AI agents interact via [Model Context Protocol](https://modelcontextprotocol.io) tools
- 📋 **Kanban Dashboard** — Real-time React 19 + WebSocket UI at `http://localhost:4000`
- 🌳 **Git Worktree Isolation** — each agent works on its own branch in its own directory
- 🔒 **Task Locking with TTL** — exclusive locks with automatic expiry (default 30 min)
- ✅ **Review Workflow** — approve tasks with automatic squash-merge back to base branch
- 🔗 **Dependency DAG** — task dependencies with circular dependency validation
- 💀 **Dead Agent Cleanup** — PID polling every 10s disconnects crashed agents
- 🚫 **Merge Conflict Blocking** — prevents completing tasks that would break the base branch

## Quick Start

```bash
# Start HTTP server + dashboard
npx atc-kanban

# Open dashboard at http://localhost:4000
```

For AI agent integration (MCP mode):

```bash
npx atc-kanban --mcp
```

## MCP Integration

Add ATC to your AI agent's MCP config:

**OpenCode** (`opencode.json`):
```json
{
  "mcpServers": {
    "atc": {
      "command": "npx",
      "args": ["atc-kanban", "--mcp"]
    }
  }
}
```

**Claude Code** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "atc": {
      "command": "npx",
      "args": ["atc-kanban", "--mcp"]
    }
  }
}
```

Once connected, agents can register, claim tasks, report progress, and submit for review — all through MCP tools.

## Task Flow

```
todo → locked → in_progress → review → done
                                      → failed
```

- **Main agent** (orchestrator) — creates tasks, reviews work, manages dependencies. Max 1 per project.
- **Worker agents** (executors) — claim tasks, work in isolated worktrees, submit for review.

When a task is approved, ATC automatically squash-merges the worktree branch back to the base branch.

## Architecture

pnpm monorepo with three packages:

| Package | Stack | Purpose |
|---------|-------|---------|
| `@atc/core` | Drizzle ORM + SQLite | Domain services, schema, business logic |
| `atc-kanban` (server) | Hono + WebSocket + MCP SDK | HTTP API, real-time events, MCP stdio server |
| `@atc/dashboard` | React 19 + Vite + Tailwind v4 | Kanban board UI, agent monitoring |

Data is stored in a local SQLite database at a platform-specific location (via [env-paths](https://github.com/sindresorhus/env-paths)):

| OS | Default DB Path |
|----|----------------|
| Windows | `%LOCALAPPDATA%\atc-kanban-nodejs\Data\atc.sqlite` |
| macOS | `~/Library/Application Support/atc-kanban-nodejs/atc.sqlite` |
| Linux | `~/.local/share/atc-kanban-nodejs/atc.sqlite` |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP server port |
| `DB_PATH` | *(platform-specific)* | SQLite database file path |
| `LOCK_TTL_MINUTES` | `30` | Task lock expiry in minutes |

Set via environment variables or `.env` file.

## Development

```bash
git clone https://github.com/JSCOP/atc-kanban.git
cd atc-kanban
pnpm install
pnpm dev        # API (:4000) + Dashboard (:5173) with hot reload
pnpm build      # Build all packages
pnpm test       # Run unit tests
pnpm lint       # Biome linter
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and guidelines.

## Support

If ATC is useful to you, consider [sponsoring the project](https://github.com/sponsors/JSCOP) to support ongoing development.

## License

[MIT](LICENSE) © JSCOP
