import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { runReview } from '../runReview';
import { reviewFileWithAI } from '../../ai/batchCaller';
import { checkHallucinatedPackages, clearMemoryCache } from '../../rules/hallucinatedPackages';
import type { RegistryChecker } from '../../rules/hallucinatedPackages';
import type { ReviewConfig } from '../../types';

vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  const MockAnthropic = vi.fn(() => ({
    messages: { create: mockCreate },
  }));
  return { default: MockAnthropic, Anthropic: MockAnthropic };
});

interface FixtureExpectation {
  total: number;
  static: { total: number; ruleIds: string[] };
  ai: { total: number; ruleIds: string[] };
}

const corpusDir = path.resolve(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'corpus');
const expectedResults: Record<string, FixtureExpectation> = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'expected-results.json'), 'utf-8'),
);

function loadFixtureConfig(fixtureDir: string): ReviewConfig {
  const configPath = path.join(fixtureDir, 'aireview.config.json');
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

describe('corpus integration tests', () => {
  const fixtures = Object.keys(expectedResults);

  for (const fixtureName of fixtures) {
    const expectation = expectedResults[fixtureName];
    const fixtureDir = path.join(corpusDir, fixtureName);

    it(`${fixtureName}: static findings match expected-results.json`, async () => {
      if (fixtureName === 'hallucinated-packages') { return; }
      const config: ReviewConfig = {
        ...loadFixtureConfig(fixtureDir),
        checks: {
          ...(loadFixtureConfig(fixtureDir).checks || {}),
          hallucinatedPackages: false,
        },
      };
      const result = await runReview(fixtureDir, config);
      const allRuleIds = result.files.flatMap((f) => f.findings.map((f2) => f2.id));
      expect(allRuleIds.length).toBe(expectation.static.total);
      if (expectation.static.total > 0) {
        expect(allRuleIds.sort()).toEqual([...expectation.static.ruleIds].sort());
      }
    });

    if (fixtureName === 'hallucinated-packages') {
      it(`${fixtureName}: hallucinated packages detection with mocked registry`, async () => {
        clearMemoryCache();
        const tsFiles = fs.readdirSync(fixtureDir).filter((f) => f.endsWith('.ts'));
        const content = fs.readFileSync(path.join(fixtureDir, tsFiles[0]), 'utf-8');
        const mockChecker: RegistryChecker = vi.fn().mockImplementation(async (pkg: string) => {
          if (pkg === 'ai-helper-utils-pro') return { exists: false };
          return { exists: true };
        });
        const findings = await checkHallucinatedPackages(content, tsFiles[0], 'typescript', mockChecker);
        const ruleIds = findings.map((f) => f.id);
        expect(ruleIds.length).toBe(expectation.total);
        expect(ruleIds.sort()).toEqual([...expectation.static.ruleIds].sort());
      });
    }

    if (fixtureName === 'complex-code' || fixtureName === 'convention-violations') {
      it(`${fixtureName}: AI findings with mocked Anthropic`, async () => {
        const tsFiles = fs.readdirSync(fixtureDir).filter((f) => f.endsWith('.ts'));
        const content = fs.readFileSync(path.join(fixtureDir, tsFiles[0]), 'utf-8');

        const { default: MockAnthropic } = await import('@anthropic-ai/sdk');
        const mockClient = new (MockAnthropic as any)();

        const mockFindings: any[] = fixtureName === 'complex-code'
          ? [{
              check: 'complexity', line: 1, endLine: 12,
              title: 'Manual loop reimplements Array.reduce()',
              message: 'This manual while loop with accumulator replicates built-in Array.reduce().',
              suggestion: 'Replace with items.reduce(fn, initial).',
            }]
          : [
              {
                check: 'convention', line: 1, endLine: 6,
                title: 'Use async/await instead of .then()',
                message: 'This .then() chain should use async/await.',
                suggestion: 'Convert to async function with await.',
              },
              {
                check: 'convention', line: 8, endLine: 8,
                title: 'Use const instead of var',
                message: 'var declaration should be replaced with const or let.',
                suggestion: 'Use const counter = 0.',
              },
              {
                check: 'convention', line: 10, endLine: 13,
                title: 'Add explicit return type annotation',
                message: 'Function increment() lacks explicit return type.',
                suggestion: 'Add return type: function increment(): number.',
              },
            ];

        mockClient.messages.create.mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ findings: mockFindings }) }],
          usage: { input_tokens: 100, output_tokens: 50 },
        });

        const config: ReviewConfig = {
          anthropicApiKey: 'sk-test-key',
          ...loadFixtureConfig(fixtureDir),
        };

        const result = await reviewFileWithAI({
          file: tsFiles[0],
          language: 'typescript',
          content,
          config,
          enabledChecks: {
            complexity: fixtureName === 'complex-code',
            conventions: fixtureName === 'convention-violations',
          },
        });

        const ruleIds = result.findings.map((f) => f.id);
        expect(ruleIds.length).toBe(expectation.ai.total);
        expect(new Set(ruleIds)).toEqual(new Set(expectation.ai.ruleIds));
      });
    }
  }
});
