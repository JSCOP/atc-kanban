/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

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

test.afterEach(() => {
  try {
    runNodeScript(`
      const path = require('node:path');
      const Database = require('better-sqlite3');
      const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
      const db = new Database(dbPath);
      db.prepare("DELETE FROM task_locks WHERE task_id LIKE 'task-e2e-%'").run();
      db.prepare("DELETE FROM events WHERE agent_id LIKE 'agent-e2e-%'").run();
      db.prepare("DELETE FROM tasks WHERE id LIKE 'task-e2e-%'").run();
      db.prepare("DELETE FROM agents WHERE id LIKE 'agent-e2e-%'").run();
      db.close();
    `);
  } catch {
    // Ignore cleanup failures
  }
});

test.describe('Danger Zone - Admin Force Move', () => {
  test.describe.configure({ timeout: 60000 });

  test('admin can force-move a task from todo to done via UI', async ({ page }) => {
    const unique = Date.now();
    const taskId = `task-e2e-admin-${unique}`;
    const taskTitle = `E2E Admin Move Test ${unique}`;

    runNodeScript(`
      const path = require('node:path');
      const Database = require('better-sqlite3');
      const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
      const db = new Database(dbPath);
      const projectId = db.prepare("SELECT id FROM projects LIMIT 1").get()?.id || 'default';
      db.prepare(
        "INSERT INTO tasks (id, title, status, priority, labels, project_id, created_at, updated_at) VALUES (?, ?, 'todo', 'medium', '[]', ?, datetime('now'), datetime('now'))"
      ).run(${JSON.stringify(taskId)}, ${JSON.stringify(taskTitle)}, projectId);
      db.close();
    `);

    await page.goto(`/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Danger Zone')).toBeVisible({ timeout: 10000 });

    const statusSelect = page.locator('select').last();
    await statusSelect.selectOption('done');

    const reasonInput = page.getByPlaceholder('Reason (optional)...');
    await reasonInput.fill('E2E test override');

    await page.getByRole('button', { name: 'Force Move' }).click();

    await page.waitForTimeout(2000);
    await expect(page.getByText('done').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Agent Activity Panel', () => {
  test.describe.configure({ timeout: 60000 });

  test('Activity button opens activity panel for any agent', async ({ page }) => {
    const unique = Date.now();
    const agentId = `agent-e2e-activity-${unique}`;
    const agentName = `E2E-Activity-Agent-${unique}`;
    const eventId = `evt-${agentId}`;

    runNodeScript(`
      const path = require('node:path');
      const Database = require('better-sqlite3');
      const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
      const db = new Database(dbPath);
      db.prepare(
        "INSERT INTO agents (id, name, role, agent_type, agent_token, status, connected_at, last_heartbeat, process_id) VALUES (?, ?, 'worker', 'custom', ?, 'active', datetime('now'), datetime('now'), ?)"
      ).run(${JSON.stringify(agentId)}, ${JSON.stringify(agentName)}, ${JSON.stringify(`token-${agentId}`)}, ${process.pid});
      db.prepare(
        "INSERT INTO events (id, type, agent_id, payload, timestamp) VALUES (?, 'AGENT_CONNECTED', ?, ?, datetime('now'))"
      ).run(${JSON.stringify(eventId)}, ${JSON.stringify(agentId)}, JSON.stringify({ agentName: ${JSON.stringify(agentName)} }));
      db.close();
    `);

    await page.goto('/agents');
    await page.waitForLoadState('networkidle');

    const agentCard = page.locator('div', { hasText: agentName }).first();
    await expect(agentCard).toBeVisible({ timeout: 10000 });

    const activityButton = agentCard.getByRole('button', { name: 'Activity' });
    await activityButton.click();

    await expect(page.getByText('Agent Activity')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(agentName)).toBeVisible();
  });
});

test.describe('Admin Move Clears Assignment', () => {
  test.describe.configure({ timeout: 60000 });

  test('admin-moving a claimed task to todo clears assignment', async ({ page }) => {
    const unique = Date.now();
    const taskId = `task-e2e-clear-${unique}`;
    const taskTitle = `E2E Clear Assignment ${unique}`;
    const agentId = `agent-e2e-clear-${unique}`;

    runNodeScript(`
      const path = require('node:path');
      const Database = require('better-sqlite3');
      const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
      const db = new Database(dbPath);
      const projectId = db.prepare("SELECT id FROM projects LIMIT 1").get()?.id || 'default';

      db.prepare(
        "INSERT INTO agents (id, name, role, agent_type, agent_token, status, connected_at, last_heartbeat, process_id) VALUES (?, 'ClearTest Worker', 'worker', 'custom', ?, 'active', datetime('now'), datetime('now'), ?)"
      ).run(${JSON.stringify(agentId)}, ${JSON.stringify(`token-${agentId}`)}, ${process.pid});

      db.prepare(
        "INSERT INTO tasks (id, title, status, priority, labels, project_id, assigned_agent_id, created_at, updated_at) VALUES (?, ?, 'in_progress', 'medium', '[]', ?, ?, datetime('now'), datetime('now'))"
      ).run(${JSON.stringify(taskId)}, ${JSON.stringify(taskTitle)}, projectId, ${JSON.stringify(agentId)});

      db.prepare(
        "INSERT INTO task_locks (id, task_id, agent_id, lock_token, acquired_at, expires_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+30 minutes'))"
      ).run(${JSON.stringify(`lock-${taskId}`)}, ${JSON.stringify(taskId)}, ${JSON.stringify(agentId)}, ${JSON.stringify(`locktoken-${taskId}`)});

      db.close();
    `);

    await page.goto(`/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('in_progress').first()).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Danger Zone')).toBeVisible();
    const statusSelect = page.locator('select').last();
    await statusSelect.selectOption('todo');
    await page.getByRole('button', { name: 'Force Move' }).click();

    await page.waitForTimeout(2000);
    await expect(page.getByText('Danger Zone')).toBeVisible({ timeout: 10000 });

    runNodeScript(`
      const path = require('node:path');
      const Database = require('better-sqlite3');
      const dbPath = path.resolve(process.cwd(), 'data', 'atc.sqlite');
      const db = new Database(dbPath);
      const task = db
        .prepare('SELECT status, assigned_agent_id FROM tasks WHERE id = ?')
        .get(${JSON.stringify(taskId)});

      if (!task) {
        throw new Error('Task not found after admin move');
      }
      if (task.status !== 'todo') {
        throw new Error(
          'Expected task status todo, got ' + task.status
        );
      }
      if (task.assigned_agent_id !== null) {
        throw new Error('Expected assigned_agent_id to be null after admin move to todo');
      }

      db.close();
    `);
  });
});
