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
      'Review this code for unnecessary complexity. Identify functions or blocks that are ' +
        'over-engineered, harder to read than necessary, or where a much simpler approach exists. ' +
        'Be specific: include the line numbers of the problematic sections. ' +
        'Do not report trivial style issues or missing edge cases \u2014 focus only on structural complexity ' +
        'that makes the code harder to understand or maintain.'
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
