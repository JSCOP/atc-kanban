import type { ATCServices } from '@atc/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpSessionTracker, registerCommonTools } from './tools/common-tools.js';
import { registerMainTools } from './tools/main-tools.js';
import { registerWorkerTools } from './tools/worker-tools.js';

/**
 * Create and configure the MCP server with all tools.
 */
export function createMcpServer(
  services: ATCServices,
  sessionTracker: McpSessionTracker,
): McpServer {
  const server = new McpServer({
    name: 'atc-server',
    version: '0.1.0',
  });

  // Register all tool sets
  registerCommonTools(server, services, sessionTracker);
  registerWorkerTools(server, services);
  registerMainTools(server, services);

  return server;
}

/**
 * Start the MCP server with stdio transport.
 * This is used when the server is invoked directly by an AI agent.
 *
 * Lifecycle management:
 * - Tracks which agent was registered in this session
 * - On process termination (stdin EOF, SIGINT, SIGTERM), auto-disconnects
 *   the agent and releases all its task locks
 */
export async function startMcpStdioServer(services: ATCServices): Promise<void> {
  const sessionTracker = new McpSessionTracker();
  const server = createMcpServer(services, sessionTracker);
  const transport = new StdioServerTransport();

  // Cleanup handler: disconnect agent and release all its locks
  let cleanupDone = false;
  const cleanup = async (reason: string) => {
    if (cleanupDone) return;
    cleanupDone = true;

    const agentId = sessionTracker.getAgentId();
    if (agentId) {
      console.error(`[MCP] Cleaning up agent ${agentId} (reason: ${reason})`);
      try {
        await services.agentRegistry.disconnectById(agentId, reason);
        console.error(`[MCP] Agent ${agentId} disconnected, locks released`);
      } catch (err) {
        console.error(`[MCP] Cleanup error:`, err);
      }
      sessionTracker.clear();
    }
  };

  // Hook stdin 'end' — fires when parent process (AI agent terminal) closes
  process.stdin.on('end', () => {
    cleanup('stdin_closed').then(() => {
      process.exit(0);
    });
  });

  // Hook process signals
  process.on('SIGINT', () => {
    cleanup('sigint').then(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    cleanup('sigterm').then(() => {
      process.exit(0);
    });
  });

  // Hook process exit (sync-only — do best-effort cleanup)
  process.on('beforeExit', () => {
    const agentId = sessionTracker.getAgentId();
    if (agentId && !cleanupDone) {
      // beforeExit supports async, so we can await
      cleanup('process_exit');
    }
  });

  await server.connect(transport);
  console.error('[MCP] Server started on stdio transport');
}
