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
    await services.lockEngine.reviewTask(taskId, body.verdict, body.comment);
    return c.json({ ok: true });
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
      raw.prepare('UPDATE tasks SET status = ?, assigned_agent_id = NULL, updated_at = ? WHERE id = ?')
        .run('todo', new Date().toISOString(), taskId);

      await services.eventBus.publish('STATUS_CHANGED', {
        taskId,
        payload: { oldStatus: task.status, newStatus: 'todo', source: 'dashboard' },
      });
    }

    return c.json({ task: services.taskService.getTask(taskId) });
  });

  return app;
}
