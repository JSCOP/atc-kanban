import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { type ATCServices, eq, schema } from '@atc/core';

const execAsync = promisify(exec);

export interface DiscoveredInstance {
  serverUrl: string;
  port: number;
  healthy: boolean;
  alreadyRegistered: boolean;
  existingAgentId: string | null;
}

export interface DetectedProcess {
  pid: number;
  command: string;
  hasHttpServer: boolean;
  extractedPort: number | null;
  listenPorts: number[];
}

export interface DiscoveryResult {
  discovered: DiscoveredInstance[];
  processes: DetectedProcess[];
  scannedRange: [number, number];
  duration: number;
}

/**
 * Scans a local port range for running OpenCode instances
 * and detects running OpenCode processes on the system.
 *
 * Three detection vectors:
 * 1. Process detection — OS-level process listing to find opencode binaries
 * 2. PID→Port mapping — OS network state (netstat/ss) to find actual listen ports
 * 3. Port probing — GET /global/health on priority ports + PID-derived ports + configurable range
 */
export class OpenCodeDiscovery {
  private services: ATCServices;

  /** Priority ports always included in scan (OpenCode serve default) */
  private static readonly PRIORITY_PORTS = [4096];

  constructor(services: ATCServices) {
    this.services = services;
  }

  /**
   * Scan for OpenCode instances via port probing + process detection.
   * Returns HTTP-reachable instances and detected OS processes.
   */
  async scan(portStart = 14000, portEnd = 15000): Promise<DiscoveryResult> {
    const start = Date.now();

    // Get all existing OpenCode agents from DB for matching
    const existingAgents = this.services.db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.connectionType, 'opencode'))
      .all();

    const existingByUrl = new Map(
      existingAgents.filter((a) => a.serverUrl).map((a) => [a.serverUrl!, a.id]),
    );

    // Step 1: Detect processes + OS network state in parallel
    const [processes, listenMap] = await Promise.all([
      this.detectProcesses(),
      this.getListeningPortsMap(),
    ]);

    // Step 2: Enrich processes with actual listen ports from OS network state
    const pidPorts: number[] = [];
    for (const proc of processes) {
      proc.listenPorts = listenMap.get(proc.pid) ?? [];
      if (proc.listenPorts.length > 0) {
        proc.hasHttpServer = true;
      }
      pidPorts.push(...proc.listenPorts);
    }

    // Step 3: Build port list: priority + range + PID-derived (deduplicated)
    const rangePorts = Array.from({ length: portEnd - portStart + 1 }, (_, i) => portStart + i);
    const allPorts = [...new Set([...OpenCodeDiscovery.PRIORITY_PORTS, ...rangePorts, ...pidPorts])];

    // Skip the ATC server's own port
    const atcPort = Number.parseInt(process.env.PORT || '4000', 10);

    // Step 4: Probe all ports for OpenCode health endpoint
    const portResults = await Promise.allSettled(
      allPorts.filter((port) => port !== atcPort && port > 0).map((port) => this.probePort(port)),
    );

    const discovered: DiscoveredInstance[] = [];

    for (const result of portResults) {
      if (result.status === 'fulfilled' && result.value) {
        const { port, serverUrl } = result.value;
        const existingId = existingByUrl.get(serverUrl) ?? null;
        discovered.push({
          serverUrl,
          port,
          healthy: true,
          alreadyRegistered: existingId !== null,
          existingAgentId: existingId,
        });
      }
    }

    // Step 5: Cross-reference — mark processes whose listen ports were discovered
    for (const proc of processes) {
      if (proc.listenPorts.some((p) => discovered.some((d) => d.port === p))) {
        proc.hasHttpServer = true;
      }
    }

    // Step 6: Group-based session assignment.
    // All OpenCode instances sharing the same CWD/project share a single session store.
    // We fetch the session list ONCE per CWD group, then assign unique sessions to each agent.
    const agentsWithUrl = existingAgents.filter((a) => a.serverUrl);
    if (agentsWithUrl.length > 0) {
      // Group agents by CWD (null CWD agents get their own group keyed by serverUrl)
      const cwdGroups = new Map<string, typeof agentsWithUrl>();
      for (const a of agentsWithUrl) {
        const groupKey = a.cwd ?? `__url__${a.serverUrl}`;
        const group = cwdGroups.get(groupKey) ?? [];
        group.push(a);
        cwdGroups.set(groupKey, group);
      }

      await Promise.allSettled(
        [...cwdGroups.values()].map(async (group) => {
          // Fetch CWD for agents missing it (use first agent's serverUrl)
          const representative = group[0];
          const sessions = await this.services.opencodeBridge.fetchAllSessions(representative.serverUrl!);

          // Update CWD for any agents missing it
          for (const a of group) {
            if (!a.cwd && sessions.length > 0 && sessions[0].directory) {
              this.services.agentRegistry.updateSessionInfo(a.id, { cwd: sessions[0].directory });
              a.cwd = sessions[0].directory;
            }
          }

          if (sessions.length === 0) return;

          // Build a set of session IDs already assigned within this group
          const assignedSessionIds = new Set<string>();
          for (const a of group) {
            if (a.sessionId && sessions.some((s) => s.id === a.sessionId)) {
              assignedSessionIds.add(a.sessionId);
            }
          }

          // Assign unassigned sessions to agents that don't have a valid one
          const unassignedSessions = sessions.filter((s) => s.id && !assignedSessionIds.has(s.id));
          let nextIdx = 0;

          for (const a of group) {
            const hasValidSession = a.sessionId && sessions.some((s) => s.id === a.sessionId);
            if (hasValidSession) {
              // Agent already has a valid session — just update the title in case it changed
              const session = sessions.find((s) => s.id === a.sessionId);
              if (session && session.title !== a.sessionTitle) {
                this.services.agentRegistry.updateSessionInfo(a.id, {
                  sessionId: a.sessionId,
                  sessionTitle: session.title,
                });
              }
            } else if (nextIdx < unassignedSessions.length) {
              // Assign the next available unassigned session
              const session = unassignedSessions[nextIdx++];
              this.services.agentRegistry.updateSessionInfo(a.id, {
                sessionId: session.id,
                sessionTitle: session.title,
              });
            }
          }
        }),
      );
    }

    return {
      discovered,
      processes,
      scannedRange: [portStart, portEnd],
      duration: Date.now() - start,
    };
  }

  /**
   * Probe a single port for an OpenCode health endpoint.
   * Returns null if port is not an OpenCode instance.
   */
  private async probePort(port: number): Promise<{ port: number; serverUrl: string } | null> {
    const serverUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${serverUrl}/global/health`, {
        signal: AbortSignal.timeout(500),
      });

      if (res.ok) {
        return { port, serverUrl };
      }
    } catch {
      // ECONNREFUSED, timeout, etc. — not an OpenCode instance
    }

    return null;
  }

  /**
   * Detect running OpenCode processes using OS-level process listing.
   * Filters out LSP subprocesses to return only actual OpenCode instances.
   */
  private async detectProcesses(): Promise<DetectedProcess[]> {
    try {
      if (process.platform === 'win32') {
        return await this.detectProcessesWin32();
      }
      return await this.detectProcessesUnix();
    } catch {
      return [];
    }
  }

  /**
   * Windows: Use wmic to find opencode.exe processes.
   */
  private async detectProcessesWin32(): Promise<DetectedProcess[]> {
    try {
      const { stdout } = await execAsync(
        'wmic process where "name=\'opencode.exe\'" get processid,commandline /format:list',
        { timeout: 5000 },
      );

      const processes: DetectedProcess[] = [];
      // wmic /format:list separates records by blank lines
      const blocks = stdout.split(/\r?\n\s*\r?\n/).filter((b) => b.trim());

      for (const block of blocks) {
        const lines = block.split(/\r?\n/).filter((l) => l.trim());
        let commandLine = '';
        let pid = 0;

        for (const line of lines) {
          const eqIdx = line.indexOf('=');
          if (eqIdx === -1) continue;
          const key = line.substring(0, eqIdx).trim();
          const value = line.substring(eqIdx + 1).trim();

          if (key === 'CommandLine') commandLine = value;
          else if (key === 'ProcessId') pid = Number.parseInt(value, 10);
        }

        if (!pid || Number.isNaN(pid)) continue;

        // Skip LSP/language-server subprocesses
        if (
          commandLine.includes('typescript-language-server') ||
          commandLine.includes('language-server --stdio')
        ) {
          continue;
        }

        const portMatch = commandLine.match(/--port\s+(\d+)/);
        const extractedPort = portMatch ? Number.parseInt(portMatch[1], 10) : null;
        const hasServeFlag = commandLine.includes(' serve') || extractedPort !== null;

        processes.push({
          pid,
          command: commandLine,
          hasHttpServer: hasServeFlag,
          extractedPort,
          listenPorts: [],
        });
      }

      return processes;
    } catch {
      return [];
    }
  }

  /**
   * Unix/macOS: Use ps to find opencode processes.
   */
  private async detectProcessesUnix(): Promise<DetectedProcess[]> {
    try {
      const { stdout } = await execAsync('ps -eo pid,args', { timeout: 5000 });
      const processes: DetectedProcess[] = [];

      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.includes('opencode') || trimmed.includes('grep')) continue;

        const match = trimmed.match(/^(\d+)\s+(.+)$/);
        if (!match) continue;

        const pid = Number.parseInt(match[1], 10);
        const command = match[2];

        // Skip LSP subprocesses
        if (
          command.includes('typescript-language-server') ||
          command.includes('language-server --stdio')
        ) {
          continue;
        }

        const portMatch = command.match(/--port\s+(\d+)/);
        const extractedPort = portMatch ? Number.parseInt(portMatch[1], 10) : null;
        const hasServeFlag = command.includes(' serve') || extractedPort !== null;

        processes.push({
          pid,
          command,
          hasHttpServer: hasServeFlag,
          extractedPort,
          listenPorts: [],
        });
      }

      return processes;
    } catch {
      return [];
    }
  }

  /**
   * Get all listening TCP ports grouped by PID using OS network inspection.
   * Returns Map<PID, [ports]> for cross-referencing with detected processes.
   */
  private async getListeningPortsMap(): Promise<Map<number, number[]>> {
    try {
      if (process.platform === 'win32') {
        return await this.getListeningPortsMapWin32();
      }
      return await this.getListeningPortsMapUnix();
    } catch {
      return new Map();
    }
  }

  /**
   * Windows: Parse `netstat -ano` for LISTENING TCP connections.
   */
  private async getListeningPortsMapWin32(): Promise<Map<number, number[]>> {
    const { stdout } = await execAsync('netstat -ano', { timeout: 5000 });
    const map = new Map<number, number[]>();

    for (const line of stdout.split('\n')) {
      // Format: TCP    127.0.0.1:4096    0.0.0.0:0    LISTENING    36712
      const match = line.trim().match(/TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
      if (match) {
        const port = Number.parseInt(match[1], 10);
        const pid = Number.parseInt(match[2], 10);
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(port);
      }
    }

    return map;
  }

  /**
   * Unix/macOS: Parse `ss -tlnp` (Linux) or `lsof` (macOS) for listening ports.
   */
  private async getListeningPortsMapUnix(): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();

    // Try ss first (standard on Linux)
    try {
      const { stdout } = await execAsync('ss -tlnp 2>/dev/null', { timeout: 5000 });

      for (const line of stdout.split('\n')) {
        // Format: LISTEN 0 128 127.0.0.1:4096 0.0.0.0:* users:(("opencode",pid=36712,fd=7))
        const portMatch = line.match(/:(\d+)\s/);
        const pidMatch = line.match(/pid=(\d+)/);
        if (portMatch && pidMatch) {
          const port = Number.parseInt(portMatch[1], 10);
          const pid = Number.parseInt(pidMatch[1], 10);
          if (!map.has(pid)) map.set(pid, []);
          map.get(pid)!.push(port);
        }
      }

      if (map.size > 0) return map;
    } catch {
      // ss not available — try lsof
    }

    // Fallback: lsof (macOS + Linux)
    try {
      const { stdout } = await execAsync('lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null', {
        timeout: 5000,
      });

      for (const line of stdout.split('\n')) {
        // Format: opencode 36712 user 7u IPv4 0x1234 0t0 TCP 127.0.0.1:4096 (LISTEN)
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9 || parts[parts.length - 1] !== '(LISTEN)') continue;

        const pid = Number.parseInt(parts[1], 10);
        const namePort = parts[parts.length - 2];
        const portStr = namePort.split(':').pop();
        if (!portStr || Number.isNaN(pid)) continue;

        const port = Number.parseInt(portStr, 10);
        if (Number.isNaN(port)) continue;

        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(port);
      }
    } catch {
      // No network inspection available
    }

    return map;
  }

  /**
   * Track a discovered instance by registering it as an OpenCode agent.
   */
  async track(serverUrl: string, name?: string): Promise<{ agentId: string }> {
    const agentName = name || `OpenCode@${new URL(serverUrl).port}`;
    const sessions = await this.services.opencodeBridge.fetchAllSessions(serverUrl);
    const cwd = sessions.length > 0 ? (sessions[0].directory ?? null) : null;

    const agent = await this.services.agentRegistry.registerOpenCodeAgent({
      name: agentName,
      serverUrl,
      ...(cwd ? { cwd } : {}),
    });

    // Group-aware session assignment: find sessions already used by agents with same CWD
    if (sessions.length > 0) {
      const existingAgents = this.services.db
        .select()
        .from(schema.agents)
        .where(eq(schema.agents.connectionType, 'opencode'))
        .all();

      const sameGroupAgents = existingAgents.filter(
        (a) => a.id !== agent.id && a.cwd === cwd,
      );
      const assignedSessionIds = new Set(
        sameGroupAgents
          .filter((a) => a.sessionId && sessions.some((s) => s.id === a.sessionId))
          .map((a) => a.sessionId!),
      );

      const unassigned = sessions.find((s) => s.id && !assignedSessionIds.has(s.id));
      if (unassigned) {
        this.services.agentRegistry.updateSessionInfo(agent.id, {
          sessionId: unassigned.id,
          sessionTitle: unassigned.title,
        });
      }
    }

    // Auto-register workspace from agent's CWD if it's a git repo
    if (cwd) {
      try {
        await this.services.workspaceService.createWorkspace({
          repoRoot: cwd,
          baseBranch: 'main',
        });
      } catch {
        // Workspace may already exist — ignore duplicate errors
      }
    }

    return { agentId: agent.id };
  }
}

