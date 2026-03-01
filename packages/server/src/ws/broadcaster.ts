import type { ATCEvent, ATCServices } from '@atc/core';
import type { WebSocket } from 'ws';

/**
 * Bridges EventBus events to WebSocket clients.
 * Transforms UPPER_SNAKE event types into colon:separated format
 * expected by the dashboard, with full entity payloads.
 */
export class WebSocketBroadcaster {
  private clients: Set<WebSocket> = new Set();
  private services: ATCServices;

  constructor(services: ATCServices) {
    this.services = services;

    // Subscribe to all events from the EventBus
    services.eventBus.on('event', (event: ATCEvent) => {
      this.handleEvent(event);
    });
  }

  /**
   * Transform EventBus events into dashboard WebSocket messages.
   */
  private handleEvent(event: ATCEvent): void {
    // Always broadcast the raw event for the event log
    this.broadcast({ type: 'event:created', event });

    try {
      switch (event.type) {
        // ── Task events ──────────────────────────────────────────
        case 'TASK_CREATED': {
          if (!event.taskId) break;
          const task = this.services.taskService.getTask(event.taskId);
          if (task) this.broadcast({ type: 'task:created', task });
          break;
        }
        case 'STATUS_CHANGED': {
          if (!event.taskId) break;
          const task = this.services.taskService.getTask(event.taskId);
          if (task) {
            this.broadcast({ type: 'task:updated', task });
            const payload = event.payload as { newStatus?: string };
            if (payload.newStatus) {
              this.broadcast({
                type: 'task:moved',
                taskId: event.taskId,
                status: payload.newStatus,
              });
            }
          }
          break;
        }
        case 'TASK_CLAIMED': {
          if (!event.taskId) break;
          const task = this.services.taskService.getTask(event.taskId);
          if (task) {
            this.broadcast({ type: 'task:updated', task });
            if (event.agentId) {
              this.broadcast({
                type: 'task:assigned',
                taskId: event.taskId,
                agentId: event.agentId,
              });
            }
          }
          break;
        }
        case 'TASK_RELEASED': {
          if (!event.taskId) break;
          const task = this.services.taskService.getTask(event.taskId);
          if (task) this.broadcast({ type: 'task:updated', task });
          this.broadcast({ type: 'task:released', taskId: event.taskId });
          break;
        }
        case 'TASK_REVIEWED': {
          if (!event.taskId) break;
          const task = this.services.taskService.getTask(event.taskId);
          if (task) {
            this.broadcast({ type: 'task:updated', task });
            const payload = event.payload as { newStatus?: string };
            if (payload.newStatus) {
              this.broadcast({
                type: 'task:moved',
                taskId: event.taskId,
                status: payload.newStatus,
              });
            }
          }
          break;
        }
        case 'ADMIN_OVERRIDE': {
          if (!event.taskId) break;
          const task = this.services.taskService.getTask(event.taskId);
          if (task) {
            this.broadcast({ type: 'task:updated', task });
            const payload = event.payload as { newStatus?: string };
            if (payload.newStatus) {
              this.broadcast({
                type: 'task:moved',
                taskId: event.taskId,
                status: payload.newStatus,
              });
            }
          }
          break;
        }
        case 'LOCK_EXPIRED': {
          if (!event.taskId) break;
          const task = this.services.taskService.getTask(event.taskId);
          if (task) this.broadcast({ type: 'task:updated', task });
          this.broadcast({ type: 'task:released', taskId: event.taskId });
          break;
        }

        // ── Agent events ─────────────────────────────────────────
        case 'AGENT_CONNECTED': {
          if (!event.agentId) break;
          const agent = this.services.agentRegistry.getById(event.agentId);
          if (agent) this.broadcast({ type: 'agent:connected', agent });
          break;
        }
        case 'AGENT_DISCONNECTED': {
          if (event.agentId) {
            this.broadcast({ type: 'agent:disconnected', agentId: event.agentId });
          }
          break;
        }

        // ── Workspace events ─────────────────────────────────────
        case 'WORKSPACE_CREATED': {
          const payload = event.payload as { workspaceId?: string };
          if (payload.workspaceId) {
            const workspace = this.services.workspaceService.getWorkspace(payload.workspaceId);
            if (workspace) this.broadcast({ type: 'workspace:created', workspace });
          }
          break;
        }
        case 'WORKSPACE_ARCHIVED': {
          const payload = event.payload as { workspaceId?: string };
          if (payload.workspaceId) {
            const workspace = this.services.workspaceService.getWorkspace(payload.workspaceId);
            if (workspace) this.broadcast({ type: 'workspace:updated', workspace });
          }
          break;
        }
        case 'WORKSPACE_DELETED': {
          const payload = event.payload as { workspaceId?: string };
          if (payload.workspaceId) {
            this.broadcast({ type: 'workspace:deleted', workspaceId: payload.workspaceId });
          }
          break;
        }
        case 'WORKSPACE_MERGED': {
          const payload = event.payload as { workspaceId?: string };
          if (payload.workspaceId) {
            const workspace = this.services.workspaceService.getWorkspace(payload.workspaceId);
            if (workspace) this.broadcast({ type: 'workspace:updated', workspace });
          }
          break;
        }

        // ── Project events ───────────────────────────────────────
        case 'PROJECT_CREATED': {
          const payload = event.payload as { projectId?: string };
          if (payload.projectId) {
            const project = this.services.projectService.getProject(payload.projectId);
            if (project) this.broadcast({ type: 'project:created', project });
          }
          break;
        }
        case 'PROJECT_DELETED': {
          const payload = event.payload as { projectId?: string };
          if (payload.projectId) {
            this.broadcast({ type: 'project:deleted', projectId: payload.projectId });
          }
          break;
        }

        // ── Progress events ──────────────────────────────────────
        case 'PROGRESS_REPORTED': {
          if (!event.taskId) break;
          const task = this.services.taskService.getTask(event.taskId);
          if (task) this.broadcast({ type: 'task:updated', task });
          break;
        }

        default:
          // Unknown event type — raw event already sent as event:created above
          break;
      }
    } catch (err) {
      // Entity may have been deleted between event publish and our fetch.
      // The raw event:created was already sent above, so dashboard still gets the event log entry.
      console.error(`[WS] Failed to transform event ${event.type}:`, err);
    }
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
