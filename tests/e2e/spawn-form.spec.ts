import { expect, test } from '@playwright/test';

test.describe('OpenCode Spawn Form UI', () => {
  test.describe.configure({ timeout: 30000 });

  test('spawn form is visible and functional on Agents page', async ({ page }) => {
    // Step 1: Navigate to Agents page
    await page.goto('/agents');

    // Step 2: Verify the "Spawn New OpenCode Process" form is visible
    await expect(
      page.getByRole('heading', { name: 'Spawn New OpenCode Process', exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // Step 3: Verify form fields exist
    const nameInput = page.getByPlaceholder('Auto-generated if empty');
    const cwdInput = page.getByPlaceholder('Defaults to server CWD');
    const spawnButton = page.getByRole('button', { name: 'Spawn Agent', exact: true });

    await expect(nameInput).toBeVisible();
    await expect(cwdInput).toBeVisible();
    await expect(spawnButton).toBeVisible();
    await expect(spawnButton).toBeEnabled();

    // Step 4: Verify the "Register OpenCode Agent" form is also still present
    await expect(
      page.getByRole('heading', { name: 'Register OpenCode Agent', exact: true }),
    ).toBeVisible();

    // Step 5: Fill the spawn form (we won't actually submit since opencode may not be available)
    await nameInput.fill('Test-Spawn-Agent');
    await cwdInput.fill('E:\\VibeCodingProject\\agent-team-kanban');

    // Verify values were entered
    await expect(nameInput).toHaveValue('Test-Spawn-Agent');
    await expect(cwdInput).toHaveValue('E:\\VibeCodingProject\\agent-team-kanban');
  });

  test('spawned agents list endpoint returns valid JSON', async ({ request }) => {
    const response = await request.get('/api/agents/spawned');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('spawned');
    expect(Array.isArray(body.spawned)).toBe(true);
  });

  test('spawn API endpoint exists and returns JSON error on failure', async ({ request }) => {
    // Call spawn with an invalid port to verify the endpoint is wired up
    // and returns structured JSON errors (not plain text crashes).
    const response = await request.post('/api/agents/spawn', {
      data: {
        name: 'E2E-Spawn-Test',
        cwd: process.cwd(),
        port: 14999,
      },
    });

    // The endpoint should return a JSON response regardless of outcome.
    // 201 = success (opencode available), 500 = spawn failed, 503 = spawner disabled
    const status = response.status();
    expect([201, 500, 503]).toContain(status);

    const body = await response.json();

    if (status === 201) {
      // If opencode is actually available and spawn succeeded
      expect(body).toHaveProperty('agentId');
      expect(body).toHaveProperty('serverUrl');
      expect(body).toHaveProperty('port', 14999);
      expect(body).toHaveProperty('pid');
      // Cleanup: kill the spawned agent
      await request.post(`/api/agents/${body.agentId}/kill`);
    } else if (status === 503) {
      expect(body).toHaveProperty('error', 'Spawner not available');
    } else {
      // 500 — spawn failed; verify it's a structured JSON error, not a crash
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
    }
  });
});
