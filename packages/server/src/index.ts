import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { closeConnection, createServices } from '@atc/core';
import { serve } from '@hono/node-server';
import envPaths from 'env-paths';
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
let reviewPoller: ReturnType<typeof setInterval> | undefined;
let discoveryPoller: ReturnType<typeof setInterval> | undefined;

// Track notified review tasks (dedup across listener + poller)
const reviewNotified = new Set<string>();
let lastReviewPollTime = new Date().toISOString();

// Shared helper: send review notification to main agent
async function sendReviewNotification(taskId: string): Promise<void> {
  if (reviewNotified.has(taskId)) return;
  reviewNotified.add(taskId);

  const allAgents = services.agentRegistry.listAgents();
  const mainAgent = allAgents.find((a) => a.role === 'main' && a.status === 'active');
  if (!mainAgent) {
    reviewNotified.delete(taskId);
    return;
  }

  let serverUrl = mainAgent.serverUrl;
  let sessionId = mainAgent.sessionId;
  if (!serverUrl && mainAgent.cwd) {
    const opencodeProxy = allAgents.find(
      (a) =>
        a.connectionType === 'opencode' &&
        a.status === 'active' &&
        a.serverUrl &&
        a.cwd === mainAgent.cwd,
    );
    if (opencodeProxy) {
      serverUrl = opencodeProxy.serverUrl;
      sessionId = sessionId || opencodeProxy.sessionId;
    }
  }
  if (!serverUrl || !sessionId) {
    reviewNotified.delete(taskId);
    return;
  }

  const task = services.taskService.getTask(taskId);
  const reviewMessage = `[ATC Auto-Review] Task "${task.title}" (${task.id}) has been marked for review. Please review and approve/reject using review_task tool.`;

  await services.opencodeBridge.sendMessage(
    mainAgent.id,
    sessionId,
    reviewMessage,
    undefined,
    serverUrl,
  );
  console.log(
    `[ATC] Auto-dispatched review notification for task ${taskId} to main agent ${mainAgent.name}`,
  );
}

if (!isMcpMode) {
  services.lockEngine.startExpiryChecker(30000);
  services.agentRegistry.checkHealth().catch(console.error);
  healthChecker = setInterval(() => {
    services.agentRegistry.checkHealth().catch(console.error);
  }, 10000);

  // In-memory listener: handles HTTP-originated STATUS_CHANGED events
  services.eventBus.on('STATUS_CHANGED', async (event) => {
    try {
      const payload = event.payload as { oldStatus: string; newStatus: string };
      if (payload.newStatus !== 'review') return;
      if (!event.taskId) return;
      await sendReviewNotification(event.taskId);
    } catch (err) {
      console.error('[ATC] Failed to auto-dispatch review notification:', err);
    }
  });

  // DB poller: catches STATUS_CHANGED events from MCP processes (cross-process)
  reviewPoller = setInterval(async () => {
    try {
      const newEvents = services.eventBus.pollEvents({
        since: lastReviewPollTime,
        types: ['STATUS_CHANGED'],
        limit: 50,
      });
      lastReviewPollTime = new Date().toISOString();
      for (const event of newEvents) {
        const payload = event.payload as { newStatus?: string };
        if (payload.newStatus === 'review' && event.taskId) {
          await sendReviewNotification(event.taskId);
        }
      }
    } catch (err) {
      console.error('[ATC] Review poller error:', err);
    }
  }, 5000);

  // Startup: notify for any tasks currently in review status
  const reviewTasks = services.taskService.listTasks({ status: ['review'] });
  for (const t of reviewTasks) {
    sendReviewNotification(t.id).catch((err) => {
      console.error(`[ATC] Startup review notification failed for task ${t.id}:`, err);
    });
  }

  // Periodic OpenCode discovery scan (30s) — PID-first, no fixed port ranges.
  // Discovers new instances, reconnects agents whose port changed, updates sessions.
  discoveryPoller = setInterval(async () => {
    try {
      const disc = new OpenCodeDiscovery(services);
      await disc.scan();
    } catch (err) {
      console.error('[ATC] Discovery scan error:', err);
    }
  }, 30000);

  // Run initial discovery scan at startup
  {
    const disc = new OpenCodeDiscovery(services);
    disc.scan().catch((err) => {
      console.error('[ATC] Initial discovery scan failed:', err);
    });
  }
}

