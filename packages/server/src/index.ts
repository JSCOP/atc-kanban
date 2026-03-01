import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import envPaths from 'env-paths';
import { closeConnection, createServices } from '@atc/core';
import { serve } from '@hono/node-server';
import { createApp } from './http/app.js';
import { startMcpStdioServer } from './mcp/server.js';
import { OpenCodeDiscovery } from './services/opencode-discovery.js';
import { OpenCodeSpawner } from './services/opencode-spawner.js';
import { setupStaticServing } from './static.js';
import { createWebSocketHandler } from './ws/handler.js';

// ── Configuration ───────────────────────────────────────────────────────────

const PORT = Number.parseInt(process.env.PORT || '4000', 10);
// DB_PATH: use platform-specific data directory so the same DB is used
// regardless of where the user runs the command.
//   Windows: %LOCALAPPDATA%/atc-kanban-nodejs/Data/atc.sqlite
//   macOS:   ~/Library/Application Support/atc-kanban-nodejs/atc.sqlite
//   Linux:   ~/.local/share/atc-kanban-nodejs/atc.sqlite
// Users can override via DB_PATH env var.
const paths = envPaths('atc-kanban');
const DB_PATH = process.env.DB_PATH || resolve(paths.data, 'atc.sqlite');
const LOCK_TTL_MINUTES = Number.parseInt(process.env.LOCK_TTL_MINUTES || '30', 10);
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

// ── Background tasks (HTTP mode only) ─────────────────────────────────────
// MCP stdio satellites must NOT run janitor loops — only the primary HTTP
// server should manage lock expiry and agent health checks.

let healthChecker: ReturnType<typeof setInterval> | undefined;

if (!isMcpMode) {
  services.lockEngine.startExpiryChecker(30000);
  services.agentRegistry.checkHealth().catch(console.error);
  healthChecker = setInterval(() => {
    services.agentRegistry.checkHealth().catch(console.error);
  }, 10000);

  // Auto-dispatch review notifications to main agent
  services.eventBus.on('STATUS_CHANGED', async (event) => {
    try {
      const payload = event.payload as { oldStatus: string; newStatus: string };
      if (payload.newStatus !== 'review') return;

      // Find active main agent with OpenCode connection
      const agents = services.agentRegistry.listAgents();
      const mainAgent = agents.find(
        (a) => a.role === 'main' && a.status === 'active' && a.connectionType === 'opencode' && a.serverUrl,
      );
      if (!mainAgent || !mainAgent.sessionId) return;

      // Get task details for the review message
      const task = services.taskService.getTask(event.taskId!);
      const reviewMessage = `[ATC Auto-Review] Task "${task.title}" (${task.id}) has been marked for review. Please review and approve/reject using review_task tool.`;

      await services.opencodeBridge.sendMessage(mainAgent.id, mainAgent.sessionId, reviewMessage);
      console.log(`[ATC] Auto-dispatched review notification for task ${event.taskId} to main agent ${mainAgent.name}`);
    } catch (err) {
      console.error('[ATC] Failed to auto-dispatch review notification:', err);
    }
  });
}

// ── MCP Mode ────────────────────────────────────────────────────────────────

if (isMcpMode) {
  console.error(`[ATC] Starting in MCP stdio mode (DB: ${DB_PATH})...`);
  startMcpStdioServer(services).catch((error) => {
    console.error('[ATC] MCP server failed:', error);
    process.exit(1);
  });
} else {
  // ── HTTP + WebSocket Mode ───────────────────────────────────────────────────

  const spawner = new OpenCodeSpawner(services);
  const discovery = new OpenCodeDiscovery(services);
  // Use indirect reference so shutdown can be defined after server/wss setup
  let shutdown: () => void = () => process.exit(1);
  const app = createApp(services, spawner, () => shutdown(), discovery);

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
    },
    (info) => {
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

  shutdown = () => {
    console.log('\n[ATC] Shutting down...');
    spawner.killAll();
    services.lockEngine.stopExpiryChecker();
    if (healthChecker) clearInterval(healthChecker);
    wss.close();
    server.close();
    closeConnection();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
