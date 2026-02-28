import { execFileSync } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createMockOpenCodeServer } from './helpers/mock-opencode-server';

/**
 * Write a JS snippet to a temp file and execute it with `node`.
 * This avoids ALL shell-quoting issues on Windows - no inline -e strings.
 */
function runNodeScript(script: string): void {
  const tmpFile = join(tmpdir(), `atc-test-${Date.now()}.cjs`);
  try {
    writeFileSync(tmpFile, script, 'utf8');
    execFileSync(process.execPath, [tmpFile], { cwd: process.cwd() });
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // best-effort cleanup
    }
  }
}

test.describe('OpenCode Agent Dispatch (Unified)', () => {
  test.describe.configure({ timeout: 60000 });

  const mockOpenCodeServer = createMockOpenCodeServer(14200);
  let server: Awaited<ReturnType<ReturnType<typeof createMockOpenCodeServer>['start']>> | undefined;
  let testTaskId: string | undefined;

  test.beforeAll(async () => {
    server = await mockOpenCodeServer.start();
  });

  test.afterAll(async () => {
    if (server) {
      await mockOpenCodeServer.stop(server);
      server = undefined;
    }
  });

  test('register OpenCode agent, check health, dispatch task via dashboard', async ({ page }) => {
    const unique = Date.now();
    const taskTitle = `E2E Unified Dispatch Task ${unique}`;
    testTaskId = `test-task-${unique}`;

    // Step 1: Create a task in the default project directly in DB
    runNodeScript(`
      const path = require('node:path');
      const Database = require('better-sqlite3');
      const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
      const db = new Database(dbPath);

      db.prepare(
        "INSERT INTO tasks (id, project_id, title, status, priority, labels, created_at, updated_at) " +
        "VALUES (?, 'default', ?, 'todo', 'medium', '[]', datetime('now'), datetime('now'))"
      ).run(${JSON.stringify(testTaskId)}, ${JSON.stringify(taskTitle)});

      db.close();
    `);

    // Step 2: Navigate to Agents page
    await page.goto('/agents');

    // Step 3: Register OpenCode agent via Agents page form
    await page.getByPlaceholder('Agent name').fill('Test-MockAgent');
    await page.getByPlaceholder('http://localhost:3000').fill('http://127.0.0.1:14200');
    await page.getByRole('button', { name: 'Register Agent' }).click();
    await expect(page.getByText('Test-MockAgent')).toBeVisible({ timeout: 10000 });

    // Step 4: Health check and verify active status
    // Target the specific card div that contains h3 'Test-MockAgent'
    const agentCard = page.locator('.card-hover', {
      has: page.getByRole('heading', { name: 'Test-MockAgent', level: 3 }),
    });
    await agentCard.getByRole('button', { name: 'Health Check' }).click();
    await expect(agentCard.getByText('Online')).toBeVisible({ timeout: 10000 });

    // Step 5: Navigate to board page
    await page.goto('/');

    // Step 6: Find task card and click its dispatch button
    // Each task card is a button element containing h4 heading
    const taskCard = page.getByRole('button', { name: new RegExp(taskTitle) });
    await expect(taskCard).toBeVisible({ timeout: 10000 });
    await taskCard.getByRole('button', { name: 'Dispatch to worker' }).click();

    // Step 7: DispatchDialog flow
    await expect(page.getByRole('heading', { name: 'Dispatch Task', exact: true })).toBeVisible({
      timeout: 10000,
    });
    // Scope interactions to the dialog modal
    const dialog = page.locator('.animate-slide-in');
    // Select the mock agent by label (NOT by index — index selection can pick real OpenCode agents)
    await dialog.locator('select').first().selectOption({ label: /Test-MockAgent/ });
    await dialog
      .getByPlaceholder('Override the default task prompt with custom instructions...')
      .fill('Run this task through the OpenCode mock dispatcher.');
    await dialog.getByRole('button', { name: 'Dispatch', exact: true }).click();
    await expect(page.getByText('Task dispatched to Test-MockAgent')).toBeVisible({
      timeout: 10000,
    });

    // Step 8: Verify agent session is set in DB (unified agents table)
    runNodeScript(`
      const path = require('node:path');
      const Database = require('better-sqlite3');
      const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
      const db = new Database(dbPath);

      const agent = db
        .prepare("SELECT connection_type, server_url, session_id FROM agents WHERE name = 'Test-MockAgent'")
        .get();

      if (!agent) {
        throw new Error('Expected Test-MockAgent to exist in unified agents table');
      }

      if (agent.connection_type !== 'opencode') {
        throw new Error("Expected connection_type 'opencode', got '" + agent.connection_type + "'");
      }

      if (!agent.session_id) {
        throw new Error('Expected session_id to be set after dispatch');
      }

      // Verify task is assigned to the agent
      const task = db
        .prepare("SELECT assigned_agent_id FROM tasks WHERE id = ?")
        .get(${JSON.stringify(testTaskId)});

      if (!task || !task.assigned_agent_id) {
        throw new Error('Expected task to be assigned to agent after dispatch');
      }

      db.close();
    `);
  });

    // Cleanup: delete test tasks by title pattern and test agents by name (not by captured ID)
    // This is more robust than using testTaskId which may be undefined at script-creation time
    try {
      runNodeScript(`
        const path = require('node:path');
        const Database = require('better-sqlite3');
        const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
        const db = new Database(dbPath);

        // Unassign test agent from all tasks to avoid FK constraint
        const agent = db.prepare("SELECT id FROM agents WHERE name = 'Test-MockAgent'").get();
        if (agent) {
          db.prepare('UPDATE tasks SET assigned_agent_id = NULL WHERE assigned_agent_id = ?').run(agent.id);
        }

        // Delete test tasks by title pattern
        db.prepare("DELETE FROM tasks WHERE title LIKE 'E2E Unified Dispatch Task%'").run();

        // Delete test agent
        db.prepare("DELETE FROM agents WHERE name = 'Test-MockAgent'").run();

        db.close();
      `);
    } catch {
      // Ignore DB cleanup failures.
    } finally {
      testTaskId = undefined;
    }
});
