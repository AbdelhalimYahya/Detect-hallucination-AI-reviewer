import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as readline from 'node:readline';
import { Command } from 'commander';

import {
  loadConfig,
  runReview,
  generateDefaultConfig,
  ResultCache,
} from '@ai-review/core';
import type {
  ReviewResult,
  Severity,
  CheckCategory,
  Finding,
} from '@ai-review/core';

import { printTerminalReport } from './report/terminalReport';
import { writeHtmlReport } from './report/htmlReport';

const SEVERITY_RANK: Record<Severity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

function filterBySeverity(result: ReviewResult, min: Severity): ReviewResult {
  const rank = SEVERITY_RANK[min];
  const files = result.files
    .map((f) => ({
      ...f,
      findings: f.findings.filter((fi) => SEVERITY_RANK[fi.severity] >= rank),
    }))
    .filter((f) => f.findings.length > 0);

  const byCategory: Record<CheckCategory, number> = {
    'deprecated-api': 0, 'hallucinated-package': 0, 'security': 0,
    'complexity': 0, 'convention': 0,
  };
  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  let totalFindings = 0;
  for (const f of files) {
    for (const fi of f.findings) {
      totalFindings++;
      byCategory[fi.category] = (byCategory[fi.category] ?? 0) + 1;
      bySeverity[fi.severity] = (bySeverity[fi.severity] ?? 0) + 1;
    }
  }

  return {
    ...result,
    files,
    filesReviewed: files.length,
    totalFindings,
    byCategory,
    bySeverity,
  };
}

function hasErrorFindings(result: ReviewResult): boolean {
  for (const f of result.files) {
    for (const fi of f.findings) {
      if (fi.severity === 'error') return true;
    }
  }
  return false;
}

async function promptForApiKey(): Promise<string | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question('Enter your Anthropic API key (sk-ant-...): ', (answer) => {
      rl.close();
      const key = answer.trim();
      resolve(key || null);
    });
  });
}

const program = new Command();

program
  .name('ai-review')
  .version(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8').includes('"version"')
    ? JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version
    : '0.0.0')
  .description(
    'AI-powered code review for AI-generated code.\n' +
    'Scans your project for deprecated APIs, hallucinated packages,\n' +
    'security issues, and unnecessary complexity.\n' +
    '\n' +
    'Example:\n' +
    '  ai-review scan ./src          review your source directory\n' +
    '  ai-review init                create a starter config\n' +
    '  ai-review clear-cache         clear the AI result cache',
  );

// ---- scan command ----
program
  .command('scan <target>')
  .description('Run a full code review on <target> directory')
  .option('--json <path>', 'save JSON report')
  .option('--html <path>', 'save HTML report')
  .option('--no-html', 'skip HTML report')
  .option('--no-cache', 'bypass cache and re-analyze everything')
  .option('--min-severity <level>', 'only show findings at or above this level in terminal (error|warning|info)')
  .option('--no-ai', 'skip AI checks, static analysis only (free mode)')
  .option('--quiet', 'suppress terminal output, just write files')
  .action(async (target: string, options) => {
    try {
      const config = await loadConfig(target);

      // Map CLI flags to config overrides
      if (options.ai === false) {
        config.checks = { ...config.checks, complexity: false };
      }

      const result = await runReview(target, config);

      const minSev: Severity = (options.minSeverity as Severity) || 'info';
      const filtered = minSev === 'info' ? result : filterBySeverity(result, minSev);

      // --json
      const jsonPath = options.json || './ai-review-report.json';
      writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
      if (!options.quiet) {
        console.log(`JSON report saved: ${jsonPath}`);
      }

      // --html / --no-html
      if (!options.noHtml) {
        const htmlPath = options.html || './ai-review-report.html';
        writeHtmlReport(result, htmlPath);
        if (!options.quiet) {
          console.log(`HTML report saved: ${htmlPath}`);
        }
      }

      // terminal output (unless --quiet)
      if (!options.quiet) {
        printTerminalReport(filtered);
      }

      // exit code
      if (hasErrorFindings(result)) {
        process.exitCode = 1;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// ---- init command ----
program
  .command('init')
  .description('Create a starter aireview.config.json in the current directory')
  .action(async () => {
    const configPath = join(process.cwd(), 'aireview.config.json');

    if (existsSync(configPath)) {
      console.log('aireview.config.json already exists. Skipping.');
      return;
    }

    let apiKey: string | null = process.env.ANTHROPIC_API_KEY || null;
    if (!apiKey) {
      const keyFilePath = join(process.cwd(), '.env');
      if (existsSync(keyFilePath)) {
        const envContent = readFileSync(keyFilePath, 'utf-8');
        const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m);
        if (match) apiKey = match[1].trim();
      }
    }
    if (!apiKey) {
      apiKey = await promptForApiKey();
    }

    const defaultConfig = {
      anthropicApiKey: apiKey || undefined,
      model: 'claude-haiku-4-5',
      conventions: [],
      ignorePatterns: ['node_modules', 'dist', '.git'],
      checks: {
        deprecatedApis: true,
        hallucinatedPackages: true,
        security: true,
        complexity: true,
      },
    };

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf-8');

    console.log('Created aireview.config.json');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review the config and adjust conventions if needed');
    console.log('  2. Run ai-review scan ./src');
    if (!apiKey) {
      console.log('  3. Set your ANTHROPIC_API_KEY env var or edit the config file');
    }
  });

// ---- clear-cache command ----
program
  .command('clear-cache')
  .description('Clear the AI result cache')
  .action(async () => {
    const cache = new ResultCache();
    const before = await cache.stats();
    await cache.clear();
    const after = await cache.stats();
    const removed = before.entries - after.entries;
    console.log(`Cache cleared. Removed ${removed} entr${removed === 1 ? 'y' : 'ies'}.`);
  });

program.parse(process.argv);
