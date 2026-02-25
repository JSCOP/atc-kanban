import { Hono } from 'hono';
import type { ATCServices } from '@atc/core';

export function createAgentRoutes(services: ATCServices) {
  const app = new Hono();

  // GET /api/agents - List all agents
  app.get('/', (c) => {
    const agents = services.agentRegistry.listAgents();
    return c.json({ agents });
  });

  return app;
}
