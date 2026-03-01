import type { ATCServices } from '@atc/core';
import { Hono } from 'hono';

export function createProjectRoutes(services: ATCServices) {
  const app = new Hono();

  // GET /api/projects - List all projects
  app.get('/', (c) => {
    const projects = services.projectService.listProjects();
    return c.json({ projects });
  });

  // GET /api/projects/:id - Get project
  app.get('/:id', (c) => {
    const project = services.projectService.getProject(c.req.param('id'));
    return c.json({ project });
  });

  // POST /api/projects - Create project
  app.post('/', async (c) => {
    const body = await c.req.json();
    const project = services.projectService.createProject({
      name: body.name,
      description: body.description,
      repoRoot: body.repoRoot,
      baseBranch: body.baseBranch,
      autoDispatch: body.autoDispatch,
    });
    return c.json({ project }, 201);
  });

  // PUT /api/projects/:id - Update project
  app.put('/:id', async (c) => {
    const body = await c.req.json();
    const project = services.projectService.updateProject(c.req.param('id'), {
      name: body.name,
      description: body.description,
      repoRoot: body.repoRoot,
      baseBranch: body.baseBranch,
      autoDispatch: body.autoDispatch,
    });
    return c.json({ project });
  });

  // DELETE /api/projects/:id - Delete project
  app.delete('/:id', (c) => {
    services.projectService.deleteProject(c.req.param('id'));
    return c.json({ ok: true });
  });

  return app;
}
