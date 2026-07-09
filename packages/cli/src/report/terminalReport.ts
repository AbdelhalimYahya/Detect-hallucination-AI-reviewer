import chalk from 'chalk';
import Table from 'cli-table3';
import type { ReviewResult, Finding, Severity, CheckCategory } from '@ai-review/core';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function severityStyler(sev: Severity): { color: (s: string) => string; bold: (s: string) => string } {
  if (sev === 'error') return { color: chalk.red, bold: chalk.bold.red };
  if (sev === 'warning') return { color: chalk.yellow, bold: chalk.bold.yellow };
  return { color: chalk.blue, bold: chalk.bold.blue };
}

function severityLabel(sev: Severity): string {
  return sev === 'error' ? 'error' : sev === 'warning' ? 'warn ' : 'info ';
}

const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'info'];
const CATEGORY_LABELS: Record<CheckCategory, string> = {
  'deprecated-api': 'Deprecated APIs',
  'hallucinated-package': 'Hallucinated Pkgs',
  'security': 'Security',
  'complexity': 'Complexity',
  'convention': 'Convention',
};

function countByCategoryAndSeverity(result: ReviewResult): Record<CheckCategory, Record<Severity, number>> {
  const counts: Record<string, Record<string, number>> = {};
  for (const cat of Object.keys(CATEGORY_LABELS) as CheckCategory[]) {
    counts[cat] = { error: 0, warning: 0, info: 0 };
  }
  for (const file of result.files) {
    for (const f of file.findings) {
      if (!counts[f.category]) counts[f.category] = { error: 0, warning: 0, info: 0 };
      counts[f.category][f.severity]++;
    }
  }
  return counts as Record<CheckCategory, Record<Severity, number>>;
}

function buildSummaryTable(result: ReviewResult): string {
  const counts = countByCategoryAndSeverity(result);
  const hasAny = result.totalFindings > 0;

  const table = new Table({
    style: { head: [], border: ['gray'] },
    colWidths: [22, 10, 12, 10],
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│ ', 'right': ' │', 'middle': ' │ ',
    },
  });

  table.push([
    { content: chalk.bold('Category'), hAlign: 'left' },
    { content: chalk.bold('Errors'), hAlign: 'right' },
    { content: chalk.bold('Warnings'), hAlign: 'right' },
    { content: chalk.bold('Info'), hAlign: 'right' },
  ]);

  for (const cat of Object.keys(CATEGORY_LABELS) as CheckCategory[]) {
    const c = counts[cat];
    const errors = c.error > 0 ? chalk.red(String(c.error)) : '0';
    const warnings = c.warning > 0 ? chalk.yellow(String(c.warning)) : '0';
    const info = c.info > 0 ? chalk.blue(String(c.info)) : '0';
    table.push([
      { content: CATEGORY_LABELS[cat], hAlign: 'left' },
      { content: errors, hAlign: 'right' },
      { content: warnings, hAlign: 'right' },
      { content: info, hAlign: 'right' },
    ]);
  }

  table.push([
    { content: chalk.bold('Total'), hAlign: 'left' },
    { content: hasAny ? chalk.bold.red(String(result.bySeverity.error)) : '0', hAlign: 'right' },
    { content: hasAny && result.bySeverity.warning > 0 ? chalk.bold.yellow(String(result.bySeverity.warning)) : '0', hAlign: 'right' },
    { content: hasAny && result.bySeverity.info > 0 ? chalk.bold.blue(String(result.bySeverity.info)) : '0', hAlign: 'right' },
  ]);

  return table.toString();
}

function formatFinding(finding: Finding): string {
  const styler = severityStyler(finding.severity);
  const label = severityLabel(finding.severity);

  const header = styler.color(`  ✗ [${finding.id}] ${finding.category} · ${label}`);
  const location = chalk.dim(`    ${finding.file}:${finding.line}:${finding.column}`);
  const message = `    ${finding.message}`;
  const suggestion = chalk.dim(`    → ${finding.suggestion}`);

  return `${header}\n${location}\n${message}\n${suggestion}`;
}

function buildFindingsBySeverity(result: ReviewResult): string {
  const lines: string[] = [];

  for (const sev of SEVERITY_ORDER) {
    const findings = result.files
      .flatMap((f) => f.findings)
      .filter((f) => f.severity === sev);

    if (findings.length === 0) continue;

    const styler = severityStyler(sev);
    const label = sev.charAt(0).toUpperCase() + sev.slice(1);
    const countMsg = styler.bold(`\n${label} (${findings.length})`);
    lines.push(countMsg);

    for (const finding of findings) {
      lines.push(formatFinding(finding));
    }
  }

  return lines.join('\n');
}

function buildFooter(result: ReviewResult): string {
  const cachedTokens = result.files
    .filter((f) => f.cachedAt)
    .reduce((sum, f) => sum + (f.tokensUsed ?? 0), 0);
  const newTokens = result.totalTokensUsed - cachedTokens;
  const costStr = result.estimatedCostUsd.toFixed(4);

  let costLine: string;
  if (cachedTokens > 0) {
    costLine = `Cost this run: ~$${costStr} (${cachedTokens.toLocaleString()} cached tokens + ${newTokens.toLocaleString()} new tokens)`;
  } else if (newTokens > 0) {
    costLine = `Cost this run: ~$${costStr} (${newTokens.toLocaleString()} new tokens)`;
  } else {
    costLine = `Cost this run: ~$${costStr}`;
  }

  return `${costLine}`;
}

function buildHeader(result: ReviewResult): string {
  const line = '─'.repeat(50);
  const title = chalk.bold('ai-review — AI Code Review');
  const meta = `Target: ${result.target}  |  Files: ${result.filesReviewed}  |  ${formatDate(result.scannedAt)}`;
  return `${chalk.dim(line)}\n ${title}\n ${chalk.dim(meta)}\n${chalk.dim(line)}`;
}

export function printTerminalReport(result: ReviewResult): void {
  const parts: string[] = [];

  parts.push(buildHeader(result));
  parts.push('');

  if (result.totalFindings === 0) {
    parts.push(chalk.green.bold('  ✓ No issues found. This code looks clean.'));
  } else {
    parts.push(buildSummaryTable(result));
    parts.push('');
    parts.push(buildFindingsBySeverity(result));
  }

  parts.push('');
  parts.push(chalk.dim(buildFooter(result)));
  parts.push(chalk.dim('─'.repeat(50)));

  console.log(parts.join('\n'));
}
