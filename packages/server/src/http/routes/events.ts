import { Hono } from 'hono';
import type { ATCServices, EventType } from '@atc/core';

export function createEventRoutes(services: ATCServices) {
  const app = new Hono();

  // GET /api/events - List events with optional filters
  app.get('/', (c) => {
    const since = c.req.query('since');
    const typesParam = c.req.query('type');
    const limitParam = c.req.query('limit');

    const types = typesParam ? (typesParam.split(',') as EventType[]) : undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const events = services.eventBus.pollEvents({
      since: since || undefined,
      types,
      limit,
    });

    return c.json({ events });
  });

  return app;
}
