# Testing

## Test Infrastructure

| Type | Framework | Config | Location |
|------|-----------|--------|----------|
| Unit | Vitest | `vitest` in root `package.json` | (no test files yet) |
| E2E | Playwright | `playwright.config.ts` | `tests/e2e/` |

## E2E Test Files

| File | Tests |
|------|-------|
| `agent-health.spec.ts` | PID-based health check: agent Online → Offline when process dies |
| `discovery-flow.spec.ts` | OpenCode discovery: port scan, tracking instances |
| `spawn-form.spec.ts` | Spawn OpenCode server from dashboard UI |
| `opencode-dispatch.spec.ts` | Dispatch tasks to OpenCode workers |

## Playwright Config

```typescript
{
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 0,
  use: { baseURL: 'http://localhost:4000', headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
}
```

## Running E2E Tests

```bash
# Prerequisites: server must be built and running
pnpm build
pnpm start          # separate terminal
pnpm test:e2e       # runs Playwright
```

## E2E Test Patterns

| Pattern | Detail |
|---------|--------|
| API helpers | `tests/e2e/helpers/` — shared utilities for test setup |
| Temp scripts | `runNodeScript()` writes JS to temp file to avoid shell quoting on Windows |
| Direct API calls | Tests use `fetch()` against `http://localhost:4000/api/*` |
| Browser only | Chromium-only — no Firefox/WebKit projects |

## Adding Unit Tests

Place test files adjacent to source: `src/services/task-service.test.ts`
Vitest discovers `*.test.ts` and `*.spec.ts` automatically.

## Test Gaps

- No unit tests exist yet
- No integration tests for MCP tools
- No test for WebSocket event broadcasting
- No CI/CD pipeline to run tests automatically
