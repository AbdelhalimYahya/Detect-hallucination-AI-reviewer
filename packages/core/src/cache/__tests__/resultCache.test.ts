import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ResultCache } from '../resultCache';
import type { FileReview } from '../../types';

let tmpDir: string;
let cache: ResultCache;

const sampleReview: FileReview = {
  file: 'src/test.ts',
  language: 'typescript',
  findings: [
    {
      id: 'SEC_EVAL',
      category: 'security',
      severity: 'error',
      title: 'Test finding',
      message: 'A test finding',
      suggestion: 'Fix it',
      file: 'src/test.ts',
      line: 1,
      column: 1,
      source: 'static',
    },
  ],
  tokensUsed: 0,
};

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-review-cache-test-'));
  cache = new ResultCache(tmpDir);
});

describe('ResultCache', () => {
  it('stores and retrieves a result by same content', async () => {
    const content = 'const x = 1;';
    await cache.set(content, sampleReview);
    const result = await cache.get(content);
    expect(result).not.toBeNull();
    expect(result!.file).toBe('src/test.ts');
    expect(result!.findings).toHaveLength(1);
    expect(result!.findings[0].id).toBe('SEC_EVAL');
  });

  it('returns null for different content', async () => {
    await cache.set('content-a', sampleReview);
    const result = await cache.get('content-b');
    expect(result).toBeNull();
  });

  it('returns null for a stale (31-day-old) entry', async () => {
    const content = 'stale-content';
    const h = 'stale-content'; // not actually the hash, we write directly

    // Write a cache entry with a cachedAt of 31 days ago
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(content, 'utf-8').digest('hex');
    const entry = JSON.stringify({ cachedAt: oldDate, result: sampleReview });
    writeFileSync(join(tmpDir, `${hash}.json`), entry, 'utf-8');

    const result = await cache.get(content);
    expect(result).toBeNull();
  });

  it('stats() returns correct entry count and size', async () => {
    await cache.set('abc', sampleReview);
    await cache.set('def', {
      ...sampleReview,
      file: 'src/other.ts',
      findings: [],
    });

    const s = await cache.stats();
    expect(s.entries).toBe(2);
    expect(s.sizeKb).toBeGreaterThanOrEqual(0);
  });

  it('clear() removes all entries', async () => {
    await cache.set('abc', sampleReview);
    expect((await cache.stats()).entries).toBe(1);

    await cache.clear();
    expect((await cache.stats()).entries).toBe(0);
  });

  it('handles missing cache directory gracefully', async () => {
    const result = await cache.get('some-content');
    expect(result).toBeNull();
  });

  it('returns null for corrupted cache file', async () => {
    const content = 'corrupt-content';
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(content, 'utf-8').digest('hex');
    writeFileSync(join(tmpDir, `${hash}.json`), 'not-valid-json', 'utf-8');

    const result = await cache.get(content);
    expect(result).toBeNull();
  });

  it('set() creates the cache directory automatically', async () => {
    const deepDir = join(tmpDir, 'nested', 'deep', 'dir');
    const deepCache = new ResultCache(deepDir);
    await deepCache.set('test', sampleReview);
    const result = await deepCache.get('test');
    expect(result).not.toBeNull();
  });
});
