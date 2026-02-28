import { Hono } from 'hono';
import { FilesystemBrowserService } from '../../services/filesystem-browser-service.js';

export function createFsRoutes() {
  const app = new Hono();
  const fsBrowser = new FilesystemBrowserService();

  // GET /api/fs - List filesystem roots (drives on Windows, / on Unix)
  app.get('/', async (c) => {
    const roots = await fsBrowser.getRoots();
    return c.json({ roots });
  });

  // GET /api/fs/browse?path=...&showHidden=0|1 - Browse a directory
  app.get('/browse', async (c) => {
    const dirPath = c.req.query('path');
    if (!dirPath) {
      return c.json(
        { error: { code: 'MISSING_PATH', message: 'Query parameter "path" is required' } },
        400,
      );
    }

    const showHidden = c.req.query('showHidden') === '1';

    try {
      const result = await fsBrowser.browse(dirPath, showHidden);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to browse directory';

      if (message.includes('Access denied') || message.includes('outside allowed roots')) {
        return c.json({ error: { code: 'ACCESS_DENIED', message, path: dirPath } }, 403);
      }
      if (message.includes('Invalid path')) {
        return c.json({ error: { code: 'INVALID_PATH', message, path: dirPath } }, 400);
      }
      if (message.includes('ENOENT') || message.includes('no such file or directory')) {
        return c.json(
          {
            error: { code: 'NOT_FOUND', message: `Directory not found: ${dirPath}`, path: dirPath },
          },
          404,
        );
      }

      return c.json({ error: { code: 'BROWSE_ERROR', message, path: dirPath } }, 500);
    }
  });

  return app;
}
