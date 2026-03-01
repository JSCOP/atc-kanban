import { defineConfig } from 'tsup';

export default defineConfig([
  // CLI entry — gets shebang + CJS shim
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: true,
    target: 'node20',
    external: ['better-sqlite3'],
    noExternal: ['@atc/core'],
    banner: {
      js: "#!/usr/bin/env node\nimport { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
  },
  // Server entry — CJS shim only (no shebang, spawned by cli)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    target: 'node20',
    external: ['better-sqlite3'],
    noExternal: ['@atc/core'],
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
  },
]);
