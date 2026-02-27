import type { Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { createMockOpenCodeServer } from './helpers/mock-opencode-server';

/**
 * E2E: Discovery Scan → Detect → Track flow.
 *
 * Starts a mock OpenCode server on port 14001 (within the default scan range 14000–15000),
 * navigates to the Agents page, and verifies:
 *   1. Auto-scan on mount discovers the mock instance
 *   2. The discovered instance appears in "Discovered Instances" section
 *   3. Clicking "Track" registers it as an OpenCode agent
 *   4. The agent card appears in "OpenCode Agents" section
 *   5. Manual re-scan no longer shows it as unregistered
 *
 * Note: Real OpenCode instances may also be running during tests.
 * All locators are scoped to the mock port to avoid strict mode violations.
 *
 * Requirements:
 *   - ATC server running on localhost:4000 (built + started before test)
 */

const MOCK_PORT = 14001;
const ATC_API = 'http://localhost:4000/api';

/** Delete any agents with a server URL containing the mock port. */
async function cleanupMockAgents(request: import('@playwright/test').APIRequestContext) {
  try {
    const res = await request.get(`${ATC_API}/agents`);
    if (!res.ok()) return;
    const { agents } = await res.json();
    for (const agent of agents) {
      if (agent.serverUrl?.includes(String(MOCK_PORT))) {
        await request.delete(`${ATC_API}/agents/${agent.id}`);
      }
    }
  } catch {
    // best-effort cleanup
  }
}

test.describe('Discovery: Scan → Detect → Track', () => {
  test.describe.configure({ timeout: 60000 });

  let mockServer: Server;

  test.beforeAll(async ({ request }) => {
    // Clean leftover agents from previous runs
    await cleanupMockAgents(request);

    // Start mock OpenCode server
    const mock = createMockOpenCodeServer(MOCK_PORT);
    mockServer = await mock.start();
  });

  test.afterAll(async ({ request }) => {
    // Stop mock server
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    }
    // Clean up tracked agents
    await cleanupMockAgents(request);
  });

  test('auto-scan discovers mock OpenCode instance on mount', async ({ page }) => {
    // Navigate to agents page — triggers auto-scan on mount
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');

    // Wait for the auto-scan to complete (scanning indicator disappears)
    await expect(page.getByText('Scanning...')).not.toBeVisible({ timeout: 15000 });

    // Should see discovered instance for the mock port
    const discoveredUrl = page.getByText(`http://127.0.0.1:${MOCK_PORT}`);
    await expect(discoveredUrl).toBeVisible({ timeout: 10000 });

    // Should see port label
    const portLabel = page.getByText(`Port ${MOCK_PORT}`);
    await expect(portLabel).toBeVisible();

    // Should see Track button next to the mock instance
    // Scope to the specific card containing the mock URL (exact match on the URL text)
    const mockCard = page.locator('div.bg-gray-900').filter({
      has: page.getByText(`http://127.0.0.1:${MOCK_PORT}`, { exact: true }),
    });
    await expect(mockCard.locator('button', { hasText: 'Track' })).toBeVisible();
  });

  test('tracking a discovered instance registers it as an OpenCode agent', async ({
    page,
    request,
  }) => {
    // Clean up first to ensure the instance is not already registered
    await cleanupMockAgents(request);

    // Navigate and wait for auto-scan
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Scanning...')).not.toBeVisible({ timeout: 15000 });

    // Verify the discovered instance is visible
    await expect(page.getByText(`http://127.0.0.1:${MOCK_PORT}`)).toBeVisible({ timeout: 10000 });

    // Click Track button specifically for the mock instance
    const mockCard = page.locator('div.bg-gray-900').filter({
      has: page.getByText(`http://127.0.0.1:${MOCK_PORT}`, { exact: true }),
    });
    await mockCard.locator('button', { hasText: 'Track' }).click();

    // Wait for tracking to complete and agent list to refresh
    await page.waitForTimeout(2000);

    // The agent should now appear as a registered OpenCode agent
    const agentName = page.getByText(`OpenCode@${MOCK_PORT}`);
    await expect(agentName.first()).toBeVisible({ timeout: 10000 });

    // The mock discovered instance should no longer have a Track button
    // (other real instances may still have Track buttons)
    const mockDiscovered = page.locator('div.bg-gray-900').filter({
      has: page.getByText(`http://127.0.0.1:${MOCK_PORT}`, { exact: true }),
    }).locator('button', { hasText: 'Track' });
    await expect(mockDiscovered).toHaveCount(0, { timeout: 5000 });
  });

  test('manual re-scan after tracking shows instance as already registered', async ({
    page,
    request,
  }) => {
    // Ensure the instance is tracked
    await cleanupMockAgents(request);
    const registerRes = await request.post(`${ATC_API}/agents/discover/track`, {
      data: { serverUrl: `http://127.0.0.1:${MOCK_PORT}`, name: `OpenCode@${MOCK_PORT}` },
    });
    expect(registerRes.ok()).toBeTruthy();

    // Navigate to agents page
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Scanning...')).not.toBeVisible({ timeout: 15000 });

    // The agent should be in the OpenCode Agents section
    await expect(page.getByText(`OpenCode@${MOCK_PORT}`).first()).toBeVisible({ timeout: 10000 });

    // Click Scan for Agents button manually
    const scanButton = page.locator('button', { hasText: 'Scan for Agents' });
    await scanButton.click();

    // Wait for scan to complete
    await expect(page.getByText('Scanning...')).not.toBeVisible({ timeout: 15000 });

    // The mock instance should NOT have a Track button (already registered)
    const mockTrack = page.locator('div.bg-gray-900').filter({
      has: page.getByText(`http://127.0.0.1:${MOCK_PORT}`, { exact: true }),
    }).locator('button', { hasText: 'Track' });
    await expect(mockTrack).toHaveCount(0, { timeout: 5000 });
  });

  test('discovery API returns processes array with correct structure', async ({ request }) => {
    // Verify the API returns the new processes field
    const response = await request.get(`${ATC_API}/agents/discover`);
    expect(response.ok()).toBeTruthy();

    const result = await response.json();

    // Verify result structure
    expect(result).toHaveProperty('discovered');
    expect(result).toHaveProperty('processes');
    expect(result).toHaveProperty('scannedRange');
    expect(result).toHaveProperty('duration');
    expect(Array.isArray(result.discovered)).toBeTruthy();
    expect(Array.isArray(result.processes)).toBeTruthy();

    // Should have discovered the mock server
    const mockInstance = result.discovered.find((d: { port: number }) => d.port === MOCK_PORT);
    expect(mockInstance).toBeDefined();
    expect(mockInstance.serverUrl).toBe(`http://127.0.0.1:${MOCK_PORT}`);
    expect(mockInstance.healthy).toBe(true);

    // Processes should be an array (might have opencode processes or not)
    expect(result.processes.length).toBeGreaterThanOrEqual(0);

    // If any processes are detected, verify structure including listenPorts
    for (const proc of result.processes) {
      expect(proc).toHaveProperty('pid');
      expect(proc).toHaveProperty('command');
      expect(proc).toHaveProperty('hasHttpServer');
      expect(proc).toHaveProperty('extractedPort');
      expect(proc).toHaveProperty('listenPorts');
      expect(typeof proc.pid).toBe('number');
      expect(Array.isArray(proc.listenPorts)).toBeTruthy();
    }
  });
});

