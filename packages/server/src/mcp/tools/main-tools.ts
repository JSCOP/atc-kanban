import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ATCServices } from '@atc/core';
import { validateMainToken } from '../middleware/role-guard.js';

/**
 * Register main-only MCP tools (orchestrator).
 */
export function registerMainTools(server: McpServer, services: ATCServices) {
  // ── create_task ─────────────────────────────────────────────────────────
  server.tool(
    'create_task',
    'Create a new task on the board. Main agent only.',
    {
      main_token: z.string().describe('Main agent token'),
      title: z.string().describe('Task title'),
      description: z.string().optional().describe('Detailed task description'),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Priority level'),
      labels: z.array(z.string()).optional().describe('Task labels/tags'),
      depends_on: z.array(z.string()).optional().describe('Task IDs this task depends on'),
    },
    async ({ main_token, title, description, priority, labels, depends_on }) => {
      const agent = validateMainToken(services, main_token);

      const task = await services.taskService.createTask(
        {
          title,
          description,
          priority,
          labels,
          dependsOn: depends_on,
        },
        agent.id,
      );

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

  // ── update_task ─────────────────────────────────────────────────────────
  server.tool(
    'update_task',
    'Update task metadata (title, description, priority, labels). Main agent only.',
    {
      main_token: z.string().describe('Main agent token'),
      task_id: z.string().describe('Task ID'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      priority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('New priority'),
      labels: z.array(z.string()).optional().describe('New labels'),
    },
    async ({ main_token, task_id, title, description, priority, labels }) => {
      validateMainToken(services, main_token);

      const task = await services.taskService.updateTask(task_id, {
        title,
        description,
        priority,
        labels,
      });

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

  // ── delete_task ─────────────────────────────────────────────────────────
  server.tool(
    'delete_task',
    'Delete a task. Cannot delete locked/in_progress tasks. Main agent only.',
    {
      main_token: z.string().describe('Main agent token'),
      task_id: z.string().describe('Task ID'),
    },
    async ({ main_token, task_id }) => {
      validateMainToken(services, main_token);
      await services.taskService.deleteTask(task_id);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: true }),
          },
        ],
      };
    },
  );

  // ── set_dependency ──────────────────────────────────────────────────────
  server.tool(
    'set_dependency',
    'Set task dependencies. Validates no circular dependencies. Main agent only.',
    {
      main_token: z.string().describe('Main agent token'),
      task_id: z.string().describe('Task ID'),
      depends_on: z.array(z.string()).describe('Task IDs this task depends on'),
    },
    async ({ main_token, task_id, depends_on }) => {
      validateMainToken(services, main_token);
      services.dependencyResolver.setDependencies(task_id, depends_on);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: true }),
          },
        ],
      };
    },
  );

  // ── review_task ─────────────────────────────────────────────────────────
  server.tool(
    'review_task',
    'Review a task in "review" status. Approve → done, Reject → todo. Main agent only.',
    {
      main_token: z.string().describe('Main agent token'),
      task_id: z.string().describe('Task ID'),
      verdict: z.enum(['approve', 'reject']).describe('Review verdict'),
      comment: z.string().optional().describe('Review comment'),
    },
    async ({ main_token, task_id, verdict, comment }) => {
      const agent = validateMainToken(services, main_token);
      await services.lockEngine.reviewTask(task_id, verdict, comment, agent.id);

      const task = services.taskService.getTask(task_id);

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

  // ── force_release ───────────────────────────────────────────────────────
  server.tool(
    'force_release',
    'Force release a locked task. Use for unresponsive workers. Main agent only.',
    {
      main_token: z.string().describe('Main agent token'),
      task_id: z.string().describe('Task ID'),
    },
    async ({ main_token, task_id }) => {
      validateMainToken(services, main_token);
      await services.lockEngine.forceRelease(task_id);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: true }),
          },
        ],
      };
    },
  );

  // ── poll_events ─────────────────────────────────────────────────────────
  server.tool(
    'poll_events',
    'Poll for recent events. Main agent should call this periodically to monitor workers.',
    {
      main_token: z.string().describe('Main agent token'),
      since: z.string().optional().describe('ISO timestamp to get events after'),
      types: z.array(z.string()).optional().describe('Event types to filter'),
    },
    async ({ main_token, since, types }) => {
      validateMainToken(services, main_token);

      const events = services.eventBus.pollEvents({
        since: since || undefined,
        types: types as any,
        limit: 50,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ events }, null, 2),
          },
        ],
      };
    },
  );

  // ── get_board_summary ───────────────────────────────────────────────────
  server.tool(
    'get_board_summary',
    'Get board overview: task counts by status, active agents, and recent events. Main agent only.',
    {
      main_token: z.string().describe('Main agent token'),
    },
    async ({ main_token }) => {
      validateMainToken(services, main_token);
      const summary = services.taskService.getBoardSummary();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    },
  );

  // ── create_workspace ──────────────────────────────────────────────────
  server.tool(
    'create_workspace',
    'Register a git repository as a managed workspace. Main agent only.',
    {
      main_token: z.string().describe('Main agent token'),
      repo_root: z.string().describe('Absolute path to git repository root'),
      base_branch: z.string().optional().describe('Base branch name (default: main)'),
    },
    async ({ main_token, repo_root, base_branch }) => {
      validateMainToken(services, main_token);
      const workspace = await services.workspaceService.createWorkspace({
        repoRoot: repo_root,
        baseBranch: base_branch,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ workspace }, null, 2),
          },
        ],
      };
    },
  );

  // ── list_workspaces ─────────────────────────────────────────────────────
  server.tool(
    'list_workspaces',
    'List all managed workspaces with optional filters. Main agent only.',
    {
      main_token: z.string().describe('Main agent token'),
      repo_root: z.string().optional().describe('Filter by repository root path'),
      status: z.string().optional().describe('Filter by status: active, archived, deleted'),
    },
    async ({ main_token, repo_root, status }) => {
      validateMainToken(services, main_token);
      const workspaces = services.workspaceService.listWorkspaces({
        repoRoot: repo_root,
        status,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ workspaces }, null, 2),
          },
        ],
      };
    },
  );

  // ── delete_workspace ────────────────────────────────────────────────────
  server.tool(
    'delete_workspace',
    'Soft-delete a workspace and archive its worktrees. Main agent only.',
    {
      main_token: z.string().describe('Main agent token'),
      workspace_id: z.string().describe('Workspace ID to delete'),
    },
    async ({ main_token, workspace_id }) => {
      validateMainToken(services, main_token);
      await services.workspaceService.deleteWorkspace(workspace_id);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: true }),
          },
        ],
      };
    },
  );
}
