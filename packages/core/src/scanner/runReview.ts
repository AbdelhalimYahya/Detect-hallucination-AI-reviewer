import type { ReviewConfig, ReviewResult, FileReview, CheckCategory, Severity, Finding } from '../types';
import { walkFiles } from './fileWalker';
import { createDeprecatedApiRule } from '../rules/deprecatedApis';
import { createSecurityRule } from '../rules/securityPatterns';
import { checkHallucinatedPackages } from '../rules/hallucinatedPackages';
import * as fs from 'node:fs';

function isCheckEnabled(config: ReviewConfig, key: keyof NonNullable<ReviewConfig['checks']>): boolean {
  return config.checks?.[key] ?? true;
}

async function runStaticRules(
  file: FileReview,
  content: string,
  config: ReviewConfig,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  if (isCheckEnabled(config, 'deprecatedApis')) {
    const rule = createDeprecatedApiRule();
    findings.push(...rule.check(content, file.file, file.language));
  }

  if (isCheckEnabled(config, 'security')) {
    const rule = createSecurityRule();
    findings.push(...rule.check(content, file.file, file.language));
  }

  if (isCheckEnabled(config, 'hallucinatedPackages')) {
    findings.push(...await checkHallucinatedPackages(content, file.file, file.language));
  }

  return findings;
}

function computeSummary(files: FileReview[]): Pick<ReviewResult, 'totalFindings' | 'byCategory' | 'bySeverity' | 'totalTokensUsed' | 'estimatedCostUsd'> {
  let totalFindings = 0;
  let totalTokensUsed = 0;
  const byCategory: Record<CheckCategory, number> = {
    'deprecated-api': 0,
    'hallucinated-package': 0,
    'security': 0,
    'complexity': 0,
    'convention': 0,
  };
  const bySeverity: Record<Severity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  };

  for (const f of files) {
    for (const finding of f.findings) {
      totalFindings++;
      byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
      bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
    }
    totalTokensUsed += f.tokensUsed ?? 0;
  }

  const estimatedCostUsd = totalTokensUsed * 0.000003;

  return { totalFindings, byCategory, bySeverity, totalTokensUsed, estimatedCostUsd };
}

export async function runReview(rootDir: string, config: ReviewConfig): Promise<ReviewResult> {
  const fileEntries = await walkFiles(rootDir, config);
  const files: FileReview[] = [];

  for (const entry of fileEntries) {
    const fullPath = rootDir + '/' + entry.file;
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const findings = await runStaticRules(entry, content, config);
    entry.findings.push(...findings);
    files.push(entry);
  }

  const summary = computeSummary(files);

  return {
    target: rootDir,
    scannedAt: new Date().toISOString(),
    filesReviewed: files.length,
    files,
    ...summary,
  };
}
