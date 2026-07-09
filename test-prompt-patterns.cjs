const { readFileSync } = require('fs');
const { join, resolve } = require('path');
const { reviewFileWithAI } = require('./packages/core/dist/ai/batchCaller');

const patternsDir = resolve('fixtures/prompt-patterns');

const files = [
  { name: 'pattern1-reduce.ts', expected: 'Suggest using Array.reduce()' },
  { name: 'pattern2-ternary.ts', expected: 'Suggest a lookup object/Map' },
  { name: 'pattern3-sequential-awaits.ts', expected: 'Suggest Promise.all()' },
  { name: 'pattern4-over-abstracted.ts', expected: 'Flag unnecessary abstraction layers' },
  { name: 'pattern5-clean.ts', expected: 'Zero or minimal findings' },
];

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: Set ANTHROPIC_API_KEY environment variable');
    process.exit(1);
  }

  for (const f of files) {
    const content = readFileSync(join(patternsDir, f.name), 'utf-8');
    console.log(`\n${'='.repeat(70)}`);
    console.log(`PATTERN: ${f.name}`);
    console.log(`Expected: ${f.expected}`);
    console.log(`${'='.repeat(70)}`);

    const result = await reviewFileWithAI({
      file: f.name,
      language: 'typescript',
      content,
      config: { anthropicApiKey: apiKey, model: 'claude-haiku-4-5' },
      enabledChecks: { complexity: true, conventions: false },
    });

    console.log(`Tokens used: ${result.tokensUsed}`);
    console.log(`Findings: ${result.findings.length}`);

    if (result.findings.length === 0) {
      console.log('  (no findings)');
    } else {
      for (const finding of result.findings) {
        console.log(`  [${finding.severity}] ${finding.id}:${finding.line}-${finding.endLine}`);
        console.log(`  Title: ${finding.title}`);
        console.log(`  Suggestion: ${finding.suggestion}`);
        console.log('');
      }
    }
  }
}

main().catch(console.error);
