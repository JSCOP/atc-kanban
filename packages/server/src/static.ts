import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';

/**
 * Serve dashboard static files in production mode.
 * Falls back to index.html for SPA routing.
 *
 * Supports two layouts:
 *   - npm-installed: dist/public/ (copied during build:publish)
 *   - monorepo dev:  ../../dashboard/dist (relative to server src/dist)
 */
export function setupStaticServing(app: Hono): void {
  const serverDir = dirname(fileURLToPath(import.meta.url));

  // npm-installed: dashboard assets are copied into dist/public/
  const packagedPublic = resolve(serverDir, 'public');

  // monorepo dev fallback: packages/dashboard/dist
  const monorepoDashboardDist = resolve(serverDir, '../../dashboard/dist');

  const dashboardDist = existsSync(packagedPublic) ? packagedPublic : monorepoDashboardDist;

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
    if (path.startsWith('/api/') || path.startsWith('/ws') || /\.\w+$/.test(path)) {
      return c.notFound();
    }
    // Set no-cache on HTML to prevent stale asset references after rebuilds
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    return c.html(indexHtml);
  });
}