// Auto-dispatch: notify main agent when a new task is created
services.eventBus.on('TASK_CREATED', async (event) => {
  try {
    // Get project to check auto_dispatch setting
    const task = services.taskService.getTask(event.taskId!);
    const project = services.projectService.getProject(task.projectId);
    if (!project.autoDispatch) return;

    // Find active main agent — cross-reference MCP and OpenCode agents
    const allAgents = services.agentRegistry.listAgents();
    const mainAgent = allAgents.find((a) => a.role === 'main' && a.status === 'active');
    if (!mainAgent) return;

    // Resolve serverUrl: prefer agent's own, fallback to OpenCode agent with same CWD
    let serverUrl = mainAgent.serverUrl;
    let sessionId = mainAgent.sessionId;
    if (!serverUrl && mainAgent.cwd) {
      const opencodeProxy = allAgents.find(
        (a) =>
          a.connectionType === 'opencode' &&
          a.status === 'active' &&
          a.serverUrl &&
          a.cwd === mainAgent.cwd,
      );
      if (opencodeProxy) {
        serverUrl = opencodeProxy.serverUrl;
        sessionId = sessionId || opencodeProxy.sessionId;
      }
    }
    if (!serverUrl || !sessionId) return;

    // Build list of available workers (any active worker with a resolvable serverUrl)
    const workers = allAgents.filter(
      (a) =>
        a.role === 'worker' &&
        a.status === 'active' &&
        (a.connectionType === 'opencode' || a.serverUrl),
    );
    if (workers.length === 0) return;

    const workerList = workers
      .map((w) => `- ${w.name} (ID: ${w.id})${w.sessionId ? ` [session: ${w.sessionId}]` : ''}`)
      .join('\n');

    const message =
      `[ATC Auto-Dispatch] A new task has been created and needs assignment.\n\n` +
      `Task: "${task.title}" (ID: ${task.id})\n` +
      `Priority: ${task.priority}\n` +
      `Description: ${task.description || 'No description'}\n\n` +
      `Available workers:\n${workerList}\n\n` +
      `Please analyze the task and dispatch it to the most appropriate worker using the dispatch_task tool. ` +
      `Choose based on the worker's name/specialization. Use the worker's existing session (session_id from their agent data) if available.\n` +
      `To dispatch, call: dispatch_task(main_token, task_id="${task.id}", agent_id="<chosen_worker_id>")`;

    await services.opencodeBridge.sendMessage(mainAgent.id, sessionId, message, undefined, serverUrl);
    if (isMcpMode) {
      console.error(
        `[ATC] Auto-dispatch: notified main agent ${mainAgent.name} about new task "${task.title}"`,
      );
    } else {
      console.log(
        `[ATC] Auto-dispatch: notified main agent ${mainAgent.name} about new task "${task.title}"`,
      );
    }
  } catch (err) {
    console.error('[ATC] Failed to auto-dispatch task notification:', err);
  }
});

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
    if (reviewPoller) clearInterval(reviewPoller);
    if (discoveryPoller) clearInterval(discoveryPoller);

    // Force-close all WebSocket connections so server.close() can finish
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close();

    // Wait for HTTP server to release the port, then exit
    server.close(() => {
      closeConnection();
      process.exit(0);
    });

    // Fallback: force exit after 3s if server.close() hangs
    setTimeout(() => {
      closeConnection();
      process.exit(1);
    }, 3000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
