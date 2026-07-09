import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkHallucinatedPackages, clearMemoryCache } from '../hallucinatedPackages';
import type { RegistryChecker } from '../hallucinatedPackages';

beforeEach(() => {
  clearMemoryCache();
});

describe('checkHallucinatedPackages', () => {
  it('passes for a real package (react)', async () => {
    const mockChecker: RegistryChecker = vi.fn().mockResolvedValue({ exists: true });
    const content = `import React from 'react';\n`;
    const findings = await checkHallucinatedPackages(content, 'test.tsx', 'typescript', mockChecker);
    expect(findings).toEqual([]);
  });

  it('flags a non-existent package (mocked 404)', async () => {
    const mockChecker: RegistryChecker = vi.fn().mockResolvedValue({ exists: false });
    const content = `import xyz from 'totally-fake-ai-invented-package-xyz';\n`;
    const findings = await checkHallucinatedPackages(content, 'test.ts', 'typescript', mockChecker);
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('HALLUCINATED_PACKAGE');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].line).toBe(1);
    expect(findings[0].file).toBe('test.ts');
  });

  it('skips Node.js built-in modules (fs)', async () => {
    const mockChecker: RegistryChecker = vi.fn().mockResolvedValue({ exists: true });
    const content = `const fs = require('fs');\n`;
    const findings = await checkHallucinatedPackages(content, 'test.ts', 'typescript', mockChecker);
    expect(findings).toEqual([]);
    expect(mockChecker).not.toHaveBeenCalled();
  });

  it('skips relative imports', async () => {
    const mockChecker: RegistryChecker = vi.fn().mockResolvedValue({ exists: true });
    const content = `import { utils } from './utils';\n`;
    const findings = await checkHallucinatedPackages(content, 'test.ts', 'typescript', mockChecker);
    expect(findings).toEqual([]);
    expect(mockChecker).not.toHaveBeenCalled();
  });

  it('handles network timeout gracefully (no crash)', async () => {
    const mockChecker: RegistryChecker = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const content = `import x from 'some-package';\n`;
    const findings = await checkHallucinatedPackages(content, 'test.ts', 'typescript', mockChecker);
    expect(findings).toEqual([]);
  });

  it('caches registry responses in memory', async () => {
    const mockChecker: RegistryChecker = vi.fn().mockResolvedValue({ exists: false });
    const content = `import a from 'fake-pkg';\nimport b from 'fake-pkg';\n`;
    const findings = await checkHallucinatedPackages(content, 'test.ts', 'typescript', mockChecker);
    expect(findings).toHaveLength(2);
    expect(mockChecker).toHaveBeenCalledTimes(1);
  });

  it('extracts scoped npm packages correctly', async () => {
    const mockChecker: RegistryChecker = vi.fn().mockResolvedValue({ exists: true });
    const content = `import { thing } from '@scope/some-package';\n`;
    const findings = await checkHallucinatedPackages(content, 'test.ts', 'typescript', mockChecker);
    expect(findings).toEqual([]);
    expect(mockChecker).toHaveBeenCalledWith('@scope/some-package');
  });

  it('handles require statements', async () => {
    const mockChecker: RegistryChecker = vi.fn().mockResolvedValue({ exists: false });
    const content = `const x = require('fake-require-pkg');\n`;
    const findings = await checkHallucinatedPackages(content, 'test.ts', 'typescript', mockChecker);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(1);
  });

  it('handles Python imports', async () => {
    const mockChecker: RegistryChecker = vi.fn().mockResolvedValue({ exists: false });
    const content = `import fake_python_pkg\nfrom another_fake import something\n`;
    const findings = await checkHallucinatedPackages(content, 'test.py', 'python', mockChecker);
    expect(findings).toHaveLength(2);
  });

  it('returns empty for unknown language', async () => {
    const mockChecker: RegistryChecker = vi.fn();
    const content = `import x from 'pkg';\n`;
    const findings = await checkHallucinatedPackages(content, 'test.txt', 'unknown', mockChecker);
    expect(findings).toEqual([]);
    expect(mockChecker).not.toHaveBeenCalled();
  });
});
