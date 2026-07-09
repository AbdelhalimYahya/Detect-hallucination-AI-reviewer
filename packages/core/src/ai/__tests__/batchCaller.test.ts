import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reviewFileWithAI } from '../batchCaller';
import type { ReviewConfig } from '../../types';

vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  const MockAnthropic = vi.fn(() => ({
    messages: { create: mockCreate },
  }));
  return { default: MockAnthropic, Anthropic: MockAnthropic };
});

const baseConfig: ReviewConfig = {
  anthropicApiKey: 'sk-test-key',
  model: 'claude-haiku-4-5',
};

async function call(params?: Partial<Parameters<typeof reviewFileWithAI>[0]>) {
  return reviewFileWithAI({
    file: 'test.ts',
    language: 'typescript',
    content: 'const x: number = 1;\nconsole.log(x);\n',
    config: baseConfig,
    enabledChecks: { complexity: true, conventions: false },
    ...params,
  });
}

const { default: MockAnthropic } = await import('@anthropic-ai/sdk');
const mockClient = new (MockAnthropic as any)();

beforeEach(() => {
  vi.clearAllMocks();
});

function makeResponse(text: string, inputTokens = 50, outputTokens = 30) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

describe('reviewFileWithAI', () => {
  it('returns findings on happy path with complexity finding', async () => {
    const aiResponse = {
      findings: [
        {
          check: 'complexity',
          line: 1,
          endLine: 3,
          title: 'Unnecessary complexity',
          message: 'The code is more complex than needed.',
          suggestion: 'Simplify by removing the type annotation.',
        },
      ],
    };

    mockClient.messages.create.mockResolvedValue(makeResponse(JSON.stringify(aiResponse), 60, 40));

    const result = await call();
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].id).toBe('AI_COMPLEXITY');
    expect(result.findings[0].category).toBe('complexity');
    expect(result.findings[0].source).toBe('ai');
    expect(result.tokensUsed).toBe(100);
  });

  it('returns empty findings when malformed JSON is returned', async () => {
    mockClient.messages.create.mockResolvedValue(makeResponse('not valid json at all {{{', 50, 20));

    const result = await call();
    expect(result.findings).toEqual([]);
    expect(result.tokensUsed).toBe(70);
  });

  it('returns empty findings on API error / network failure', async () => {
    mockClient.messages.create.mockRejectedValue(new Error('Network error'));

    const result = await call();
    expect(result.findings).toEqual([]);
    expect(result.tokensUsed).toBe(0);
  });

  it('returns empty findings when no API key is configured', async () => {
    const result = await reviewFileWithAI({
      file: 'test.ts',
      language: 'typescript',
      content: 'const x = 1;',
      config: {},
      enabledChecks: { complexity: true, conventions: false },
    });
    expect(result.findings).toEqual([]);
    expect(result.tokensUsed).toBe(0);
  });

  it('returns empty findings when no checks are enabled', async () => {
    const result = await call({ enabledChecks: { complexity: false, conventions: false } });
    expect(result.findings).toEqual([]);
    expect(result.tokensUsed).toBe(0);
  });

  it('includes specific complexity patterns in the prompt', async () => {
    mockClient.messages.create.mockResolvedValue(makeResponse(JSON.stringify({ findings: [] }), 10, 5));

    await call();

    const callArgs = mockClient.messages.create.mock.calls[0][0];
    const systemMsg = callArgs.system;
    const userMsg = callArgs.messages[0].content;

    expect(systemMsg).toContain('senior software engineer');
    expect(systemMsg).toContain('JSON object');

    expect(userMsg).toContain('Manual iteration');
    expect(userMsg).toContain('Deeply nested conditionals');
    expect(userMsg).toContain('Sequential independent async');
    expect(userMsg).toContain('Unnecessary abstraction');
    expect(userMsg).toContain('Promise.all');
    expect(userMsg).toContain('empty findings array');
  });

  it('does not include complexity instructions when complexity check is disabled', async () => {
    mockClient.messages.create.mockResolvedValue(makeResponse(JSON.stringify({ findings: [] }), 10, 5));

    await call({ enabledChecks: { complexity: false, conventions: false } });

    expect(mockClient.messages.create).not.toHaveBeenCalled();
  });

  it('includes convention instructions when conventions check is enabled with conventions list', async () => {
    mockClient.messages.create.mockResolvedValue(makeResponse(JSON.stringify({ findings: [] }), 10, 5));

    await call({
      enabledChecks: { complexity: false, conventions: true },
      config: {
        ...baseConfig,
        conventions: ['Always use async/await', 'No console.log'],
      },
    });

    const callArgs = mockClient.messages.create.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content;
    expect(userMsg).toContain('Always use async/await');
    expect(userMsg).toContain('No console.log');
  });
});
