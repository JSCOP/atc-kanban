import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Write a JS snippet to a temp file and execute it with `node`.
 * This avoids ALL shell-quoting issues on Windows — no inline -e strings.
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

test.describe('Agent PID Health Check', () => {
  test.describe.configure({ timeout: 60000 });

  let dummyProcess: ChildProcess | undefined;

  test('agent transitions from Online to Offline when process dies', async ({ page }) => {
    // Step 1: Spawn a dummy long-lived process to get a real PID
    dummyProcess = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 999999)'], {
      detached: false,
      stdio: 'ignore',
    });

    const testPid = dummyProcess.pid;
    expect(testPid).toBeDefined();

    // Step 2: Register agent directly in DB with this PID
    const unique = Date.now();
    const agentId = `test-agent-${unique}`;
    const agentToken = `test-token-${unique}`;

    runNodeScript(`
      const path = require('node:path');
      const Database = require('better-sqlite3');
      const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
      const db = new Database(dbPath);
      db.prepare(
        "INSERT INTO agents (id, name, role, agent_type, agent_token, status, connected_at, last_heartbeat, process_id) " +
        "VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)"
      ).run(
        ${JSON.stringify(agentId)},
        'Test-Worker',
        'worker',
        'test',
        ${JSON.stringify(agentToken)},
        'active',
        ${testPid}
      );
      db.close();
    `);

    // Step 3: Navigate to agents page
    await page.goto('/agents');

    // Step 4: Verify agent shows as Online
    // AgentCard renders agent.name in an h3 and AgentStatusBadge renders 'Online'/'Offline'
    const agentCard = page.locator('div', { hasText: 'Test-Worker' }).first();
    await expect(agentCard).toBeVisible({ timeout: 10000 });
    await expect(agentCard.getByText('Online').first()).toBeVisible();

    // Step 5: Kill the dummy process
    dummyProcess.kill('SIGTERM');
    dummyProcess = undefined;

    // Step 6: Wait for process health checker (runs every 10s); 15s gives a full cycle
    await page.waitForTimeout(15000);

    // Step 7: Reload to see updated state
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Step 8: Verify agent now shows as Offline
    const sameAgentCard = page.locator('div', { hasText: 'Test-Worker' }).first();
    await expect(sameAgentCard).toBeVisible({ timeout: 10000 });
    await expect(sameAgentCard.getByText('Offline').first()).toBeVisible();
  });

  test.afterEach(() => {
    // Kill dummy process if still running (e.g. test failed before step 5)
    if (dummyProcess) {
      try {
        dummyProcess.kill('SIGTERM');
      } catch {
        // Ignore process cleanup failures.
      }
      dummyProcess = undefined;
    }

    // Remove test agents from DB
    try {
      runNodeScript(`
        const path = require('node:path');
        const Database = require('better-sqlite3');
        const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
        const db = new Database(dbPath);
        // Unassign agent from tasks first to avoid FK constraint
        const agent = db.prepare("SELECT id FROM agents WHERE name = 'Test-Worker'").get();
        if (agent) {
          db.prepare('UPDATE tasks SET assigned_agent_id = NULL WHERE assigned_agent_id = ?').run(agent.id);
        }
        db.prepare("DELETE FROM agents WHERE name = 'Test-Worker'").run();
        db.close();
      `);
    } catch {
      // Ignore DB cleanup failures.
    }
  });
});
