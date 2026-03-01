import { type ChildProcess, fork } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = resolve(__dirname, 'index.js');

// ── State ───────────────────────────────────────────────────────────────────

let server: ChildProcess | null = null;
let port = Number.parseInt(process.env.PORT || '4000', 10);
let ready = false;
let awaitingPort = false;

// ── ANSI ────────────────────────────────────────────────────────────────────

const CLR = '\x1b[2J\x1b[H';
const B = '\x1b[1m';
const R = '\x1b[0m';
const D = '\x1b[2m';
const G = '\x1b[32m';
const C = '\x1b[36m';
const Y = '\x1b[33m';

// ── Entry ───────────────────────────────────────────────────────────────────

if (process.argv.includes('--mcp')) {
  const child = fork(SERVER_SCRIPT, ['--mcp'], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
} else {
  main();
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  start();
  draw();

  rl.on('line', (raw) => {
    const input = raw.trim();

    if (awaitingPort) {
      awaitingPort = false;
      if (input === '') {
        draw();
        return;
      }
      const n = Number.parseInt(input, 10);
      if (Number.isNaN(n) || n < 1 || n > 65535) {
        flash('Invalid port. Must be 1–65535.');
      } else {
        port = n;
        flash(`Port changed to ${port}. Press [1] to start.`);
      }
      return;
    }

    switch (input) {
      case '1':
        if (server) {
          flash('Already running.');
        } else {
          start();
          draw();
        }
        break;
      case '2':
        if (server) {
          stop();
        } else {
          flash('Not running.');
        }
        break;
      case '3':
        if (server) {
          flash('Stop server first to change port.');
        } else {
          awaitingPort = true;
          draw();
          process.stdout.write(`\x1b[1A  ${C}Enter port [${port}]:${R} `);
        }
        break;
      case '4':
      case 'q':
        quit();
        break;
      default:
        draw();
    }
  });

  rl.on('close', quit);
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

// ── Server lifecycle ────────────────────────────────────────────────────────

function start(): void {
  ready = false;
  server = fork(SERVER_SCRIPT, [], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  server.stdout?.on('data', (d: Buffer) => {
    if (!ready && d.toString().includes('ATC Server Running')) {
      ready = true;
      draw();
    }
  });

  server.stderr?.on('data', () => {
    // suppress server noise (WS connect/disconnect)
  });

  server.on('exit', (code) => {
    server = null;
    ready = false;
    if (code && code !== 0) {
      flash(`Server exited with code ${code}.`);
    } else {
      draw();
    }
  });

  server.on('error', (err) => {
    server = null;
    ready = false;
    flash(`Start failed: ${err.message}`);
  });
}

function stop(): void {
  if (!server) return;
  server.kill('SIGTERM');
  const timer = setTimeout(() => server?.kill('SIGKILL'), 3000);
  server.on('exit', () => clearTimeout(timer));
}

function quit(): void {
  if (server) {
    server.kill('SIGTERM');
    const timer = setTimeout(() => {
      server?.kill('SIGKILL');
      process.exit(0);
    }, 1500);
    server.on('exit', () => {
      clearTimeout(timer);
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

// ── Drawing ─────────────────────────────────────────────────────────────────

function draw(): void {
  const icon = ready ? `${G}●${R}` : server ? `${Y}○${R}` : `${D}○${R}`;
  const status = ready
    ? `${G}Running${R} on :${port}`
    : server
      ? `${Y}Starting…${R}`
      : `${D}Stopped${R}`;
  const url = ready ? `${C}http://localhost:${port}${R}` : `${D}—${R}`;
  const on = !!server;

  process.stdout.write(`${CLR}
  ${B}╔══════════════════════════════════════════════╗${R}
  ${B}║${R}    ${C}${B}ATC${R} ${D}— Agent Task Coordinator${R}            ${B}║${R}
  ${B}╚══════════════════════════════════════════════╝${R}

  ${D}Status${R}     ${icon} ${status}
  ${D}Dashboard${R}  ${url}
  ${D}Port${R}       ${port}

  ${D}──────────────────────────────────────────────${R}
  ${on ? D : B}[1]${R} ${on ? D : ''}Start Server${R}   ${on ? B : D}[2]${R} ${on ? '' : D}Stop Server${R}
  ${on ? D : B}[3]${R} ${on ? D : ''}Port Settings${R}  ${B}[4]${R} Quit
  ${D}──────────────────────────────────────────────${R}

  ${D}>${R} `);
}

function flash(msg: string): void {
  draw();
  process.stdout.write(`\x1b[1A  ${Y}${msg}${R}\n\n  ${D}>${R} `);
}
