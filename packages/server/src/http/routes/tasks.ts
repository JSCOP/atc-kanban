import { Hono } from 'hono';
import type { ATCServices, TaskStatus } from '@atc/core';

export function createTaskRoutes(services: ATCServices) {
  const app = new Hono();

  // GET /api/tasks - List tasks with optional filters
  app.get('/', (c) => {
    const statusParam = c.req.query('status');
    const priority = c.req.query('priority');
    const assignee = c.req.query('assignee');
    const label = c.req.query('label');
    const projectId = c.req.query('projectId');

    const status = statusParam ? (statusParam.split(',') as TaskStatus[]) : undefined;

    const tasks = services.taskService.listTasks({
      status,
      priority,
      assignee,
      label,
      projectId,
    });

    return c.json({ tasks });
  });

  // GET /api/tasks/:id - Get task detail
  app.get('/:id', (c) => {
    const taskId = c.req.param('id');
    const task = services.taskService.getTaskDetail(taskId);
    return c.json({ task });
  });

  // POST /api/tasks - Create task
  app.post('/', async (c) => {
    const body = await c.req.json();
    const task = await services.taskService.createTask({
      projectId: body.projectId,
      title: body.title,
      description: body.description,
      priority: body.priority,
      labels: body.labels,
      dependsOn: body.dependsOn,
    });
    return c.json({ task }, 201);
  });

  // PUT /api/tasks/:id - Update task
  app.put('/:id', async (c) => {
    const taskId = c.req.param('id');
    const body = await c.req.json();
    const task = await services.taskService.updateTask(taskId, {
      title: body.title,
      description: body.description,
      priority: body.priority,
      labels: body.labels,
    });
    return c.json({ task });
  });

  // DELETE /api/tasks/:id - Delete task
  app.delete('/:id', async (c) => {
    const taskId = c.req.param('id');
    await services.taskService.deleteTask(taskId);
    return c.json({ ok: true });
  });

  // POST /api/tasks/:id/force-release - Force release lock
  app.post('/:id/force-release', async (c) => {
    const taskId = c.req.param('id');
    await services.lockEngine.forceRelease(taskId);
    return c.json({ ok: true });
  });

  // POST /api/tasks/:id/review - Review a task
  app.post('/:id/review', async (c) => {
    const taskId = c.req.param('id');
    const body = await c.req.json();
    const result = await services.lockEngine.reviewTask(taskId, body.verdict, body.comment);
    return c.json({ ok: true, mergeResult: result.mergeResult ?? null });
  });

  // POST /api/tasks/:id/move - Move task status (dashboard drag-and-drop)
  app.post('/:id/move', async (c) => {
    const taskId = c.req.param('id');
    const body = await c.req.json();
    const { status } = body;

    // For dashboard: only allow moving todo tasks or review verdict
    const task = services.taskService.getTask(taskId);

    if (status === 'todo' && ['done', 'failed'].includes(task.status)) {
      // Reset to todo (re-open)
      const { getRawDb } = await import('@atc/core');
      const raw = getRawDb();
      raw
        .prepare(
          'UPDATE tasks SET status = ?, assigned_agent_id = NULL, updated_at = ? WHERE id = ?',
        )
        .run('todo', new Date().toISOString(), taskId);

      await services.eventBus.publish('STATUS_CHANGED', {
        taskId,
        payload: { oldStatus: task.status, newStatus: 'todo', source: 'dashboard' },
      });
    }

    return c.json({ task: services.taskService.getTask(taskId) });
  });
  // POST /api/tasks/:id/admin-move - Admin override: force-move task to any status
  app.post('/:id/admin-move', async (c) => {
    const taskId = c.req.param('id');
    const body = await c.req.json();
    const { status, reason } = body as { status: string; reason?: string };

    if (!status) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'status is required' } }, 400);
    }

    const task = await services.lockEngine.adminMoveTask(
      taskId,
      status as import('@atc/core').TaskStatus,
      reason,
    );

    return c.json({ task });
  });

  // POST /api/tasks/:id/assign - Assign an agent to a task
  app.post('/:id/assign', async (c) => {
    const taskId = c.req.param('id');
    const body = await c.req.json();
    const { agentId } = body as { agentId: string | null };

    // Validate task exists
    const task = services.taskService.getTask(taskId);

    // Validate agent exists if assigning (not unassigning)
    if (agentId) {
      services.agentRegistry.getById(agentId); // throws if not found
    }

    // Update the task assignment via raw DB (assignedAgentId not in UpdateTaskInput)
    const { getRawDb } = await import('@atc/core');
    const raw = getRawDb();
    raw
      .prepare('UPDATE tasks SET assigned_agent_id = ?, updated_at = ? WHERE id = ?')
      .run(agentId, new Date().toISOString(), taskId);

    if (agentId) {
      await services.eventBus.publish('STATUS_CHANGED', {
        taskId,
        agentId,
        payload: { action: 'assigned', agentId, source: 'dashboard' },
      });
    }

    return c.json({ task: services.taskService.getTask(taskId) });
  });

  return app;
}
