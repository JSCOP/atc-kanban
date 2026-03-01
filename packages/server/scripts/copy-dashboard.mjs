/**
 * Copy dashboard build output into server dist/public/ for npm packaging.
 * This allows the published npm package to serve the dashboard SPA
 * without requiring a separate dashboard build step.
 *
 * Usage: node scripts/copy-dashboard.mjs
 */

import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardDist = resolve(__dirname, '../../dashboard/dist');
const serverPublic = resolve(__dirname, '../dist/public');

// Verify dashboard build exists
if (!existsSync(dashboardDist)) {
  console.error('[copy-dashboard] ERROR: Dashboard build not found at', dashboardDist);
  console.error('[copy-dashboard] Run "pnpm -F @atc/dashboard build" first.');
  process.exit(1);
}

// Verify server dist exists
if (!existsSync(resolve(__dirname, '../dist'))) {
  console.error(
    '[copy-dashboard] ERROR: Server dist not found. Run "pnpm -F @atc/server build" first.',
  );
  process.exit(1);
}

// Clean previous copy
if (existsSync(serverPublic)) {
  rmSync(serverPublic, { recursive: true, force: true });
}

// Copy dashboard build into server dist/public/
cpSync(dashboardDist, serverPublic, { recursive: true });

console.log(`[copy-dashboard] Copied dashboard assets to ${serverPublic}`);
