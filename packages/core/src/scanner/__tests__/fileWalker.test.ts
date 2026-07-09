import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { walkFiles } from '../fileWalker';
import type { ReviewConfig } from '../../types';

function setupTempDir(structure: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'ai-review-test-'));
  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(root, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
  return root;
}

function makeLargeFile(sizeBytes: number): string {
  return 'x'.repeat(sizeBytes);
}

describe('walkFiles', () => {
  it('finds .ts and .tsx files and detects language', async () => {
    const dir = setupTempDir({
      'src/index.ts': 'const x = 1;',
      'src/App.tsx': 'const App = () => null;',
      'util.js': 'const y = 2;',
      'README.md': '# hello',
    });

    const config: ReviewConfig = {};
    const files = await walkFiles(dir, config);

    expect(files).toHaveLength(3);
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'src/index.ts', language: 'typescript' }),
        expect.objectContaining({ file: 'src/App.tsx', language: 'typescript' }),
        expect.objectContaining({ file: 'util.js', language: 'javascript' }),
      ]),
    );
  });

  it('excludes node_modules directory', async () => {
    const dir = setupTempDir({
      'src/index.ts': 'const x = 1;',
      'node_modules/pkg/index.ts': 'export const y = 2;',
      'node_modules/pkg/util.js': 'const z = 3;',
    });

    const config: ReviewConfig = {};
    const files = await walkFiles(dir, config);

    expect(files).toHaveLength(1);
    expect(files[0].file).toBe('src/index.ts');
  });

  it('excludes known skip directories', async () => {
    const dir = setupTempDir({
      'src/index.ts': 'const x = 1;',
      '.git/config': '',
      'dist/bundle.js': 'big bundle',
      'build/output.js': 'output',
      '.next/build.js': 'next',
      '__pycache__/cache.py': 'cache',
      'venv/lib.py': 'lib',
      '.venv/lib.py': 'lib2',
      'coverage/lcov.py': 'lcov',
      '.nyc_output/out.js': 'out',
    });

    const config: ReviewConfig = {};
    const files = await walkFiles(dir, config);

    expect(files).toHaveLength(1);
    expect(files[0].file).toBe('src/index.ts');
  });

  it('skips files over 500KB', async () => {
    const dir = setupTempDir({
      'small.ts': 'const x = 1;',
      'big.ts': makeLargeFile(600 * 1024),
    });

    const config: ReviewConfig = {};
    const files = await walkFiles(dir, config);

    expect(files).toHaveLength(1);
    expect(files[0].file).toBe('small.ts');
  });

  it('filters by language', async () => {
    const dir = setupTempDir({
      'a.ts': 'const x = 1;',
      'b.js': 'const y = 2;',
      'c.py': 'z = 3',
    });

    const config: ReviewConfig = { languages: ['typescript'] };
    const files = await walkFiles(dir, config);

    expect(files).toHaveLength(1);
    expect(files[0].file).toBe('a.ts');
  });

  it('filters by ignorePatterns', async () => {
    const dir = setupTempDir({
      'src/index.ts': 'const x = 1;',
      'src/generated.ts': '// auto-gen',
      'test/fixtures/test.ts': 'test',
    });

    const config: ReviewConfig = {
      ignorePatterns: ['**/generated.ts', 'test/**'],
    };
    const files = await walkFiles(dir, config);

    expect(files).toHaveLength(1);
    expect(files[0].file).toBe('src/index.ts');
  });

  it('returns empty array when no matching files exist', async () => {
    const dir = setupTempDir({
      'README.md': '# hello',
      'data.json': '{}',
    });

    const config: ReviewConfig = {};
    const files = await walkFiles(dir, config);

    expect(files).toEqual([]);
  });

  it('handles non-existent root directory', async () => {
    const config: ReviewConfig = {};
    const files = await walkFiles('C:\\non-existent-dir-12345', config);
    expect(files).toEqual([]);
  });
});
