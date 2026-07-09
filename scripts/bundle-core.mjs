import { cpSync, existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const cliDist = resolve(root, 'packages', 'cli', 'dist');
const cliSrc = resolve(root, 'packages', 'cli', 'src');

// Ensure dist dir exists
mkdirSync(cliDist, { recursive: true });

// Bundle everything into a single file with esbuild
await build({
  entryPoints: [resolve(cliSrc, 'cli.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve(cliDist, 'cli.js'),
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [
    // Node.js built-in modules are auto-external with platform:'node'
  ],
});

// Copy databases
const dbSrc = resolve(root, 'databases');
const dbDest = resolve(cliDist, '..', 'databases');
if (existsSync(dbDest)) rmSync(dbDest, { recursive: true });
if (existsSync(dbSrc)) {
  cpSync(dbSrc, dbDest, { recursive: true });
}

console.log('CLI bundle built at packages/cli/dist/cli.js');
