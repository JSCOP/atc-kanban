import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATCError, type ATCServices, closeConnection, createServices } from '../../index.js';

function setup(): ATCServices {
  return createServices({ dbPath: ':memory:' });
}

async function createTask(services: ATCServices, title = 'Session reuse task') {
  return services.taskService.createTask({
    title,
    projectId: 'default',
  });
}

function expectATCError(error: unknown, code: string): asserts error is ATCError {
  expect(error).toBeInstanceOf(ATCError);
  expect((error as ATCError).code).toBe(code);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

describe('session reuse', () => {
  let services: ATCServices;
  let liveProcesses: ChildProcess[];

  beforeEach(() => {
    closeConnection();
    services = setup();
    liveProcesses = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const child of liveProcesses) {
      if (!child.killed) {
        child.kill();
      }
    }
  });

  function spawnLiveProcess(): ChildProcess {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
      stdio: 'ignore',
    });
    child.unref();
    liveProcesses.push(child);
    return child;
  }

  describe('AgentRegistry.register() sessionId reconnection', () => {
    it('reactivates disconnected agent when sessionId matches', async () => {
      const initial = await services.agentRegistry.register({
        name: 'worker-session-disconnected',
        role: 'worker',
        agentType: 'custom',
        processId: process.pid,
        cwd: process.cwd(),
        sessionId: 'session-disconnected',
      });

      await services.agentRegistry.disconnectById(initial.agentId);

      const reconnected = await services.agentRegistry.register({
        name: 'worker-session-disconnected',
        role: 'worker',
        agentType: 'custom',
        processId: process.pid,
        cwd: process.cwd(),
        sessionId: 'session-disconnected',
      });

      expect(reconnected.reconnected).toBe(true);
      expect(reconnected.agentId).toBe(initial.agentId);
    });

    it('reactivates active agent when sessionId matches but old process is dead', async () => {
      const deadPid = 999_999;

      const initial = await services.agentRegistry.register({
        name: 'worker-session-dead-pid',
        role: 'worker',
        agentType: 'custom',
        processId: deadPid,
        cwd: process.cwd(),
        sessionId: 'session-dead-pid',
      });

      const reconnected = await services.agentRegistry.register({
        name: 'worker-session-dead-pid',
        role: 'worker',
        agentType: 'custom',
        processId: process.pid,
        cwd: process.cwd(),
        sessionId: 'session-dead-pid',
      });

      expect(reconnected.reconnected).toBe(true);
      expect(reconnected.agentId).toBe(initial.agentId);
    });

    it('falls through from sessionId lookup to name+role matching', async () => {
      const initial = await services.agentRegistry.register({
        name: 'worker-name-role-fallback',
        role: 'worker',
        agentType: 'custom',
        processId: process.pid,
        cwd: process.cwd(),
      });

      await services.agentRegistry.disconnectById(initial.agentId);

      const reconnected = await services.agentRegistry.register({
        name: 'worker-name-role-fallback',
        role: 'worker',
        agentType: 'custom',
        processId: process.pid,
        cwd: process.cwd(),
        sessionId: 'session-not-found-fallback',
      });

      expect(reconnected.reconnected).toBe(true);
      expect(reconnected.agentId).toBe(initial.agentId);
    });

    it('creates new agent when sessionId and name+role have no match', async () => {
      const created = await services.agentRegistry.register({
        name: 'worker-new-session',
        role: 'worker',
        agentType: 'custom',
        processId: process.pid,
        cwd: process.cwd(),
        sessionId: 'session-new-agent',
      });

      expect(created.reconnected).toBe(false);
      const agent = services.agentRegistry.getById(created.agentId);
      expect(agent.sessionId).toBe('session-new-agent');
    });

    it('throws MAIN_ALREADY_ACTIVE for main when session matches live process with different pid', async () => {
      const liveChild = spawnLiveProcess();

      await services.agentRegistry.register({
        name: 'main-live-session',
        role: 'main',
        agentType: 'custom',
        processId: process.pid,
        cwd: process.cwd(),
        sessionId: 'main-live-session-id',
      });

      try {
        await services.agentRegistry.register({
          name: 'main-live-session',
          role: 'main',
          agentType: 'custom',
          processId: liveChild.pid,
          cwd: process.cwd(),
          sessionId: 'main-live-session-id',
        });
        throw new Error('Expected register to throw');
      } catch (error) {
        expectATCError(error, 'MAIN_ALREADY_ACTIVE');
      }
    });

    it('persists sessionId on reactivated agent record', async () => {
      const initial = await services.agentRegistry.register({
        name: 'worker-session-persist-reactivate',
        role: 'worker',
        agentType: 'custom',
        processId: process.pid,
        cwd: process.cwd(),
      });

      await services.agentRegistry.disconnectById(initial.agentId);

      const reconnected = await services.agentRegistry.register({
        name: 'worker-session-persist-reactivate',
        role: 'worker',
        agentType: 'custom',
        processId: process.pid,
        cwd: process.cwd(),
        sessionId: 'session-reactivated-persisted',
      });

      const agent = services.agentRegistry.getById(reconnected.agentId);
      expect(agent.sessionId).toBe('session-reactivated-persisted');
    });

    it('stores sessionId on newly created agent row', async () => {
      const created = await services.agentRegistry.register({
        name: 'worker-session-created-persist',
        role: 'worker',
        agentType: 'custom',
        processId: process.pid,
        cwd: process.cwd(),
        sessionId: 'session-created-persisted',
      });

      const agent = services.agentRegistry.getById(created.agentId);
      expect(agent.sessionId).toBe('session-created-persisted');
    });
  });

  describe('OpenCodeBridge.dispatchTask() session reuse path', () => {
    it('reuses provided sessionId when session exists and does not create a new session', async () => {
      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        const method = init?.method ?? 'GET';

        if (url.endsWith('/session/existing-session') && method === 'GET') {
          return jsonResponse(200, { id: 'existing-session', messages: [] });
        }

        if (url.endsWith('/session/existing-session/prompt_async') && method === 'POST') {
          return emptyResponse(204);
        }

        if (url.endsWith('/session') && method === 'POST') {
          return jsonResponse(500, { error: 'should-not-create-session' });
        }

        return jsonResponse(404, { error: 'not-found' });
      });
      vi.stubGlobal('fetch', fetchMock);

      const agent = await services.agentRegistry.registerOpenCodeAgent({
        name: 'opencode-reuse',
        serverUrl: 'http://localhost:9999',
      });
      const task = await createTask(services, 'Reuse existing session task');

      const result = await services.opencodeBridge.dispatchTask({
        agentId: agent.id,
        taskId: task.id,
        sessionId: 'existing-session',
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('existing-session');
      expect(result.message).toContain('reusing session');

      const createSessionCalls = fetchMock.mock.calls.filter(([input, init]) => {
        const method = init?.method ?? 'GET';
        return input.toString().endsWith('/session') && method === 'POST';
      });
      expect(createSessionCalls).toHaveLength(0);

      const updatedAgent = services.agentRegistry.getById(agent.id);
      expect(updatedAgent.sessionId).toBe('existing-session');
    });

    it('throws OPENCODE_SESSION_NOT_FOUND when provided sessionId is missing', async () => {
      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        const method = init?.method ?? 'GET';

        if (url.endsWith('/session/missing-session') && method === 'GET') {
          return jsonResponse(404, { error: 'missing' });
        }

        return jsonResponse(404, { error: 'not-found' });
      });
      vi.stubGlobal('fetch', fetchMock);

      const agent = await services.agentRegistry.registerOpenCodeAgent({
        name: 'opencode-missing-session',
        serverUrl: 'http://localhost:9999',
      });
      const task = await createTask(services, 'Missing session dispatch task');

      try {
        await services.opencodeBridge.dispatchTask({
          agentId: agent.id,
          taskId: task.id,
          sessionId: 'missing-session',
        });
        throw new Error('Expected dispatchTask to throw');
      } catch (error) {
        expectATCError(error, 'OPENCODE_SESSION_NOT_FOUND');
      }
    });

    it('creates a new session when sessionId is not provided', async () => {
      const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        const method = init?.method ?? 'GET';

        if (url.endsWith('/session') && method === 'POST') {
          return jsonResponse(200, { id: 'new-session-id' });
        }

        if (url.endsWith('/session/new-session-id/prompt_async') && method === 'POST') {
          return emptyResponse(204);
        }

        return jsonResponse(404, { error: 'not-found' });
      });
      vi.stubGlobal('fetch', fetchMock);

      const agent = await services.agentRegistry.registerOpenCodeAgent({
        name: 'opencode-new-session',
        serverUrl: 'http://localhost:9999',
      });
      const task = await createTask(services, 'Create session dispatch task');

      const result = await services.opencodeBridge.dispatchTask({
        agentId: agent.id,
        taskId: task.id,
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('new-session-id');
      expect(result.message).not.toContain('reusing session');

      const createSessionCalls = fetchMock.mock.calls.filter(([input, init]) => {
        const method = init?.method ?? 'GET';
        return input.toString().endsWith('/session') && method === 'POST';
      });
      expect(createSessionCalls).toHaveLength(1);

      const updatedAgent = services.agentRegistry.getById(agent.id);
      expect(updatedAgent.sessionId).toBe('new-session-id');
    });
  });
});
