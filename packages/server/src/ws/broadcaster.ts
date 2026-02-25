import type { WebSocket } from 'ws';
import type { ATCEvent, ATCServices } from '@atc/core';

/**
 * Bridges EventBus events to WebSocket clients.
 */
export class WebSocketBroadcaster {
  private clients: Set<WebSocket> = new Set();
  private services: ATCServices;

  constructor(services: ATCServices) {
    this.services = services;

    // Subscribe to all events from the EventBus
    services.eventBus.on('event', (event: ATCEvent) => {
      this.broadcast({
        type: event.type,
        payload: {
          id: event.id,
          taskId: event.taskId,
          agentId: event.agentId,
          ...event.payload,
          createdAt: event.createdAt,
        },
      });
    });
  }

  /**
   * Add a new WebSocket client.
   */
  addClient(ws: WebSocket): void {
    this.clients.add(ws);

    // Send initial board snapshot
    const summary = this.services.taskService.getBoardSummary();
    const tasks = this.services.taskService.listTasks();
    const agents = this.services.agentRegistry.listAgents();

    this.send(ws, {
      type: 'BOARD_SNAPSHOT',
      payload: { tasks, agents, summary },
    });
  }

  /**
   * Remove a WebSocket client.
   */
  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  /**
   * Broadcast a message to all connected clients.
   */
  private broadcast(message: Record<string, unknown>): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(data);
      }
    }
  }

  /**
   * Send a message to a specific client.
   */
  private send(ws: WebSocket, message: Record<string, unknown>): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Get connected client count.
   */
  get clientCount(): number {
    return this.clients.size;
  }
}
