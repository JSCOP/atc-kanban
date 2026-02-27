import type { ATCServices } from '@atc/core';
import { Hono } from 'hono';

export function createDispatchRoutes(services: ATCServices) {
  const app = new Hono();

  // POST /api/dispatch - Dispatch task to an OpenCode worker
  app.post('/', async (c) => {
    const body = await c.req.json();
    const result = await services.opencodeBridge.dispatchTask(body);
    return c.json({ result });
  });

  return app;
}
