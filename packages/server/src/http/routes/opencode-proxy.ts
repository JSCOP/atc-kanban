import { Hono } from 'hono';

/**
 * Proxy route for OpenCode API requests from the dashboard.
 * Avoids CORS issues by forwarding requests through the ATC server.
 *
 * POST /api/opencode-proxy
 * Body: { url: string, method?: string, body?: unknown, timeout?: number }
 * Returns: { status: number, data: unknown, ok: boolean }
 */
export function createOpenCodeProxyRoutes() {
  const app = new Hono();

  app.post('/', async (c) => {
    const {
      url,
      method = 'GET',
      body,
      timeout = 5000,
    } = await c.req.json<{
      url: string;
      method?: string;
      body?: unknown;
      timeout?: number;
    }>();

    if (!url) {
      return c.json({ error: { code: 'MISSING_URL', message: 'url is required' } }, 400);
    }

    // Validate URL is localhost only (security: prevent SSRF to external hosts)
    try {
      const parsed = new URL(url);
      if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
        return c.json(
          { error: { code: 'INVALID_HOST', message: 'Only localhost URLs are allowed' } },
          400,
        );
      }
    } catch {
      return c.json({ error: { code: 'INVALID_URL', message: 'Invalid URL format' } }, 400);
    }

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeout),
      };

      if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      let data: unknown;

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return c.json({
        status: response.status,
        ok: response.ok,
        data,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Proxy request failed';
      const isTimeout = message.includes('abort') || message.includes('timeout');

      return c.json(
        {
          status: 0,
          ok: false,
          data: null,
          error: isTimeout ? 'Request timed out' : message,
        },
        200, // Return 200 to the dashboard — error is in the payload
      );
    }
  });

  return app;
}
