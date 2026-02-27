import { type ChildProcess, spawn } from 'node:child_process';
import { type ATCServices, type SpawnOpenCodeInput, type SpawnOpenCodeResult, eq, isProcessAlive, schema } from '@atc/core';

/**
 * Manages spawning and tracking OpenCode server processes.
 * Each spawned process runs `opencode serve --port <port> --hostname 127.0.0.1`.
 */
export class OpenCodeSpawner {
  private services: ATCServices;
  private processes = new Map<string, ChildProcess>(); // agentId → process
  private nextPort = 14000; // Start assigning ports from 14000

  constructor(services: ATCServices) {
    this.services = services;
    this.recoverSpawnedProcesses();
  }

  /**
   * On startup, recover spawned processes from DB.
   * If a previously-spawned process is still alive AND healthy, re-adopt it.
   */
  private recoverSpawnedProcesses(): void {
    const spawnedAgents = this.services.db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.connectionType, 'opencode'))
      .all()
      .filter((a) => a.spawnedPid != null && a.status === 'active');

    for (const agent of spawnedAgents) {
      const pid = agent.spawnedPid!;
      if (isProcessAlive(pid)) {
        // Process is alive — we can't get the ChildProcess handle back,
        // but we know it's running. Mark as recovered (no kill capability).
        console.error(`[Spawner] Recovered spawned agent ${agent.name} (PID ${pid}) on ${agent.serverUrl}`);
      } else {
        // Process is dead — clear spawnedPid
        this.services.db
          .update(schema.agents)
          .set({ spawnedPid: null })
          .where(eq(schema.agents.id, agent.id))
          .run();
        console.error(`[Spawner] Spawned agent ${agent.name} (PID ${pid}) is dead, clearing spawnedPid`);
      }
    }
  }

  /**
   * Spawn a new OpenCode server process and register it as an agent.
   * Returns once the server is healthy and the agent is registered.
   */
  async spawn(input: SpawnOpenCodeInput): Promise<SpawnOpenCodeResult> {
    const port = input.port || this.nextPort++;
    const serverUrl = `http://127.0.0.1:${port}`;

    // Spawn the opencode serve process
    let child: ChildProcess;
    try {
      child = spawn('opencode', ['serve', '--port', String(port), '--hostname', '127.0.0.1'], {
        cwd: input.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: process.platform === 'win32', // Windows needs shell to resolve .cmd scripts
        env: { ...process.env },
      });
    } catch (err) {
      throw new Error(`Failed to spawn opencode process: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Handle spawn errors (e.g., ENOENT when opencode binary not found)
    // Must be attached before any await to prevent unhandled error crash
    let spawnError: Error | undefined;
    child.on('error', (err) => {
      spawnError = err;
    });

    if (!child.pid) {
      // Give error event a tick to fire
      await new Promise((resolve) => setTimeout(resolve, 100));
      const reason = spawnError ? spawnError.message : 'no PID returned';
      throw new Error(`Failed to spawn opencode process — ${reason}`);
    }

    const pid = child.pid;

    // Collect stderr for diagnostics
    let stderrBuffer = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    // Wait for the server to become healthy
    try {
      await this.waitForHealth(serverUrl, 30000);
    } catch (error) {
      // Kill the process if health check fails
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      const hint = stderrBuffer ? `\nProcess stderr: ${stderrBuffer.slice(0, 500)}` : '';
      const spawnHint = spawnError ? `\nSpawn error: ${spawnError.message}` : '';
      throw new Error(`OpenCode server failed to start on port ${port} within 30s.${hint}${spawnHint}`);
    }

    // Register as an OpenCode agent
    const agent = await this.services.agentRegistry.registerOpenCodeAgent({
      name: input.name,
      serverUrl,
    });

    // Track the process
    this.processes.set(agent.id, child);

    // Persist spawned_pid to DB for recovery after ATC restart
    this.services.db
      .update(schema.agents)
      .set({ spawnedPid: pid })
      .where(eq(schema.agents.id, agent.id))
      .run();

    // Auto-cleanup when process exits
    child.on('exit', (code) => {
      this.processes.delete(agent.id);
      // Clear spawnedPid in DB
      this.services.db
        .update(schema.agents)
        .set({ spawnedPid: null })
        .where(eq(schema.agents.id, agent.id))
        .run();
      console.error(
        `[Spawner] OpenCode process for agent ${agent.name} (PID ${pid}) exited with code ${code}`,
      );
      // Mark agent as disconnected
      this.services.agentRegistry.disconnectById(agent.id, 'process_exited').catch(console.error);
    });

    return {
      agentId: agent.id,
      serverUrl,
      port,
      pid,
    };
  }

  /**
   * Kill a spawned OpenCode process by agent ID.
   */
  async kill(agentId: string): Promise<void> {
    const child = this.processes.get(agentId);
    if (child) {
      child.kill('SIGTERM');
      this.processes.delete(agentId);
    }
    await this.services.agentRegistry.removeById(agentId);
  }

  /**
   * List all active spawned processes.
   */
  listSpawned(): { agentId: string; pid: number }[] {
    const result: { agentId: string; pid: number }[] = [];
    for (const [agentId, child] of this.processes) {
      if (child.pid) {
        result.push({ agentId, pid: child.pid });
      }
    }
    return result;
  }

  /**
   * Kill all spawned processes. Used during graceful shutdown.
   */
  killAll(): void {
    for (const [agentId, child] of this.processes) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      this.processes.delete(agentId);
    }
  }

  /**
   * Poll GET /global/health until it returns 200, or timeout.
   */
  private async waitForHealth(serverUrl: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    const pollInterval = 500;

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${serverUrl}/global/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return;
      } catch {
        // Server not ready yet — keep polling
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Health check timeout after ${timeoutMs}ms`);
  }
}
