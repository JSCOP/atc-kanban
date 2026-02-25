import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ATCServices } from '@atc/core';
import { registerCommonTools } from './tools/common-tools.js';
import { registerWorkerTools } from './tools/worker-tools.js';
import { registerMainTools } from './tools/main-tools.js';

/**
 * Create and configure the MCP server with all tools.
 */
export function createMcpServer(services: ATCServices): McpServer {
  const server = new McpServer({
    name: 'atc-server',
    version: '0.1.0',
  });

  // Register all tool sets
  registerCommonTools(server, services);
  registerWorkerTools(server, services);
  registerMainTools(server, services);

  return server;
}

/**
 * Start the MCP server with stdio transport.
 * This is used when the server is invoked directly by an AI agent.
 */
export async function startMcpStdioServer(services: ATCServices): Promise<void> {
  const server = createMcpServer(services);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('[MCP] Server started on stdio transport');
}
