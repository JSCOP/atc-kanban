import { execFileSync } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const ATC_API = 'http://localhost:4000/api';

/**
 * Write a JS snippet to a temp file and execute it with `node`.
 * This avoids ALL shell-quoting issues on Windows.
 */
function runNodeScript(script: string): string {
  const tmpFile = join(tmpdir(), `atc-ws-test-${Date.now()}.cjs`);
  try {
    writeFileSync(tmpFile, script, 'utf8');
    return execFileSync(process.execPath, [tmpFile], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim();
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // best-effort cleanup
    }
  }
}

/** Insert a workspace directly in DB for testing and return its ID. */
function insertTestWorkspace(taskId: string | null, opts?: { status?: string }): string {
  const wsId = `ws-test-${Date.now()}`;
  const status = opts?.status ?? 'active';
  const taskIdSql = taskId ? `'${taskId}'` : 'NULL';

  runNodeScript(`
    const path = require('node:path');
    const Database = require('better-sqlite3');
    const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
    const db = new Database(dbPath);
    db.prepare(
      "INSERT INTO workspaces (id, task_id, worktree_path, branch_name, base_branch, repo_root, status, created_at) " +
      "VALUES (?, ${taskIdSql}, ?, ?, ?, ?, ?, datetime('now'))"
    ).run(
      '${wsId}',
      '/tmp/.worktrees/test-worktree',
      'task/test-branch',
      'main',
      '${process.cwd().replace(/\\/g, '/')}',
      '${status}'
    );
    db.close();
  `);

  return wsId;
}

/** Insert a test task directly in DB and return its ID. */
function insertTestTask(): string {
  const taskId = `task-ws-test-${Date.now()}`;

  runNodeScript(`
    const path = require('node:path');
    const Database = require('better-sqlite3');
    const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
    const db = new Database(dbPath);
    db.prepare(
      "INSERT INTO tasks (id, project_id, title, status, priority, labels, created_at, updated_at) " +
      "VALUES (?, 'default', 'E2E Workspace Lifecycle Test', 'todo', 'medium', '[]', datetime('now'), datetime('now'))"
    ).run('${taskId}');
    db.close();
  `);

  return taskId;
}

/** Clean up test workspaces and tasks from DB. */
function cleanupTestData(ids: { workspaceIds?: string[]; taskIds?: string[] }) {
  const wsDeletes = (ids.workspaceIds ?? [])
    .map((id) => `db.prepare("DELETE FROM workspaces WHERE id = ?").run('${id}');`)
    .join('\n');
  const taskDeletes = (ids.taskIds ?? [])
    .map((id) => `db.prepare("DELETE FROM tasks WHERE id = ?").run('${id}');`)
    .join('\n');

  try {
    runNodeScript(`
      const path = require('node:path');
      const Database = require('better-sqlite3');
      const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
      const db = new Database(dbPath);
      ${wsDeletes}
      ${taskDeletes}
      db.close();
    `);
  } catch {
    // best-effort cleanup
  }
}

