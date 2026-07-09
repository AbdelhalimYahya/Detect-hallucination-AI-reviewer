import { runReview } from '../packages/core/src/scanner/runReview';
import { printTerminalReport } from '../packages/cli/src/report/terminalReport';

async function main() {
  console.log('=== Test 1: fixtures/test-basic (has findings) ===\n');
  const result1 = await runReview('fixtures/test-basic', {});
  printTerminalReport(result1);

  console.log('\n\n=== Test 2: empty fixture (zero findings) ===\n');
  const result2 = await runReview('fixtures/test-basic', {
    checks: { deprecatedApis: false, security: false, hallucinatedPackages: false }
  });
  printTerminalReport(result2);
}
main();
