import { build } from 'esbuild';
import { cpSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const cliDist = resolve(root, 'packages', 'cli', 'dist');
const dbDest = resolve(root, 'packages', 'cli', 'databases');

// Bundle CLI + core + all deps into a single file
await build({
  entryPoints: [resolve(root, 'packages', 'cli', 'src', 'cli.ts')],
  outfile: resolve(cliDist, 'cli.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: [], // bundle everything
  banner: {
    js: '#!/usr/bin/env node',
  },
  resolveExtensions: ['.ts', '.js', '.json'],
});

// Also build the non-CLI entry points (index, reports) without bundling
await build({
  entryPoints: [
    resolve(root, 'packages', 'cli', 'src', 'index.ts'),
    resolve(root, 'packages', 'cli', 'src', 'report', 'terminalReport.ts'),
    resolve(root, 'packages', 'cli', 'src', 'report', 'htmlReport.ts'),
  ],
  outdir: cliDist,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outbase: resolve(root, 'packages', 'cli', 'src'),
});

// Copy databases
if (existsSync(dbDest)) rmSync(dbDest, { recursive: true });
mkdirSync(dbDest, { recursive: true });
cpSync(resolve(root, 'databases'), dbDest, { recursive: true });

console.log('CLI bundle built at packages/cli/dist/cli.js');
