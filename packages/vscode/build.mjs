import * as esbuild from 'esbuild';
import { cp, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const mode = process.argv.includes('--stage') ? 'stage' : process.argv.includes('--package') ? 'package' : 'build';
  await build();
  if (mode === 'stage' || mode === 'package') {
    const stagingDir = await stage();
    if (mode === 'package') {
      pkg(stagingDir);
    }
  }
}

async function build() {
  await esbuild.build({
    entryPoints: [
      resolve(__dirname, 'src', 'extension.ts'),
      resolve(__dirname, 'src', 'server.ts'),
    ],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outdir: resolve(__dirname, 'dist'),
    external: ['vscode'],
    sourcemap: true,
    tsconfig: resolve(__dirname, 'tsconfig.json'),
  });

  const databasesDir = resolve(__dirname, '..', '..', 'databases');
  const destDir = resolve(__dirname, 'databases');
  if (existsSync(databasesDir)) {
    await cp(databasesDir, destDir, { recursive: true, force: true });
  }
}

async function stage() {
  const rootDir = await mkdtemp(resolve(tmpdir(), 'ai-review-vsix-'));

  const items = [
    ['dist', true],
    ['databases', true],
    ['icon.png', false],
    ['README.md', false],
  ];
  for (const [item, isDir] of items) {
    const src = resolve(__dirname, item);
    const dst = resolve(rootDir, item);
    if (existsSync(src)) {
      if (isDir) {
        await cp(src, dst, { recursive: true, force: true });
      } else {
        await cp(src, dst, { force: true });
      }
    }
  }

  // Remove unnecessary build artifacts from dist
  for (const file of ['index.js', 'index.js.map', 'index.d.ts', 'index.d.ts.map']) {
    const f = resolve(rootDir, 'dist', file);
    if (existsSync(f)) { await rm(f); }
  }

  const pkg = JSON.parse(await readFile(resolve(__dirname, 'package.json'), 'utf-8'));
  await writeFile(resolve(rootDir, 'package.json'), JSON.stringify({
    name: pkg.name, displayName: pkg.displayName, version: pkg.version,
    publisher: pkg.publisher, description: pkg.description,
    icon: pkg.icon, repository: pkg.repository, engines: pkg.engines,
    categories: pkg.categories, keywords: pkg.keywords, license: pkg.license || 'MIT',
    activationEvents: pkg.activationEvents, main: pkg.main, contributes: pkg.contributes,
    dependencies: {},
  }, null, 2));

  return rootDir;
}

async function pkg(stagingDir) {
  const { execSync } = await import('node:child_process');
  const outPath = resolve(__dirname, 'dist', 'ai-review.vsix');
  execSync('npx @vscode/vsce package --out ' + JSON.stringify(outPath) + ' --allow-package-secrets github', {
    cwd: stagingDir,
    stdio: 'inherit',
  });
  console.log('\nVSIX created at', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
