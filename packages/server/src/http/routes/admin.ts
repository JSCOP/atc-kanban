import { spawn } from 'node:child_process';
import { Hono } from 'hono';

/**
 * Admin routes for server lifecycle management.
 * These endpoints allow the dashboard to shut down or restart the server process.
 */
export function createAdminRoutes(shutdownFn: () => void) {
  const app = new Hono();

  // POST /api/admin/shutdown — Graceful shutdown
  app.post('/shutdown', (c) => {
    // Respond first, then shut down after a short delay
    setTimeout(() => {
      console.log('[Admin] Shutdown requested via API');
      shutdownFn();
    }, 200);
    return c.json({ ok: true, message: 'Server shutting down...' });
  });

  // POST /api/admin/restart — Restart server process
  app.post('/restart', (c) => {
    setTimeout(() => {
      console.log('[Admin] Restart requested via API');

      // Spawn a replacement process with the same args
      const child = spawn(process.execPath, process.argv.slice(1), {
        cwd: process.cwd(),
        stdio: 'inherit',
        detached: true,
        env: { ...process.env },
      });
      child.unref();

      // Then shut down the current process
      shutdownFn();
    }, 200);
    return c.json({ ok: true, message: 'Server restarting...' });
  });

  // GET /api/admin/info — Server process info
  app.get('/info', (c) => {
    return c.json({
      pid: process.pid,
      uptime: process.uptime(),
      nodeVersion: process.version,
      argv: process.argv,
      cwd: process.cwd(),
      memoryUsage: process.memoryUsage(),
    });
  });

  return app;
}
