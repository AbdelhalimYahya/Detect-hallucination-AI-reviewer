import { runReview } from '../packages/core/src/scanner/runReview';
import { printTerminalReport } from '../packages/cli/src/report/terminalReport';

async function main() {
  console.log('=== AI Reviewer full project scan ===\n');
  const result = await runReview('.', {
    ignorePatterns: ['node_modules', 'dist', '.git', 'coverage', 'fixtures', 'scripts', 'databases', 'Docs'],
  });
  printTerminalReport(result);
}
main();
