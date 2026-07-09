import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { writeHtmlReport } from '../report/htmlReport';
import { runReview } from '@ai-review/core';

describe('writeHtmlReport', () => {
  it('creates an HTML file with expected findings', async () => {
    const fixturesDir = path.resolve(__dirname, '..', '..', '..', '..', 'fixtures', 'test-basic');
    const result = await runReview(fixturesDir, {});

    const outPath = path.join(tmpdir(), `ai-review-test-${Date.now()}.html`);
    writeHtmlReport(result, outPath);

    expect(fs.existsSync(outPath)).toBe(true);

    const html = fs.readFileSync(outPath, 'utf-8');
    expect(html.length).toBeGreaterThan(100);

    expect(html).toContain('DEPRECATED_URL_PARSE');
    expect(html).toContain('DEPRECATED_URL_RESOLVE');
    expect(html).toContain('dirty.ts');
    expect(html).toContain('test-basic');
    expect(html).toContain('ai-review');
    expect(html).toContain('<!DOCTYPE html>');

    fs.unlinkSync(outPath);
  });

  it('handles zero findings gracefully', async () => {
    const fixturesDir = path.resolve(__dirname, '..', '..', '..', '..', 'fixtures', 'test-basic');
    const result = await runReview(fixturesDir, {
      checks: { deprecatedApis: false, security: false, hallucinatedPackages: false },
    });

    const outPath = path.join(tmpdir(), `ai-review-clean-${Date.now()}.html`);
    writeHtmlReport(result, outPath);

    const html = fs.readFileSync(outPath, 'utf-8');
    expect(html).toContain('No issues found');
    expect(html).not.toMatch(/<div class="finding-card">/);

    fs.unlinkSync(outPath);
  });
});
