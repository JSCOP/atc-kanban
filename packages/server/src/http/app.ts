import type { ATCServices } from '@atc/core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './middleware/error-handler.js';
import { createAgentRoutes } from './routes/agents.js';
import { createBoardRoutes } from './routes/board.js';
import { createEventRoutes } from './routes/events.js';
import { createProjectRoutes } from './routes/projects.js';
import { createTaskRoutes } from './routes/tasks.js';

export function createApp(services: ATCServices) {
  const app = new Hono();

  // Middleware
  app.use('*', cors());
  app.use('/api/*', errorHandler);

  // API Routes
  app.route('/api/tasks', createTaskRoutes(services));
  app.route('/api/projects', createProjectRoutes(services));
  app.route('/api/agents', createAgentRoutes(services));
  app.route('/api/events', createEventRoutes(services));
  app.route('/api/board', createBoardRoutes(services));

  // Health check
  app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  return app;
}
