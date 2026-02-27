import { ATCError, type ATCServices } from '@atc/core';
import { Hono } from 'hono';
import type { OpenCodeSpawner } from '../services/opencode-spawner.js';
import type { OpenCodeDiscovery } from '../services/opencode-discovery.js';
import { cors } from 'hono/cors';
import { errorHandler } from './middleware/error-handler.js';
import { createAgentRoutes } from './routes/agents.js';
import { createBoardRoutes } from './routes/board.js';
import { createDispatchRoutes } from './routes/dispatch.js';
import { createEventRoutes } from './routes/events.js';
import { createProjectRoutes } from './routes/projects.js';
import { createTaskRoutes } from './routes/tasks.js';
import { createWorkspaceRoutes } from './routes/workspaces.js';
import { createAdminRoutes } from './routes/admin.js';

export function createApp(
  services: ATCServices,
  spawner?: OpenCodeSpawner,
  shutdownFn?: () => void,
  discovery?: OpenCodeDiscovery,
) {
  const app = new Hono();

  // Global error handler — catches errors from all routes including subroutes
  app.onError((err, c) => {
    if (err instanceof ATCError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.statusCode as 400 | 403 | 404 | 409,
      );
    }
    console.error('Unhandled error:', err);
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: err.message || 'An internal error occurred' } },
      500,
    );
  });

  // Middleware
  app.use('*', cors());
  app.use('/api/*', errorHandler);

  // API Routes
  app.route('/api/tasks', createTaskRoutes(services));
  app.route('/api/projects', createProjectRoutes(services));
  app.route('/api/agents', createAgentRoutes(services, spawner, discovery));
  app.route('/api/events', createEventRoutes(services));
  app.route('/api/board', createBoardRoutes(services));
  app.route('/api/workspaces', createWorkspaceRoutes(services));
  app.route('/api/dispatch', createDispatchRoutes(services));
  if (shutdownFn) {
    app.route('/api/admin', createAdminRoutes(shutdownFn));
  }

  // Health check
  app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  return app;
}
