# Testing

## Test Infrastructure

| Type | Framework | How | Location |
|------|-----------|-----|----------|
| Unit/Integration | Vitest | `pnpm test` (CLI) | `packages/**/__tests__/*.test.ts` |
| E2E / UI | Playwright MCP | Agent uses Playwright MCP browser tools directly | No spec files — interactive |

## Playwright Testing = MCP Browser Tools

**"Playwright 테스트" = Playwright MCP 도구로 실제 브라우저를 직접 조작하여 검증.**

Do NOT write `.spec.ts` test files. Instead, use these MCP tools interactively:

| Tool | Purpose |
|------|---------|
| `playwright_browser_navigate` | Navigate to a URL |
| `playwright_browser_snapshot` | Get page accessibility tree (preferred over screenshot) |
| `playwright_browser_click` | Click elements by ref |
| `playwright_browser_type` | Type into inputs |
| `playwright_browser_select_option` | Select dropdown options |
| `playwright_browser_take_screenshot` | Visual verification |

### Workflow

1. Set up test data via `bash` (direct DB manipulation with `better-sqlite3`)
2. Navigate to the page with `playwright_browser_navigate`
3. Interact with UI elements using `click`, `type`, `select_option`
4. Verify results via `snapshot` (check element text/state)
5. Clean up test data via `bash`

### Example

```
# 1. Create test task in DB
bash: node -e "const db = require('better-sqlite3')('data/atc.sqlite'); ..."

# 2. Navigate
playwright_browser_navigate: http://localhost:4000/tasks/test-id

# 3. Interact
playwright_browser_select_option: ref=e93, values=["done"]
playwright_browser_click: ref=e95  (Force Move button)

# 4. Verify via snapshot — check status changed
playwright_browser_snapshot
```

## Existing Playwright Spec Files (Legacy)

These pre-date the MCP convention. They run via `pnpm test:e2e` (requires server on :4000):

| File | Tests |
|------|-------|
| `agent-health.spec.ts` | PID-based health check: agent Online → Offline |
| `discovery-flow.spec.ts` | OpenCode discovery: port scan, tracking |
| `spawn-form.spec.ts` | Spawn OpenCode server from dashboard UI |
| `opencode-dispatch.spec.ts` | Dispatch tasks to OpenCode workers |

## Vitest Coverage

| File | Scope |
|------|-------|
| `packages/core/src/services/__tests__/new-features.test.ts` | Core services (workspace mode, admin override, activity filter) |
| `packages/core/src/services/__tests__/session-reuse.test.ts` | Core services (agent session reconnection + OpenCode dispatch session reuse) |
| `packages/server/src/http/routes/__tests__/new-endpoints.test.ts` | HTTP integration (admin-move, agent activity endpoints) |

## Test Gaps

- No integration tests for MCP tools
- No test for WebSocket event broadcasting
- No CI/CD pipeline to run tests automatically
