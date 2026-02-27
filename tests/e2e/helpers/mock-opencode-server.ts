import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';

let sessionCounter = 0;
const sessions: Map<string, { id: string; title: string; createdAt: string }> = new Map();

function createMockOpenCodeServer(port = 13337): {
  start: () => Promise<Server>;
  stop: (server: Server) => Promise<void>;
} {
  return {
    start: () =>
      new Promise((resolve, reject) => {
        const server = createServer((req: IncomingMessage, res: ServerResponse) => {
          let body = '';
          req.on('data', (chunk) => {
            body += String(chunk);
          });
          req.on('end', () => {
            const url = req.url || '';
            const method = req.method || 'GET';

            if (method === 'GET' && url === '/global/health') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ healthy: true, version: '1.0.0-mock' }));
              return;
            }

            if (method === 'GET' && url === '/agent') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify([
                  { name: 'build', description: 'Full tools enabled agent' },
                  { name: 'plan', description: 'Read-only analysis agent' },
                ]),
              );
              return;
            }

            if (method === 'POST' && url === '/session') {
              sessionCounter++;
              const sessionId = `mock-session-${sessionCounter}-${Date.now()}`;
              const session = { id: sessionId, title: `Session ${sessionCounter}`, createdAt: new Date().toISOString() };
              sessions.set(sessionId, session);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ id: sessionId }));
              return;
            }

            if (method === 'POST' && /^\/session\/[^/]+\/prompt_async$/.test(url)) {
              res.writeHead(204);
              res.end();
              return;
            }

            if (method === 'GET' && url === '/session/status') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({}));
              return;
            }

            // GET /session - list all sessions
            if (method === 'GET' && url === '/session') {
              const sessionList = Array.from(sessions.values());
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(sessionList));
              return;
            }

            // GET /session/:id - get session details (includes messages in OpenCode format)
            const sessionDetailMatch = url.match(/^\/session\/([^/]+)$/);
            if (method === 'GET' && sessionDetailMatch) {
              const sid = sessionDetailMatch[1];
              const session = sessions.get(sid);
              if (session) {
                // OpenCode returns messages inside the session object with 'parts' format
                const mockMessages = [
                  {
                    id: 'msg-1',
                    role: 'user',
                    parts: [{ type: 'text', text: 'Hello! Can you write a Python function that calculates fibonacci numbers?' }],
                    createdAt: new Date(Date.now() - 60000).toISOString(),
                  },
                  {
                    id: 'msg-2',
                    role: 'assistant',
                    parts: [{ type: 'text', text: 'Sure! Here\'s a Python fibonacci function:\n\n```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    a, b = 0, 1\n    for _ in range(2, n + 1):\n        a, b = b, a + b\n    return b\n```\n\nThis uses iterative approach for O(n) time complexity.' }],
                    createdAt: new Date(Date.now() - 30000).toISOString(),
                  },
                  {
                    id: 'msg-3',
                    role: 'user',
                    parts: [{ type: 'text', text: 'Can you add type hints and a docstring?' }],
                    createdAt: new Date(Date.now() - 15000).toISOString(),
                  },
                  {
                    id: 'msg-4',
                    role: 'assistant',
                    parts: [{ type: 'text', text: 'Of course! Here\'s the improved version:\n\n```python\ndef fibonacci(n: int) -> int:\n    """Calculate the nth Fibonacci number.\n\n    Args:\n        n: The position in the Fibonacci sequence (0-indexed).\n\n    Returns:\n        The nth Fibonacci number.\n\n    Raises:\n        ValueError: If n is negative.\n    """\n    if n < 0:\n        raise ValueError("n must be non-negative")\n    if n <= 1:\n        return n\n    a, b = 0, 1\n    for _ in range(2, n + 1):\n        a, b = b, a + b\n    return b\n```\n\nNow it has proper type hints, a comprehensive docstring, and input validation.' }],
                    createdAt: new Date(Date.now() - 5000).toISOString(),
                  },
                ];
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ...session, messages: mockMessages }));
              } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not Found' }));
              }
              return;
            }

            // GET /session/:id/messages - get session messages
            const messagesMatch = url.match(/^\/session\/([^/]+)\/messages$/);
            if (method === 'GET' && messagesMatch) {
              const sid = messagesMatch[1];
              if (sessions.has(sid)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([
                  {
                    id: 'msg-1',
                    role: 'user',
                    content: 'Hello! Can you write a Python function that calculates fibonacci numbers?',
                    createdAt: new Date(Date.now() - 60000).toISOString(),
                  },
                  {
                    id: 'msg-2',
                    role: 'assistant',
                    content: 'Sure! Here\'s a Python fibonacci function:\n\n```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    a, b = 0, 1\n    for _ in range(2, n + 1):\n        a, b = b, a + b\n    return b\n```\n\nThis uses iterative approach for O(n) time complexity.',
                    createdAt: new Date(Date.now() - 30000).toISOString(),
                  },
                  {
                    id: 'msg-3',
                    role: 'user',
                    content: 'Can you add type hints and a docstring?',
                    createdAt: new Date(Date.now() - 15000).toISOString(),
                  },
                  {
                    id: 'msg-4',
                    role: 'assistant',
                    content: 'Of course! Here\'s the improved version:\n\n```python\ndef fibonacci(n: int) -> int:\n    """Calculate the nth Fibonacci number.\n\n    Args:\n        n: The position in the Fibonacci sequence (0-indexed).\n\n    Returns:\n        The nth Fibonacci number.\n\n    Raises:\n        ValueError: If n is negative.\n    """\n    if n < 0:\n        raise ValueError("n must be non-negative")\n    if n <= 1:\n        return n\n    a, b = 0, 1\n    for _ in range(2, n + 1):\n        a, b = b, a + b\n    return b\n```\n\nNow it has proper type hints, a comprehensive docstring, and input validation.',
                    createdAt: new Date(Date.now() - 5000).toISOString(),
                  },
                ]));
              } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not Found' }));
              }
              return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
          });
        });

        server.listen(port, '127.0.0.1', () => resolve(server));
        server.on('error', reject);
      }),
    stop: (server: Server) =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export { createMockOpenCodeServer };
