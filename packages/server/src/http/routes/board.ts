import { Hono } from 'hono';
import type { ATCServices } from '@atc/core';

export function createBoardRoutes(services: ATCServices) {
  const app = new Hono();

  // GET /api/board/summary - Board summary
  app.get('/summary', (c) => {
    const projectId = c.req.query('projectId') || 'default';
    const summary = services.taskService.getBoardSummary(projectId);
    return c.json(summary);
  });

  return app;
}
