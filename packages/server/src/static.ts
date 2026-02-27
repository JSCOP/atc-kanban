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

  // SPA fallback: serve index.html for client-side routes only
  // Skip API, WS, and any request with a file extension (assets that serveStatic missed)
  const indexHtml = readFileSync(resolve(dashboardDist, 'index.html'), 'utf-8');
  app.get('*', (c) => {
    const path = c.req.path;
    if (path.startsWith('/api') || path.startsWith('/ws') || /\.\w+$/.test(path)) {
      return c.notFound();
    }
    // Set no-cache on HTML to prevent stale asset references after rebuilds
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    return c.html(indexHtml);
  });
}