test.describe('Discovery: Tracked agent can be assigned to a task', () => {
  test.describe.configure({ timeout: 60000 });

  let mockServer: Server;
  let trackedAgentId: string;
  let testTaskId: string;

  test.beforeAll(async ({ request }) => {
    // Clean leftover agents from previous runs
    await cleanupMockAgents(request);

    // Start mock OpenCode server
    const mock = createMockOpenCodeServer(MOCK_PORT);
    mockServer = await mock.start();

    // Track the mock as an agent via API
    const trackRes = await request.post(`${ATC_API}/agents/discover/track`, {
      data: { serverUrl: `http://127.0.0.1:${MOCK_PORT}`, name: `OpenCode@${MOCK_PORT}` },
    });
    const trackData = await trackRes.json();
    trackedAgentId = trackData.agentId;

    // Ensure a default project exists
    const projectsRes = await request.get(`${ATC_API}/projects`);
    const { projects } = await projectsRes.json();
    const projectId = projects[0]?.id;

    // Create a test task
    const taskRes = await request.post(`${ATC_API}/tasks`, {
      data: { projectId, title: 'E2E: agent-assignment test task', priority: 'medium' },
    });
    const taskData = await taskRes.json();
    testTaskId = taskData.task.id;
  });

  test.afterAll(async ({ request }) => {
    // Clean up task and agent
    if (testTaskId) {
      await request.delete(`${ATC_API}/tasks/${testTaskId}`);
    }
    await cleanupMockAgents(request);
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    }
  });

  test('tracked agent appears in agent list API', async ({ request }) => {
    const res = await request.get(`${ATC_API}/agents`);
    expect(res.ok()).toBeTruthy();
    const { agents } = await res.json();

    const tracked = agents.find((a: { id: string }) => a.id === trackedAgentId);
    expect(tracked).toBeDefined();
    expect(tracked.name).toBe(`OpenCode@${MOCK_PORT}`);
    expect(tracked.connectionType).toBe('opencode');
    expect(tracked.serverUrl).toBe(`http://127.0.0.1:${MOCK_PORT}`);
  });

  test('tracked agent can be assigned to a task via API', async ({ request }) => {
    // Assign agent to task
    const assignRes = await request.post(`${ATC_API}/tasks/${testTaskId}/assign`, {
      data: { agentId: trackedAgentId },
    });
    expect(assignRes.ok()).toBeTruthy();

    const { task } = await assignRes.json();
    expect(task.assignedAgentId).toBe(trackedAgentId);
  });

  test('assigned agent shows on task detail page in dashboard', async ({ page }) => {
    // Navigate to task detail page
    await page.goto(`/tasks/${testTaskId}`);
    await page.waitForLoadState('networkidle');

    // Should see the agent name associated with the task (use .first() since name may appear in multiple spots)
    await expect(page.getByText(`OpenCode@${MOCK_PORT}`).first()).toBeVisible({ timeout: 10000 });
  });

  test('agent can be unassigned from a task', async ({ request }) => {
    // Unassign agent (send null agentId)
    const unassignRes = await request.post(`${ATC_API}/tasks/${testTaskId}/assign`, {
      data: { agentId: null },
    });
    expect(unassignRes.ok()).toBeTruthy();

    const { task } = await unassignRes.json();
    expect(task.assignedAgentId).toBeNull();
  });
});
