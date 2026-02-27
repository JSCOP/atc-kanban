import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { ATCServices } from '@atc/core';
import { WebSocketBroadcaster } from './broadcaster.js';

export function createWebSocketHandler(services: ATCServices): {
  wss: WebSocketServer;
  broadcaster: WebSocketBroadcaster;
} {
  const wss = new WebSocketServer({ noServer: true });
  const broadcaster = new WebSocketBroadcaster(services);

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log(`[WS] Client connected (total: ${broadcaster.clientCount + 1})`);
    broadcaster.addClient(ws);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleClientMessage(services, message);
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            payload: {
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          }),
        );
      }
    });

    ws.on('close', () => {
      broadcaster.removeClient(ws);
      console.log(`[WS] Client disconnected (total: ${broadcaster.clientCount})`);
    });

    ws.on('error', (error) => {
      console.error('[WS] Client error:', error);
      broadcaster.removeClient(ws);
    });
  });

  return { wss, broadcaster };
}

/**
 * Handle messages from dashboard WebSocket clients.
 */
async function handleClientMessage(
  services: ATCServices,
  message: { action: string; payload: Record<string, unknown> },
): Promise<void> {
  const { action, payload } = message;

  switch (action) {
    case 'CREATE_TASK':
      await services.taskService.createTask({
        title: payload.title as string,
        description: payload.description as string | undefined,
        priority: payload.priority as 'critical' | 'high' | 'medium' | 'low' | undefined,
        labels: payload.labels as string[] | undefined,
      });
      break;

    case 'FORCE_RELEASE':
      await services.lockEngine.forceRelease(payload.taskId as string);
      break;

    case 'DELETE_TASK':
      await services.taskService.deleteTask(payload.taskId as string);
      break;

    default:
      console.warn(`[WS] Unknown action: ${action}`);
  }
}
