import { closeConnection, createServices, type ATCServices } from '@atc/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

let services: ATCServices;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  closeConnection();
  services = createServices({ dbPath: ':memory:' });
  app = createApp(services);
});

afterEach(() => {
  closeConnection();
});

describe('POST /api/tasks/:id/admin-move', () => {
  it('moves task to new status', async () => {
    const task = await services.taskService.createTask({ title: 'Move me' });

    const res = await app.request(`/api/tasks/${task.id}/admin-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { task: { id: string; status: string } };
    expect(data.task.id).toBe(task.id);
    expect(data.task.status).toBe('done');
  });

  it('returns 404 for non-existent task', async () => {
    const res = await app.request('/api/tasks/not-a-real-task/admin-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });

    expect([400, 404]).toContain(res.status);
  });

  it('returns error when moving to same status', async () => {
    const task = await services.taskService.createTask({ title: 'Same status' });

    const res = await app.request(`/api/tasks/${task.id}/admin-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'todo' }),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe('INVALID_TRANSITION');
  });

  it('clears assignment when moving to todo', async () => {
    const task = await services.taskService.createTask({ title: 'Assigned task' });
    const registration = await services.agentRegistry.register({
      name: 'Worker One',
      role: 'worker',
      workspaceMode: 'disabled',
    });

    await services.lockEngine.claimTask(
      { id: registration.agentId, cwd: null, workspaceMode: 'disabled' },
      task.id,
    );

    const res = await app.request(`/api/tasks/${task.id}/admin-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'todo' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      task: { status: string; assignedAgentId: string | null };
    };
    expect(data.task.status).toBe('todo');
    expect(data.task.assignedAgentId).toBeNull();
  });

  it('accepts optional reason', async () => {
    const task = await services.taskService.createTask({ title: 'Reason test' });

    const res = await app.request(`/api/tasks/${task.id}/admin-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'failed', reason: 'Testing override' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { task: { status: string } };
    expect(data.task.status).toBe('failed');
  });
});

describe('GET /api/agents/:id/activity', () => {
  it('returns empty activity for new agent', async () => {
    const registration = await services.agentRegistry.register({
      name: 'Fresh Agent',
      role: 'worker',
    });

    const res = await app.request(`/api/agents/${registration.agentId}/activity?since=9999-01-01T00:00:00.000Z`);

    expect(res.status).toBe(200);
    const data = (await res.json()) as { activity: unknown[] };
    expect(data.activity).toEqual([]);
  });

  it('returns agent connection event', async () => {
    const registration = await services.agentRegistry.register({
      name: 'Connected Agent',
      role: 'worker',
    });

    const res = await app.request(`/api/agents/${registration.agentId}/activity`);

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      activity: Array<{ type: string; agentId: string | null }>;
    };
    expect(data.activity.some((event) => event.type === 'AGENT_CONNECTED')).toBe(true);
    expect(data.activity.every((event) => event.agentId === registration.agentId)).toBe(true);
  });

  it('respects limit parameter', async () => {
    const registration = await services.agentRegistry.register({
      name: 'Busy Agent',
      role: 'worker',
    });

    await services.agentRegistry.renameAgent(registration.agentId, 'Busy Agent V2');
    await services.agentRegistry.renameAgent(registration.agentId, 'Busy Agent V3');

    const res = await app.request(`/api/agents/${registration.agentId}/activity?limit=1`);

    expect(res.status).toBe(200);
    const data = (await res.json()) as { activity: unknown[] };
    expect(data.activity).toHaveLength(1);
  });

  it('returns not-found style response for non-existent agent id', async () => {
    const res = await app.request('/api/agents/not-a-real-agent/activity');

    expect([200, 400, 404]).toContain(res.status);

    if (res.status === 200) {
      const data = (await res.json()) as { activity: unknown[] };
      expect(data.activity).toEqual([]);
    }
  });
});
