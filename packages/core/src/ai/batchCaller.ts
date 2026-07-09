/**
 * Prompt engineering history (Task 2.3):
 *
 * Initial prompt was a generic "find unnecessary complexity" instruction.
 * Iteration 1 changes:
 *   - Added specific complexity categories (manual iteration,
 *     nested conditionals, sequential independent ops, unnecessary
 *     abstraction layers) to guide the model toward actionable findings
 *   - Added explicit "DO NOT flag" guidance for well-structured code
 *     to reduce false positives on appropriately complex functions
 *   - Changed from "Do not report trivial style issues" to a more
 *     specific list of what to skip, reducing noise
 *   - Added instruction to differentiate between genuine complexity
 *     and appropriate abstraction
 *
 * Test patterns used (fixtures/prompt-patterns/):
 *   pattern1-reduce.ts     - manual forEach/reduce reimplementation
 *   pattern2-ternary.ts    - deeply nested ternary for lookup
 *   pattern3-sequential-awaits.ts - independent sequential awaits
 *   pattern4-over-abstracted.ts   - unnecessary abstraction layers
 *   pattern5-clean.ts      - well-structured code (should yield 0)
 *
 * Expected responses per pattern:
 *   1. Suggest using Array.reduce() / map() / filter()
 *   2. Suggest a lookup Map or object
 *   3. Suggest Promise.all()
 *   4. Flag unnecessary abstraction layers
 *   5. Zero findings or only info-level notes
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Finding, Language, ReviewConfig } from '../types';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';

interface AiFinding {
  check: 'complexity' | 'convention';
  line: number;
  endLine: number;
  title: string;
  message: string;
  suggestion: string;
}

interface AiResponse {
  findings: AiFinding[];
}

export async function reviewFileWithAI(params: {
  file: string;
  language: Language;
  content: string;
  config: ReviewConfig;
  enabledChecks: {
    complexity: boolean;
    conventions: boolean;
  };
}): Promise<{ findings: Finding[]; tokensUsed: number }> {
  const apiKey = params.config.anthropicApiKey;
  if (!apiKey) {
    return { findings: [], tokensUsed: 0 };
  }

  const systemPrompt =
    'You are a senior software engineer reviewing code that was likely generated ' +
    'by an AI assistant. Your job is to identify specific, actionable issues in ' +
    'the code. You must respond ONLY with a valid JSON object \u2014 no preamble, no ' +
    'markdown, no explanation outside the JSON.';

  const userParts: string[] = [];
  userParts.push('Here is the file to review:\n');
  userParts.push('```' + params.language + '\n' + params.content + '\n```\n');

  if (params.enabledChecks.complexity) {
    userParts.push(
      'Review this code for unnecessary structural complexity. Check for these specific patterns:\n' +
      '- Manual iteration that could be replaced by a built-in array method (reduce, map, filter, flat, etc.)\n' +
      '- Deeply nested conditionals (ternaries or if/else beyond 2 levels) that could be a lookup table or early returns\n' +
      '- Sequential independent async calls that could run in parallel with Promise.all()\n' +
      '- Unnecessary abstraction layers (a function that just delegates to another function with no added logic)\n' +
      '\n' +
      'For each issue found, include the specific line numbers and give a concrete code suggestion.\n' +
      'Do NOT flag: style preferences (naming, formatting), missing edge cases, lack of comments, ' +
      'or appropriately abstracted code that serves a real purpose.\n' +
      'If the code is well-structured with no genuine complexity issues, return an empty findings array.'
    );
  }

  if (params.enabledChecks.conventions && params.config.conventions && params.config.conventions.length > 0) {
    userParts.push('\nReview this code against the following team conventions:');
    for (const c of params.config.conventions) {
      userParts.push('- ' + c);
    }
    userParts.push(
      '\nFor each violation, include the specific line number and explain which convention is violated.'
    );
  }

  if (!params.enabledChecks.complexity && !(params.enabledChecks.conventions && params.config.conventions?.length)) {
    return { findings: [], tokensUsed: 0 };
  }

  userParts.push(
    '\nRespond with ONLY a JSON object in this exact format (no other text):\n' +
      '{\n' +
      '  "findings": [\n' +
      '    {\n' +
      '      "check": "complexity",\n' +
      '      "line": 42,\n' +
      '      "endLine": 55,\n' +
      '      "title": "Short title of the issue",\n' +
      '      "message": "Plain English explanation of the problem",\n' +
      '      "suggestion": "Concrete suggestion for fixing it"\n' +
      '    }\n' +
      '  ]\n' +
      '}'
  );

  const model = params.config.model || 'claude-haiku-4-5';

  try {
    const anthropic = new Anthropic({ apiKey });

    const messages: MessageParam[] = [
      {
        role: 'user',
        content: userParts.join('\n'),
      },
    ];

    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const textContent = response.content.find((b) => b.type === 'text');
    const rawText = textContent && 'text' in textContent ? textContent.text : '';

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const tokensUsed = inputTokens + outputTokens;

    const parsed = parseAiResponse(rawText, params.file);
    return { findings: parsed, tokensUsed };
  } catch (err) {
    return { findings: [], tokensUsed: 0 };
  }
}

function parseAiResponse(raw: string, file: string): Finding[] {
  if (!raw) return [];

  let json: AiResponse;
  try {
    json = JSON.parse(raw) as AiResponse;
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        json = JSON.parse(jsonMatch[0]) as AiResponse;
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  if (!Array.isArray(json.findings)) return [];

  return json.findings
    .filter((f) => f.check && f.title && f.line)
    .map((f) => ({
      id: f.check === 'complexity' ? 'AI_COMPLEXITY' : 'AI_CONVENTION',
      category: (f.check === 'complexity' ? 'complexity' : 'convention') as 'complexity' | 'convention',
      severity: 'info' as const,
      title: f.title,
      message: f.message || f.title,
      suggestion: f.suggestion || '',
      file,
      line: f.line,
      column: 1,
      endLine: f.endLine || f.line,
      endColumn: undefined,
      source: 'ai' as const,
    }));
}
