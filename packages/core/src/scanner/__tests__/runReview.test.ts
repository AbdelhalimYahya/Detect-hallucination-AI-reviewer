import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { runReview } from '../runReview';
import type { ReviewConfig } from '../../types';

const fixturesDir = path.resolve(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'test-basic');

describe('runReview', () => {
  it('returns a ReviewResult with correct shape', async () => {
    const config: ReviewConfig = {};
    const result = await runReview(fixturesDir, config);

    expect(result).toHaveProperty('target');
    expect(result).toHaveProperty('scannedAt');
    expect(result).toHaveProperty('filesReviewed');
    expect(result).toHaveProperty('totalFindings');
    expect(result).toHaveProperty('byCategory');
    expect(result).toHaveProperty('bySeverity');
    expect(result).toHaveProperty('files');
    expect(result).toHaveProperty('totalTokensUsed');
    expect(result).toHaveProperty('estimatedCostUsd');

    expect(typeof result.scannedAt).toBe('string');
    expect(new Date(result.scannedAt).toISOString()).toBe(result.scannedAt);
  });

  it('finds both files and reports url.parse findings', async () => {
    const config: ReviewConfig = {};
    const result = await runReview(fixturesDir, config);

    expect(result.filesReviewed).toBe(2);

    const dirtyFile = result.files.find((f) => f.file.endsWith('dirty.ts'));
    expect(dirtyFile).toBeDefined();
    expect(dirtyFile!.findings.length).toBeGreaterThan(0);

    const urlParseFinding = dirtyFile!.findings.find(
      (f) => f.id === 'DEPRECATED_URL_PARSE',
    );
    expect(urlParseFinding).toBeDefined();
    expect(urlParseFinding!.severity).toBe('warning');
    expect(urlParseFinding!.source).toBe('static');
    expect(urlParseFinding!.line).toBe(3);
  });

  it('clean file has no findings', async () => {
    const config: ReviewConfig = {};
    const result = await runReview(fixturesDir, config);

    const cleanFile = result.files.find((f) => f.file.endsWith('clean.ts'));
    expect(cleanFile).toBeDefined();
    expect(cleanFile!.findings).toHaveLength(0);
  });

  it('computes byCategory and bySeverity correctly', async () => {
    const config: ReviewConfig = {};
    const result = await runReview(fixturesDir, config);

    expect(result.byCategory['deprecated-api']).toBeGreaterThan(0);
    expect(result.totalFindings).toBeGreaterThan(0);
    expect(result.bySeverity.warning).toBeGreaterThan(0);
  });

  it('respects disabled checks', async () => {
    const config: ReviewConfig = {
      checks: { deprecatedApis: false, security: false, hallucinatedPackages: false },
    };
    const result = await runReview(fixturesDir, config);

    expect(result.totalFindings).toBe(0);
    expect(result.byCategory['deprecated-api']).toBe(0);
  });
});
