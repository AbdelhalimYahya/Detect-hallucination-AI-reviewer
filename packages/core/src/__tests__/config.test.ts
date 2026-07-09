import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, generateDefaultConfig } from '../config';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ai-review-test-'));
  });

  afterEach(() => {
    const rf = (dir: string) => {
      try {
        const entries = require('node:fs').readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = join(dir, e.name);
          if (e.isDirectory()) rf(full);
          else require('node:fs').unlinkSync(full);
        }
        require('node:fs').rmdirSync(dir);
      } catch {}
    };
    rf(tmpDir);
  });

  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig(tmpDir);
    expect(config.model).toBe('claude-haiku-4-5');
    expect(config.checks).toBeDefined();
    expect(config.conventions).toBeUndefined();
    expect(config.anthropicApiKey).toBeUndefined();
  });

  it('correctly merges a valid config file', async () => {
    writeFileSync(
      join(tmpDir, 'aireview.config.json'),
      JSON.stringify({ model: 'claude-sonnet-4', conventions: ['Use const'] }),
    );
    const config = await loadConfig(tmpDir);
    expect(config.model).toBe('claude-sonnet-4');
    expect(config.conventions).toEqual(['Use const']);
    expect(config.checks?.deprecatedApis).toBe(true);
  });

  it('throws a clear error for a malformed config file', async () => {
    writeFileSync(join(tmpDir, 'aireview.config.json'), JSON.stringify({ model: 123 }));
    await expect(loadConfig(tmpDir)).rejects.toThrow('aireview.config.json has invalid fields');
  });

  it('env var ANTHROPIC_API_KEY overrides config file value', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-override';
    writeFileSync(
      join(tmpDir, 'aireview.config.json'),
      JSON.stringify({ anthropicApiKey: 'sk-file-value' }),
    );
    const config = await loadConfig(tmpDir);
    expect(config.anthropicApiKey).toBe('sk-env-override');
    delete process.env.ANTHROPIC_API_KEY;
  });
});

describe('generateDefaultConfig', () => {
  it('writes a starter config file', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ai-review-gen-'));
    const outPath = join(tmpDir, 'aireview.config.json');
    await generateDefaultConfig(outPath);
    const { readFileSync } = require('node:fs');
    const content = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(content.model).toBe('claude-haiku-4-5');
    expect(content.checks).toBeDefined();
  });
});
