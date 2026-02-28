## Current
- [ ] Investigate git worktree Windows failures (worker agent `export` command issue)

## Completed
- [x] Add workspace lifecycle methods and types for merge/archive/sync support
  - Done: Added `MergeResult` + `SyncResult`, extended `EventType`, re-exported new types,
    implemented `findByTaskId`, `archiveWorktree`, `mergeWorktree`, and `syncWithBase`.
  - Next: Wire new service methods into server/MCP endpoints when needed.
  - Blocker: none
- [x] Fix "Scan for Agents" discovery feature
  - Done: Added port 4096 priority scan, OS process detection (wmic/ps), TUI-only process UI section, Playwright E2E tests (4/4 pass)
  - Files changed: `server/services/opencode-discovery.ts`, `dashboard/types.ts`, `dashboard/stores/agent-store.ts`, `dashboard/pages/AgentsPage.tsx`, `tests/e2e/discovery-flow.spec.ts`
- [x] Restructure AGENTS.md + update stale docs
  - Done: Moved Document Protocol to file top as mandatory session init checklist. Updated api.md, architecture.md, know-how.md, read-log.md with current state.
- [x] Implement OpenCode Bridge feature (core + server + docs)
  - Done: Added `opencode_workers` schema, `OpenCodeBridge` service, new core types/exports, routes, and route wiring.
- [x] Fix task deletion FK constraint error
  - Done: Added `workspaces` cleanup in `deleteTask()` before task row deletion. Root cause: `workspaces.taskId` FK had no cascade delete.
  - Files changed: `core/services/task-service.ts`
- [x] Discovery: PID→Port mapping for random port instances
  - Done: Added `netstat -ano` (Win) / `ss -tlnp` (Unix) to resolve listen ports from detected PIDs. Discovery now finds OpenCode instances on any port.
  - Files changed: `server/services/opencode-discovery.ts`, `dashboard/types.ts`
