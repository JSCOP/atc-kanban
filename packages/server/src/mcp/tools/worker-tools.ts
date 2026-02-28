import type { ATCServices } from '@atc/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateAgentToken } from '../middleware/role-guard.js';

/**
 * Register worker-only MCP tools.
 */
export function registerWorkerTools(server: McpServer, services: ATCServices) {
  // ── claim_task ──────────────────────────────────────────────────────────
  server.tool(
    'claim_task',
    'Claim a task for execution. Acquires a physical lock. Only "todo" tasks with met dependencies can be claimed. Tasks assigned to disconnected workers can also be claimed.',
    {
      agent_token: z.string().describe('Your agent token'),
      task_id: z.string().describe('Task ID to claim'),
    },
    async ({ agent_token, task_id }) => {
      const agent = validateAgentToken(services, agent_token);

      const result = await services.lockEngine.claimTask(
        { id: agent.id, cwd: agent.cwd, workspaceMode: agent.workspaceMode },
        task_id,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                lock_token: result.lockToken,
                task: result.task,
                workspace: result.workspace ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── update_status ───────────────────────────────────────────────────────
  server.tool(
    'update_status',
    'Update task status. Requires lock_token. Valid transitions: in_progress → review/done/failed.',
    {
      lock_token: z.string().describe('Lock token from claim_task'),
      task_id: z.string().describe('Task ID'),
      status: z.enum(['in_progress', 'review', 'done', 'failed']).describe('New status'),
    },
    async ({ lock_token, task_id, status }) => {
      const task = await services.lockEngine.updateStatus(lock_token, task_id, status);

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

  // ── report_progress ─────────────────────────────────────────────────────
  server.tool(
    'report_progress',
    'Report progress on a claimed task. Also refreshes the lock expiry timer.',
    {
      lock_token: z.string().describe('Lock token from claim_task'),
      task_id: z.string().describe('Task ID'),
      message: z.string().describe('Progress update message'),
    },
    async ({ lock_token, task_id, message }) => {
      // Get agent_id from the lock record (not from agent_token lookup)
      const { getRawDb } = await import('@atc/core');
      const raw = getRawDb();
      const lock = raw
        .prepare('SELECT agent_id FROM task_locks WHERE lock_token = ? AND task_id = ?')
        .get(lock_token, task_id) as { agent_id: string } | undefined;

      if (!lock) {
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ error: 'Invalid lock token' }) },
          ],
          isError: true,
        };
      }

      await services.lockEngine.reportProgress(lock_token, task_id, lock.agent_id, message);

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

  // ── release_task ────────────────────────────────────────────────────────
  server.tool(
    'release_task',
    'Release a claimed task back to "todo". Use when you cannot complete the task.',
    {
      lock_token: z.string().describe('Lock token from claim_task'),
      task_id: z.string().describe('Task ID'),
      reason: z.string().optional().describe('Reason for releasing'),
    },
    async ({ lock_token, task_id, reason }) => {
      await services.lockEngine.releaseTask(lock_token, task_id, reason);

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
  // ── sync_with_base ──────────────────────────────────────────────────────
  server.tool(
    'sync_with_base',
    'Sync your task worktree with the latest base branch changes (rebase). Use when the base branch has moved ahead.',
    {
      agent_token: z.string().describe('Your agent token'),
      task_id: z.string().describe('Task ID of the workspace to sync'),
    },
    async ({ agent_token, task_id }) => {
      validateAgentToken(services, agent_token);

      const workspace = services.workspaceService.findByTaskId(task_id);
      if (!workspace) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'No active workspace found for this task' }),
            },
          ],
          isError: true,
        };
      }

      const result = await services.workspaceService.syncWithBase(workspace.id);

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
}
