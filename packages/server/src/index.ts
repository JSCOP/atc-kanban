import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createServices, closeConnection } from '@atc/core';
import { createApp } from './http/app.js';
import { createWebSocketHandler } from './ws/handler.js';
import { startMcpStdioServer } from './mcp/server.js';
import { setupStaticServing } from './static.js';

// ── Configuration ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '4000', 10);
const DB_PATH = process.env.DB_PATH || './data/atc.sqlite';
const LOCK_TTL_MINUTES = parseInt(process.env.LOCK_TTL_MINUTES || '30', 10);
// PID-based health checking replaces heartbeat-based timeout

// Check if running in MCP stdio mode
const isMcpMode = process.argv.includes('--mcp');

// ── Ensure data directory ───────────────────────────────────────────────────

const dbDir = dirname(resolve(DB_PATH));
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// ── Initialize services ─────────────────────────────────────────────────────

const services = createServices({
  dbPath: DB_PATH,
  lockTtlMinutes: LOCK_TTL_MINUTES,
});

// ── Start lock expiry checker ───────────────────────────────────────────────

services.lockEngine.startExpiryChecker(30000);

// ── Process health checker (PID-based) ───────────────────────────────────────

const processHealthChecker = setInterval(() => {
  services.agentRegistry.checkProcessHealth().catch(console.error);
}, 10000); // Check every 10 seconds

// ── MCP Mode ────────────────────────────────────────────────────────────────

if (isMcpMode) {
  console.error('[ATC] Starting in MCP stdio mode...');
  startMcpStdioServer(services).catch((error) => {
    console.error('[ATC] MCP server failed:', error);
    process.exit(1);
  });
} else {
  // ── HTTP + WebSocket Mode ───────────────────────────────────────────────

  const app = createApp(services);

  // Static file serving (production)
  setupStaticServing(app);

  // WebSocket setup
  const { wss } = createWebSocketHandler(services);

  // Start the HTTP server (single call)
  const server = serve(
    {
      fetch: app.fetch,
      port: PORT,
      createServer,
  }, (info) => {
      console.log('');
      console.log('  ╔══════════════════════════════════════════╗');
      console.log('  ║       ATC Server Running                 ║');
      console.log('  ╠══════════════════════════════════════════╣');
      console.log(`  ║  HTTP API:   http://localhost:${info.port}/api  ║`);
      console.log(`  ║  WebSocket:  ws://localhost:${info.port}/ws    ║`);
      console.log(`  ║  Dashboard:  http://localhost:${info.port}     ║`);
      console.log(`  ║  MCP mode:   --mcp flag for stdio        ║`);
      console.log('  ╚══════════════════════════════════════════╝');
      console.log('');
    },
  );

  // Handle WebSocket upgrade on the HTTP server
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────

  const shutdown = () => {
    console.log('\n[ATC] Shutting down...');
    services.lockEngine.stopExpiryChecker();
    clearInterval(processHealthChecker);
    wss.close();
    server.close();
    closeConnection();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
