import type { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';

/**
 * Serve dashboard static files in production mode.
 * Falls back to index.html for SPA routing.
 */
export function setupStaticServing(app: Hono): void {
  // Resolve from server package to dashboard dist
  const serverDir = import.meta.dirname || process.cwd();
  const dashboardDist = resolve(serverDir, '../../dashboard/dist');

  if (!existsSync(dashboardDist)) {
    console.log('[Static] Dashboard build not found, skipping static serving');
    return;
  }

  console.log(`[Static] Serving dashboard from ${dashboardDist}`);

  // Calculate relative path from CWD
  const relRoot = relative(process.cwd(), dashboardDist).replace(/\\/g, '/');

  // Serve static assets
  app.use('/*', serveStatic({ root: relRoot }));

  // SPA fallback: serve index.html for non-API, non-asset routes
  const indexHtml = readFileSync(resolve(dashboardDist, 'index.html'), 'utf-8');
  app.get('*', (c) => {
    const path = c.req.path;
    if (path.startsWith('/api') || path.startsWith('/ws')) {
      return c.notFound();
    }
    return c.html(indexHtml);
  });
}
