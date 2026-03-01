import { Hono } from 'hono';
import type { ATCServices } from '@atc/core';

export function createWorkspaceRoutes(services: ATCServices) {
  const app = new Hono();

  // GET /api/workspaces - List all workspaces
  app.get('/', (c) => {
    const status = c.req.query('status');
    const repoRoot = c.req.query('repo_root');
    const workspaces = services.workspaceService.listWorkspaces({
      status: status || undefined,
      repoRoot: repoRoot || undefined,
    });
    return c.json({ workspaces });
  });

  // POST /api/workspaces - Register a new workspace
  app.post('/', async (c) => {
    const body = await c.req.json();
    const workspace = await services.workspaceService.createWorkspace({
      repoRoot: body.repoRoot,
      baseBranch: body.baseBranch || 'main',
    });
    return c.json({ workspace }, 201);
  });


  // GET /api/workspaces/by-task/:taskId - Find workspace by task ID
  app.get('/by-task/:taskId', (c) => {
    const workspace = services.workspaceService.findByTaskId(c.req.param('taskId'));
    if (!workspace) {
      return c.json({ workspace: null });
    }
    return c.json({ workspace });
  });

  // GET /api/workspaces/:id - Get workspace by ID
  app.get('/:id', (c) => {
    const workspace = services.workspaceService.getWorkspace(c.req.param('id'));
    return c.json({ workspace });
  });

  // POST /api/workspaces/:id/merge - Merge workspace worktree into base branch
  app.post('/:id/merge', async (c) => {
    const result = await services.workspaceService.mergeWorktree(c.req.param('id'));
    return c.json({ result });
  });

  // POST /api/workspaces/:id/archive - Archive workspace
  app.post('/:id/archive', async (c) => {
    await services.workspaceService.archiveWorktree(c.req.param('id'));
    return c.json({ ok: true });
  });

  // POST /api/workspaces/:id/sync - Sync workspace with base branch
  app.post('/:id/sync', async (c) => {
    const result = await services.workspaceService.syncWithBase(c.req.param('id'));
    return c.json({ result });
  });

  // DELETE /api/workspaces/:id - Delete workspace
  app.delete('/:id', async (c) => {
    await services.workspaceService.deleteWorkspace(c.req.param('id'));
    return c.json({ ok: true });
  });

  return app;
}
