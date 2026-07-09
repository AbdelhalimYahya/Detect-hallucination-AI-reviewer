import { writeFileSync } from 'fs';
import { runReview } from '../packages/core/src/scanner/runReview';
import { printTerminalReport } from '../packages/cli/src/report/terminalReport';

async function capture(name: string, result: Awaited<ReturnType<typeof runReview>>): Promise<string> {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: string[]) => lines.push(args.join(' '));
  printTerminalReport(result);
  console.log = origLog;
  return lines.join('\n');
}

async function main() {
  // Test 1: Basic findings
  const result1 = await runReview('fixtures/test-basic', {});
  const output1 = await capture('with-findings', result1);
  writeFileSync('evidence-terminal-report-basic.txt', output1, 'utf-8');
  console.log('Saved evidence-terminal-report-basic.txt');

  // Test 2: With security + deprecated + hallucinated using the full project
  const result2 = await runReview('.', {
    ignorePatterns: ['node_modules', 'dist', '.git', 'coverage', 'fixtures', 'scripts', 'databases', 'Docs'],
  });
  const output2 = await capture('project-scan', result2);
  writeFileSync('evidence-terminal-report-project.txt', output2, 'utf-8');
  console.log('Saved evidence-terminal-report-project.txt');

  // Test 3: Zero findings
  const result3 = await runReview('fixtures/test-basic', {
    checks: { deprecatedApis: false, security: false, hallucinatedPackages: false }
  });
  const output3 = await capture('clean', result3);
  writeFileSync('evidence-terminal-report-clean.txt', output3, 'utf-8');
  console.log('Saved evidence-terminal-report-clean.txt');
}
main();
