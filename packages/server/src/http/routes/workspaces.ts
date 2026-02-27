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

  // GET /api/workspaces/:id - Get workspace by ID
  app.get('/:id', (c) => {
    const workspace = services.workspaceService.getWorkspace(c.req.param('id'));
    return c.json({ workspace });
  });

  return app;
}
