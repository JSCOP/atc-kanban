import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ATCError,
  type ATCServices,
  closeConnection,
  createServices,
  schema,
} from '../../index.js';

// Helper to create a fresh service container for each test
function setup(): ATCServices {
  return createServices({ dbPath: ':memory:' });
}

// Helper to register a test agent
async function registerAgent(
  services: ATCServices,
  overrides: {
    name?: string;
    role?: 'main' | 'worker';
    workspaceMode?: 'required' | 'disabled';
  } = {},
) {
  return services.agentRegistry.register({
    name: overrides.name ?? 'test-agent',
    role: overrides.role ?? 'worker',
    agentType: 'custom',
    processId: process.pid,
    cwd: process.cwd(),
    workspaceMode: overrides.workspaceMode,
  });
}

// Helper to create a test task
async function createTask(services: ATCServices, title = 'Test Task') {
  return services.taskService.createTask({
    title,
    projectId: 'default',
  });
}

function expectATCError(error: unknown, code: string): asserts error is ATCError {
  expect(error).toBeInstanceOf(ATCError);
  expect((error as ATCError).code).toBe(code);
}

describe('new core service features', () => {
  let services: ATCServices;

  beforeEach(() => {
    closeConnection();
    services = setup();
  });

  describe('Agent Registration - workspaceMode', () => {
    it('registers agent with workspaceMode=required', async () => {
      const registration = await registerAgent(services, { workspaceMode: 'required' });
      const agent = services.agentRegistry.getById(registration.agentId);
      expect(agent.workspaceMode).toBe('required');
    });

    it('registers agent with workspaceMode=disabled', async () => {
      const registration = await registerAgent(services, { workspaceMode: 'disabled' });
      const agent = services.agentRegistry.getById(registration.agentId);
      expect(agent.workspaceMode).toBe('disabled');
    });

    it('defaults workspaceMode to disabled when not specified', async () => {
      const registration = await registerAgent(services);
      const agent = services.agentRegistry.getById(registration.agentId);
      expect(agent.workspaceMode).toBe('disabled');
    });

    it('preserves workspaceMode on reactivation', async () => {
      const initial = await registerAgent(services, {
        name: 'reactivate-agent',
        workspaceMode: 'required',
      });

      await services.agentRegistry.disconnectById(initial.agentId);

      const reactivated = await registerAgent(services, {
        name: 'reactivate-agent',
        workspaceMode: 'disabled',
      });
      const agent = services.agentRegistry.getById(reactivated.agentId);

      expect(reactivated.reconnected).toBe(true);
      expect(reactivated.agentId).toBe(initial.agentId);
      expect(agent.workspaceMode).toBe('required');
    });
  });

  describe('adminMoveTask', () => {
    it('moves task from todo to done', async () => {
      const task = await createTask(services);
      const moved = await services.lockEngine.adminMoveTask(task.id, 'done');
      expect(moved.status).toBe('done');
    });

    it('moves task from todo to in_progress', async () => {
      const task = await createTask(services);
      const moved = await services.lockEngine.adminMoveTask(task.id, 'in_progress');
      expect(moved.status).toBe('in_progress');
    });

    it('moves task to todo clears assignment and lock', async () => {
      const task = await createTask(services);
      const registration = await registerAgent(services, { workspaceMode: 'disabled' });
      const agent = services.agentRegistry.getById(registration.agentId);

      await services.lockEngine.claimTask(
        { id: agent.id, cwd: null, workspaceMode: 'disabled' },
        task.id,
      );

      const moved = await services.lockEngine.adminMoveTask(task.id, 'todo');
      const lock = services.db
        .select()
        .from(schema.taskLocks)
        .where(eq(schema.taskLocks.taskId, task.id))
        .get();

      expect(moved.status).toBe('todo');
      expect(moved.assignedAgentId).toBeNull();
      expect(lock).toBeUndefined();
    });

    it('throws on same-status move', async () => {
      const task = await createTask(services);

      try {
        await services.lockEngine.adminMoveTask(task.id, 'todo');
        throw new Error('Expected adminMoveTask to throw');
      } catch (error) {
        expectATCError(error, 'INVALID_TRANSITION');
      }
    });

    it('throws for non-existent task', async () => {
      try {
        await services.lockEngine.adminMoveTask('fake-id', 'done');
        throw new Error('Expected adminMoveTask to throw');
      } catch (error) {
        expectATCError(error, 'TASK_NOT_FOUND');
      }
    });

    it('emits ADMIN_OVERRIDE event', async () => {
      const task = await createTask(services);
      await services.lockEngine.adminMoveTask(task.id, 'done', 'test reason');

      const events = services.eventBus.pollEvents({ types: ['ADMIN_OVERRIDE'] });
      const adminEvent = events.find((event) => event.taskId === task.id);

      expect(adminEvent).toBeDefined();
      expect(adminEvent?.payload.oldStatus).toBe('todo');
      expect(adminEvent?.payload.newStatus).toBe('done');
      expect(adminEvent?.payload.reason).toBe('test reason');
    });
  });

  describe('claimTask - workspaceMode handling', () => {
    it('skips workspace when workspaceMode=disabled', async () => {
      const registration = await registerAgent(services, { workspaceMode: 'disabled' });
      const task = await createTask(services);

      const result = await services.lockEngine.claimTask(
        { id: registration.agentId, cwd: null, workspaceMode: 'disabled' },
        task.id,
      );
      const updatedTask = services.taskService.getTask(task.id);

      expect(result.workspace).toBeUndefined();
      expect(updatedTask.status).toBe('in_progress');
    });

    it('throws WORKSPACE_NOT_FOUND when workspaceMode=required and no cwd', async () => {
      const registration = await registerAgent(services, { workspaceMode: 'required' });
      const task = await createTask(services);

      try {
        await services.lockEngine.claimTask(
          { id: registration.agentId, cwd: null, workspaceMode: 'required' },
          task.id,
        );
        throw new Error('Expected claimTask to throw');
      } catch (error) {
        expectATCError(error, 'WORKSPACE_NOT_FOUND');
      }
    });

    it('throws WORKSPACE_NOT_FOUND when workspaceMode=required and no workspace exists', async () => {
      const registration = await registerAgent(services, { workspaceMode: 'required' });
      const task = await createTask(services);

      try {
        await services.lockEngine.claimTask(
          {
            id: registration.agentId,
            cwd: '/nonexistent/path',
            workspaceMode: 'required',
          },
          task.id,
        );
        throw new Error('Expected claimTask to throw');
      } catch (error) {
        expectATCError(error, 'WORKSPACE_NOT_FOUND');
      }
    });
  });

  describe('pollEvents - agentId filter', () => {
    it('returns all events when no agentId filter', async () => {
      const agent1 = await registerAgent(services, { name: 'worker-1' });
      const agent2 = await registerAgent(services, { name: 'worker-2' });
      const task = await createTask(services);

      await services.eventBus.publish('TASK_CLAIMED', {
        taskId: task.id,
        agentId: agent1.agentId,
        payload: { marker: 'agent-1' },
      });
      await services.eventBus.publish('TASK_RELEASED', {
        taskId: task.id,
        agentId: agent2.agentId,
        payload: { marker: 'agent-2' },
      });

      const events = services.eventBus.pollEvents({ limit: 100 });

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.some((event) => event.agentId === agent1.agentId)).toBe(true);
      expect(events.some((event) => event.agentId === agent2.agentId)).toBe(true);
    });

    it('filters events by agentId', async () => {
      const agent1 = await registerAgent(services, { name: 'worker-filter-1' });
      const agent2 = await registerAgent(services, { name: 'worker-filter-2' });
      const task = await createTask(services);

      await services.eventBus.publish('TASK_CLAIMED', {
        taskId: task.id,
        agentId: agent1.agentId,
        payload: { marker: 'agent-1' },
      });
      await services.eventBus.publish('TASK_RELEASED', {
        taskId: task.id,
        agentId: agent2.agentId,
        payload: { marker: 'agent-2' },
      });

      const filtered = services.eventBus.pollEvents({
        agentId: agent1.agentId,
        limit: 100,
      });

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((event) => event.agentId === agent1.agentId)).toBe(true);
    });

    it('returns empty array when agent has no events', () => {
      const events = services.eventBus.pollEvents({ agentId: 'nonexistent-agent', limit: 100 });
      expect(events).toEqual([]);
    });
  });

  describe('Workspace Service - ensureActiveBaseWorkspace', () => {
    it('returns null when no workspace exists', () => {
      const workspace = services.workspaceService.ensureActiveBaseWorkspace('/some/path');
      expect(workspace).toBeNull();
    });

    it('returns active base workspace', () => {
      const { workspaces } = schema;

      services.db
        .insert(workspaces)
        .values({
          id: 'ws-active-base',
          repoRoot: '/test/repo',
          baseBranch: 'main',
          branchName: 'main',
          worktreePath: '/test/repo',
          status: 'active',
          taskId: null,
          agentId: null,
          createdAt: new Date().toISOString(),
        })
        .run();

      const workspace = services.workspaceService.ensureActiveBaseWorkspace('/test/repo');

      expect(workspace).not.toBeNull();
      expect(workspace?.id).toBe('ws-active-base');
      expect(workspace?.status).toBe('active');
    });

    it('reactivates archived base workspace', () => {
      const { workspaces } = schema;

      services.db
        .insert(workspaces)
        .values({
          id: 'ws-archived-base',
          repoRoot: '/test/repo-archived',
          baseBranch: 'main',
          branchName: 'main',
          worktreePath: '/test/repo-archived',
          status: 'archived',
          taskId: null,
          agentId: null,
          createdAt: new Date().toISOString(),
        })
        .run();

      const workspace = services.workspaceService.ensureActiveBaseWorkspace('/test/repo-archived');

      expect(workspace).not.toBeNull();
      expect(workspace?.status).toBe('active');
      const stored = services.workspaceService.getWorkspace('ws-archived-base');
      expect(stored.status).toBe('active');
    });

    it('ignores task-specific workspaces', async () => {
      const task = await createTask(services, 'Task-specific workspace task');
      const { workspaces } = schema;

      services.db
        .insert(workspaces)
        .values({
          id: 'ws-task-specific',
          repoRoot: '/test/repo-task-specific',
          baseBranch: 'main',
          branchName: 'task/specific',
          worktreePath: '/test/repo-task-specific/.worktrees/task',
          status: 'active',
          taskId: task.id,
          agentId: null,
          createdAt: new Date().toISOString(),
        })
        .run();

      const workspace = services.workspaceService.ensureActiveBaseWorkspace(
        '/test/repo-task-specific',
      );
      expect(workspace).toBeNull();
    });
  });

  describe('Workspace Service - reactivateWorkspace', () => {
    it('reactivates archived workspace', async () => {
      const { workspaces } = schema;

      services.db
        .insert(workspaces)
        .values({
          id: 'ws-reactivate-archived',
          repoRoot: '/test/repo-reactivate',
          baseBranch: 'main',
          branchName: 'main',
          worktreePath: '/test/repo-reactivate',
          status: 'archived',
          taskId: null,
          agentId: null,
          createdAt: new Date().toISOString(),
        })
        .run();

      const workspace =
        await services.workspaceService.reactivateWorkspace('ws-reactivate-archived');

      expect(workspace.status).toBe('active');
    });

    it('throws on non-archived workspace', async () => {
      const { workspaces } = schema;

      services.db
        .insert(workspaces)
        .values({
          id: 'ws-reactivate-active',
          repoRoot: '/test/repo-reactivate-active',
          baseBranch: 'main',
          branchName: 'main',
          worktreePath: '/test/repo-reactivate-active',
          status: 'active',
          taskId: null,
          agentId: null,
          createdAt: new Date().toISOString(),
        })
        .run();

      try {
        await services.workspaceService.reactivateWorkspace('ws-reactivate-active');
        throw new Error('Expected reactivateWorkspace to throw');
      } catch (error) {
        expectATCError(error, 'INVALID_WORKSPACE_STATUS');
      }
    });
  });

  describe('createWorktreeForTask - idempotency', () => {
    it('returns existing workspace for same taskId via findByTaskId', async () => {
      const task = await createTask(services, 'Idempotent worktree task');
      const { workspaces } = schema;

      services.db
        .insert(workspaces)
        .values({
          id: 'ws-existing-task',
          repoRoot: '/test/repo-idempotent',
          baseBranch: 'main',
          branchName: 'task/123',
          worktreePath: '/test/repo-idempotent/.worktrees/task-123',
          status: 'active',
          taskId: task.id,
          agentId: null,
          createdAt: new Date().toISOString(),
        })
        .run();

      const workspace = services.workspaceService.findByTaskId(task.id);

      expect(workspace).not.toBeNull();
      expect(workspace?.id).toBe('ws-existing-task');
      expect(workspace?.taskId).toBe(task.id);
    });
  });
});
