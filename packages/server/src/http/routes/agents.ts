import type { ATCServices } from '@atc/core';
import { Hono } from 'hono';
import type { OpenCodeDiscovery } from '../../services/opencode-discovery.js';
import type { OpenCodeSpawner } from '../../services/opencode-spawner.js';

export function createAgentRoutes(
  services: ATCServices,
  spawner?: OpenCodeSpawner,
  discovery?: OpenCodeDiscovery,
) {
  const app = new Hono();

  // GET /api/agents - List all agents (MCP + OpenCode unified)
  app.get('/', (c) => {
    const agents = services.agentRegistry.listAgents();
    return c.json({ agents });
  });

  // POST /api/agents/opencode - Register an OpenCode agent from dashboard
  app.post('/opencode', async (c) => {
    const body = await c.req.json();
    const agent = await services.agentRegistry.registerOpenCodeAgent(body);
    return c.json({ agent }, 201);
  });

  // POST /api/agents/:id/health - Check health of an OpenCode agent
  app.post('/:id/health', async (c) => {
    const agentId = c.req.param('id');
    const agent = await services.agentRegistry.checkOpenCodeHealth(agentId);
    return c.json({ agent });
  });

  // GET /api/agents/:id/opencode-agents - List available OpenCode agent types (build, plan, etc.)
  app.get('/:id/opencode-agents', async (c) => {
    const agentId = c.req.param('id');
    const agentTypes = await services.opencodeBridge.fetchOpenCodeAgents(agentId);
    return c.json({ agents: agentTypes });
  });

  // GET /api/agents/:id/session-messages - Get OpenCode session messages
  app.get('/:id/session-messages', async (c) => {
    const agentId = c.req.param('id');
    const messages = await services.opencodeBridge.fetchSessionMessages(agentId);
    return c.json({ messages });
  });

  // GET /api/agents/:id/sessions - List all sessions for an OpenCode agent
  app.get('/:id/sessions', async (c) => {
    const agentId = c.req.param('id');
    const sessions = await services.opencodeBridge.listSessions(agentId);
    return c.json({ sessions });
  });

  // POST /api/agents/:id/sessions - Create a new session on an OpenCode agent
  app.post('/:id/sessions', async (c) => {
    const agentId = c.req.param('id');
    const body = await c.req.json();
    const session = await services.opencodeBridge.createSession(agentId, body.title);
    return c.json({ session }, 201);
  });

  // GET /api/agents/:id/sessions/:sessionId/messages - Fetch messages from a specific session
  app.get('/:id/sessions/:sessionId/messages', async (c) => {
    const agentId = c.req.param('id');
    const sessionId = c.req.param('sessionId');
    const messages = await services.opencodeBridge.fetchSessionMessagesBySessionId(
      agentId,
      sessionId,
    );
    return c.json({ messages });
  });

  // POST /api/agents/:id/sessions/:sessionId/messages - Send a message to a session
  app.post('/:id/sessions/:sessionId/messages', async (c) => {
    const agentId = c.req.param('id');
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json();
    await services.opencodeBridge.sendMessage(agentId, sessionId, body.message, body.opencodeAgent);
    return c.json({ ok: true }, 201);
  });

  // GET /api/agents/:id/activity - Get unified activity for any agent (events + progress logs)
  app.get('/:id/activity', (c) => {
    const agentId = c.req.param('id');
    const since = c.req.query('since');
    const limit = Number.parseInt(c.req.query('limit') || '50', 10);

    const agentEvents = services.eventBus.pollEvents({
      agentId,
      since,
      limit,
    });

    return c.json({ activity: agentEvents });
  });

  // PATCH /api/agents/:id - Update agent (rename)
  app.patch('/:id', async (c) => {
    const agentId = c.req.param('id');
    const body = (await c.req.json()) as { name?: string };
    if (!body.name?.trim()) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'name is required' } }, 400);
    }
    const agent = await services.agentRegistry.renameAgent(agentId, body.name.trim());
    return c.json({ agent });
  });

  // PATCH /api/agents/:id/role - Update agent role (promote/demote)
  app.patch('/:id/role', async (c) => {
    const agentId = c.req.param('id');
    const body = (await c.req.json()) as { role?: string };
    if (!body.role || !['main', 'worker'].includes(body.role)) {
      return c.json(
        { error: { code: 'INVALID_INPUT', message: 'role must be "main" or "worker"' } },
        400,
      );
    }
    const agent = await services.agentRegistry.updateRole(agentId, body.role as 'main' | 'worker');
    return c.json({ agent });
  });

  // POST /api/agents/reload - Run health checks + re-discovery + return fresh agent list
  app.post('/reload', async (c) => {
    // 1. Health check all active agents (disconnects dead ones)
    await services.agentRegistry.checkHealth();
    // 2. Re-run discovery scan if available
    if (discovery) {
      try {
        await discovery.scan(4096, 15000);
      } catch {
        // Non-fatal: discovery failure shouldn't block reload
      }
    }
    // 3. Return fresh agent list
    const agents = services.agentRegistry.listAgents();
    return c.json({ agents });
  });

  // DELETE /api/agents/disconnected - Bulk-remove all disconnected agents
  app.delete('/disconnected', async (c) => {
    const allAgents = services.agentRegistry.listAgents();
    const disconnected = allAgents.filter((a) => a.status === 'disconnected');
    let removed = 0;
    for (const agent of disconnected) {
      await services.agentRegistry.removeById(agent.id);
      removed++;
    }
    return c.json({ removed, total: disconnected.length });
  });

  // DELETE /api/agents/:id - Remove an agent entirely (disconnect + delete from DB)
  // If the agent was spawned by us, also kills the opencode process.
  // Manually registered agents are only unregistered (their process is NOT killed).
  app.delete('/:id', async (c) => {
    const agentId = c.req.param('id');
    if (spawner) {
      // kill() only terminates processes tracked in spawner.processes Map;
      // manually registered agents are not tracked, so their process is untouched.
      await spawner.kill(agentId);
    } else {
      await services.agentRegistry.removeById(agentId);
    }
    return c.json({ ok: true });
  });

  // POST /api/agents/spawn - Spawn a new OpenCode server process
  app.post('/spawn', async (c) => {
    if (!spawner) {
      return c.json({ error: 'Spawner not available' }, 503);
    }
    try {
      const body = (await c.req.json()) as { name?: string; cwd?: string; port?: number };
      const name = body.name || `OpenCode-${Date.now()}`;
      const cwd = body.cwd || process.cwd();
      const result = await spawner.spawn({ name, cwd, port: body.port });
      return c.json(result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Spawn] Failed:', message);
      return c.json({ error: { code: 'SPAWN_FAILED', message } }, 500);
    }
  });

  // GET /api/agents/spawned - List all spawned processes
  app.get('/spawned', (c) => {
    if (!spawner) {
      return c.json({ spawned: [] });
    }
    return c.json({ spawned: spawner.listSpawned() });
  });

  // POST /api/agents/:id/kill - Kill a spawned OpenCode process
  app.post('/:id/kill', async (c) => {
    if (!spawner) {
      return c.json({ error: 'Spawner not available' }, 503);
    }
    const agentId = c.req.param('id');
    await spawner.kill(agentId);
    return c.json({ ok: true });
  });

  // GET /api/agents/discover - Scan for running OpenCode instances
  app.get('/discover', async (c) => {
    if (!discovery) {
      return c.json({ error: 'Discovery not available' }, 503);
    }
    try {
      const portStart = Number.parseInt(c.req.query('portStart') || '14000', 10);
      const portEnd = Number.parseInt(c.req.query('portEnd') || '15000', 10);
      const result = await discovery.scan(portStart, portEnd);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'DISCOVERY_FAILED', message } }, 500);
    }
  });

  // POST /api/agents/discover/track - Register a discovered instance as an agent
  app.post('/discover/track', async (c) => {
    if (!discovery) {
      return c.json({ error: 'Discovery not available' }, 503);
    }
    try {
      const body = await c.req.json();
      const result = await discovery.track(body.serverUrl, body.name);
      return c.json(result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'TRACK_FAILED', message } }, 500);
    }
  });

  return app;
}
