import type { ATCServices } from '@atc/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Tracks the agent registered in this MCP session.
 * Used for cleanup when the MCP stdio process terminates.
 */
export class McpSessionTracker {
  private agentId: string | null = null;
  private agentToken: string | null = null;

  setAgent(agentId: string, agentToken: string): void {
    this.agentId = agentId;
    this.agentToken = agentToken;
  }

  getAgentId(): string | null {
    return this.agentId;
  }

  getAgentToken(): string | null {
    return this.agentToken;
  }

  clear(): void {
    this.agentId = null;
    this.agentToken = null;
  }
}
/**
 * Register common MCP tools (available to all agents).
 */
export function registerCommonTools(
  server: McpServer,
  services: ATCServices,
  sessionTracker: McpSessionTracker,
) {
  // ── register_agent ──────────────────────────────────────────────────────
  server.tool(
    'register_agent',
    'Register a new agent. role=main enforces uniqueness (only one active main allowed).',
    {
      name: z.string().describe('Agent display name'),
      role: z
        .enum(['main', 'worker'])
        .describe('Agent role: "main" (orchestrator) or "worker" (executor)'),
      agent_type: z
        .string()
        .optional()
        .describe('Agent type: claude_code, codex, gemini, opencode, custom'),
      session_id: z
        .string()
        .optional()
        .describe('OpenCode session ID for precise agent reconnection matching'),
      workspace_mode: z
        .enum(['required', 'disabled'])
        .optional()
        .describe(
          'Workspace mode: "required" (task-based agents) or "disabled" (TUI agents). Defaults to "disabled".',
        ),
    },
    async ({ name, role, agent_type, session_id, workspace_mode }) => {
      const result = await services.agentRegistry.register({
        name,
        role,
        agentType: agent_type,
        processId: process.pid,
        cwd: process.cwd(),
        sessionId: session_id,
        workspaceMode: workspace_mode,
      });

      // Track this agent in the session for cleanup on process exit
      sessionTracker.setAgent(result.agentId, result.agentToken);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  // ── heartbeat ───────────────────────────────────────────────────────────
  server.tool(
    'heartbeat',
    'Send heartbeat signal. For main agents, also returns pending events.',
    {
      agent_token: z.string().describe('Agent token from registration'),
    },
    async ({ agent_token }) => {
      const agent = services.agentRegistry.heartbeat(agent_token);

      // If main agent, include pending events
      let pendingEvents: unknown[] = [];
      if (agent.role === 'main') {
        pendingEvents = services.eventBus.getRecentEvents(20);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                status: 'ok',
                agent_id: agent.id,
                role: agent.role,
                pending_events: pendingEvents,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── list_tasks ──────────────────────────────────────────────────────────
  server.tool(
    'list_tasks',
    'List tasks with optional filters.',
    {
      status: z
        .array(z.string())
        .optional()
        .describe('Filter by status(es): todo, locked, in_progress, review, done, failed'),
      priority: z.string().optional().describe('Filter by priority: critical, high, medium, low'),
      assignee: z.string().optional().describe('Filter by assigned agent ID'),
      label: z.string().optional().describe('Filter by label'),
    },
    async ({ status, priority, assignee, label }) => {
      const tasks = services.taskService.listTasks({
        status: status as any,
        priority,
        assignee,
        label,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ tasks }, null, 2),
          },
        ],
      };
    },
  );

  // ── get_task ────────────────────────────────────────────────────────────
  server.tool(
    'get_task',
    'Get detailed information about a specific task, including history, comments, and progress logs.',
    {
      task_id: z.string().describe('Task ID'),
    },
    async ({ task_id }) => {
      const task = services.taskService.getTaskDetail(task_id);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ task }, null, 2),
          },
        ],
      };
    },
  );
}