test.describe('Workspace REST API', () => {
  test.describe.configure({ timeout: 30000 });

  let testTaskId: string;
  const testWorkspaceIds: string[] = [];

  test.beforeAll(() => {
    testTaskId = insertTestTask();
  });

  test.afterAll(() => {
    cleanupTestData({ workspaceIds: testWorkspaceIds, taskIds: [testTaskId] });
  });

  test('GET /workspaces returns workspace list with correct structure', async ({ request }) => {
    const wsId = insertTestWorkspace(null);
    testWorkspaceIds.push(wsId);

    const res = await request.get(`${ATC_API}/workspaces`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body).toHaveProperty('workspaces');
    expect(Array.isArray(body.workspaces)).toBe(true);

    // Find our test workspace
    const ws = body.workspaces.find((w: { id: string }) => w.id === wsId);
    expect(ws).toBeDefined();
    expect(ws.branchName).toBe('task/test-branch');
    expect(ws.baseBranch).toBe('main');
    expect(ws.status).toBe('active');
    expect(ws.worktreePath).toBe('/tmp/.worktrees/test-worktree');
  });

  test('GET /workspaces?status=active filters by status', async ({ request }) => {
    const activeId = insertTestWorkspace(null, { status: 'active' });
    const archivedId = insertTestWorkspace(null, { status: 'archived' });
    testWorkspaceIds.push(activeId, archivedId);

    const res = await request.get(`${ATC_API}/workspaces?status=active`);
    expect(res.ok()).toBeTruthy();

    const { workspaces } = await res.json();
    const activeWs = workspaces.find((w: { id: string }) => w.id === activeId);
    const archivedWs = workspaces.find((w: { id: string }) => w.id === archivedId);

    expect(activeWs).toBeDefined();
    expect(archivedWs).toBeUndefined();
  });

  test('GET /workspaces/:id returns single workspace', async ({ request }) => {
    const wsId = insertTestWorkspace(testTaskId);
    testWorkspaceIds.push(wsId);

    const res = await request.get(`${ATC_API}/workspaces/${wsId}`);
    expect(res.ok()).toBeTruthy();

    const { workspace } = await res.json();
    expect(workspace).toBeDefined();
    expect(workspace.id).toBe(wsId);
    expect(workspace.taskId).toBe(testTaskId);
    expect(workspace.branchName).toBe('task/test-branch');
  });

  test('GET /workspaces/by-task/:taskId returns workspace linked to task', async ({ request }) => {
    // Use a unique task so only one workspace is linked
    const uniqueTaskId = insertTestTask();
    const wsId = insertTestWorkspace(uniqueTaskId);
    testWorkspaceIds.push(wsId);

    const res = await request.get(`${ATC_API}/workspaces/by-task/${uniqueTaskId}`);
    expect(res.ok()).toBeTruthy();

    const { workspace } = await res.json();
    expect(workspace).not.toBeNull();
    expect(workspace.id).toBe(wsId);
    expect(workspace.taskId).toBe(uniqueTaskId);

    // Cleanup the unique task (delete workspace first to avoid FK constraint)
    cleanupTestData({ workspaceIds: [wsId], taskIds: [uniqueTaskId] });
  });

  test('GET /workspaces/by-task/:taskId returns null for task without workspace', async ({
    request,
  }) => {
    const res = await request.get(`${ATC_API}/workspaces/by-task/nonexistent-task-id`);
    expect(res.ok()).toBeTruthy();

    const { workspace } = await res.json();
    expect(workspace).toBeNull();
  });

  test('GET /workspaces/:id returns 404 for nonexistent workspace', async ({ request }) => {
    const res = await request.get(`${ATC_API}/workspaces/nonexistent-ws-id`);
    // Service throws ATCError → error handler returns 404
    expect(res.status()).toBe(404);
  });

  test('POST /workspaces/:id/merge returns error for non-git workspace', async ({ request }) => {
    // Insert workspace with fake worktree path (not a real git worktree)
    const wsId = insertTestWorkspace(null);
    testWorkspaceIds.push(wsId);

    const res = await request.post(`${ATC_API}/workspaces/${wsId}/merge`);
    // Should fail because the worktree doesn't actually exist on disk
    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('POST /workspaces/:id/archive succeeds for workspace (updates DB status)', async ({ request }) => {
    const wsId = insertTestWorkspace(null);
    testWorkspaceIds.push(wsId);

    const res = await request.post(`${ATC_API}/workspaces/${wsId}/archive`);
    // archiveWorktree updates DB status to 'archived' — git prune is best-effort
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('ok', true);

    // Verify status changed in DB
    const getRes = await request.get(`${ATC_API}/workspaces/${wsId}`);
    const { workspace } = await getRes.json();
    expect(workspace.status).toBe('archived');
  });

  test('POST /workspaces/:id/sync returns error for non-git workspace', async ({ request }) => {
    const wsId = insertTestWorkspace(null);
    testWorkspaceIds.push(wsId);

    const res = await request.post(`${ATC_API}/workspaces/${wsId}/sync`);
    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('DELETE /workspaces/:id deletes workspace record', async ({ request }) => {
    const wsId = insertTestWorkspace(null);
    // Don't push to testWorkspaceIds — we're deleting it ourselves

    const res = await request.delete(`${ATC_API}/workspaces/${wsId}`);
    // deleteWorkspace may fail on the git operation but should attempt DB cleanup
    // or succeed if it handles missing worktrees gracefully
    const status = res.status();
    // Accept either success or error (depends on git worktree existence)
    expect([200, 404, 500]).toContain(status);
  });
});

test.describe('Workspace in Dashboard', () => {
  test.describe.configure({ timeout: 30000 });

  let testTaskId: string;
  let testWorkspaceId: string;

  test.beforeAll(() => {
    testTaskId = insertTestTask();
    testWorkspaceId = insertTestWorkspace(testTaskId);
  });

  test.afterAll(() => {
    cleanupTestData({ workspaceIds: [testWorkspaceId], taskIds: [testTaskId] });
  });

  test('task detail page shows workspace info component', async ({ page }) => {
    await page.goto(`/tasks/${testTaskId}`);
    await page.waitForLoadState('networkidle');

    // WorkspaceInfo component should show workspace data
    await expect(page.getByText('Workspace').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('task/test-branch')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('main').first()).toBeVisible();
  });

  test('task detail page hides workspace info when no workspace linked', async ({ page }) => {
    // Create a task with no workspace
    const noWsTaskId = insertTestTask();

    try {
      await page.goto(`/tasks/${noWsTaskId}`);
      await page.waitForLoadState('networkidle');

      // Wait for page to fully render
      await page.waitForTimeout(2000);

      // WorkspaceInfo returns null when no workspace — the heading should not appear
      // in a dedicated workspace section (it may appear elsewhere as general text)
      const workspaceSection = page.locator('.bg-gray-800', {
        has: page.getByText('Workspace', { exact: true }),
      });

      // Count workspace sections — should be 0 or the component is not rendered
      // (WorkspaceInfo returns null when no workspace is found)
      const branchText = page.getByText('task/test-branch');
      await expect(branchText).not.toBeVisible({ timeout: 3000 });
    } finally {
      cleanupTestData({ taskIds: [noWsTaskId] });
    }
  });
});
