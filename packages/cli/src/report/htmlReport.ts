import { writeFileSync } from 'node:fs';
import type { ReviewResult, Finding, CheckCategory, Severity } from '@ai-review/core';

const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'info'];
const CATEGORY_COLORS: Record<CheckCategory, string> = {
  'deprecated-api': '#e67e22',
  'hallucinated-package': '#8e44ad',
  'security': '#e74c3c',
  'complexity': '#3498db',
  'convention': '#2ecc71',
};
const SEVERITY_LABELS: Record<Severity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function hashFileId(file: string): string {
  return 'file-' + file.replace(/[^a-zA-Z0-9]/g, '-');
}

function css(): string {
  return `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;background:#f5f6fa;color:#2c3e50;line-height:1.6;padding:24px}
.container{max-width:960px;margin:0 auto}
header{padding:24px;background:linear-gradient(135deg,#2c3e50,#3498db);border-radius:12px;color:#fff;margin-bottom:24px}
header h1{font-size:20px;font-weight:700;margin-bottom:4px}
header .meta{font-size:13px;opacity:.8}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-bottom:24px}
.summary-card{background:#fff;border-radius:10px;padding:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.summary-card .value{font-size:28px;font-weight:700;color:#2c3e50}
.summary-card .label{font-size:12px;color:#7f8c8d;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
.categories{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
.badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;color:#fff}
.mid-separator{text-align:center;padding:8px;color:#bdc3c7;font-size:13px}
.file-group{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:16px;overflow:hidden}
.file-header{padding:14px 20px;background:#f8f9fa;border-bottom:1px solid #ecf0f1;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center}
.file-header .file-path{color:#2c3e50}
.file-header .file-count{color:#7f8c8d;font-weight:400;font-size:12px}
.severity-section{margin:0}
.severity-title{padding:10px 20px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #ecf0f1}
.severity-title.error{color:#e74c3c}
.severity-title.warning{color:#e67e22}
.severity-title.info{color:#3498db}
.finding-card{padding:14px 20px;border-bottom:1px solid #f5f6fa}
.finding-card:last-child{border-bottom:none}
.finding-card .finding-header{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.finding-card .cat-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff}
.finding-card .finding-id{font-size:12px;font-weight:600;color:#7f8c8d;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace}
.finding-card .finding-title{font-size:14px;font-weight:700;margin-bottom:4px}
.finding-card .finding-message{font-size:13px;color:#555;margin-bottom:4px}
.finding-card .finding-location{font-size:11px;color:#bdc3c7;margin-bottom:6px}
.finding-card .finding-location a{color:#3498db;text-decoration:none}
.finding-card .finding-location a:hover{text-decoration:underline}
.finding-card .finding-suggestion{font-size:13px;color:#27ae60;padding:8px 12px;background:#f0faf0;border-radius:6px;margin-bottom:4px}
.finding-card .finding-source{font-size:11px;color:#bdc3c7}
footer{text-align:center;padding:24px;color:#95a5a6;font-size:12px}
@media(prefers-color-scheme:dark){
body{background:#1a1a2e;color:#e0e0e0}
.summary-card{background:#16213e;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.summary-card .value{color:#e0e0e0}
.summary-card .label{color:#7f8c8d}
.file-group{background:#16213e;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.file-header{background:#1a1a2e;border-bottom-color:#2c3e50}
.file-header .file-path{color:#e0e0e0}
.finding-card .finding-message{color:#b0b0b0}
.finding-card .finding-suggestion{background:#0d2818;color:#2ecc71}
.severity-title{border-bottom-color:#2c3e50}
.finding-card{border-bottom-color:#1a1a2e}
}
@media(max-width:600px){
.container{padding:0}
body{padding:12px}
.summary{grid-template-columns:repeat(2,1fr)}
header{padding:16px}
.file-header,.finding-card,.severity-title{padding:10px 14px}
}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function writeHtmlReport(result: ReviewResult, outputPath: string): void {
  const now = formatDate(result.scannedAt);
  const hasFindings = result.totalFindings > 0;
  const cachedTokens = result.files.filter((f) => f.cachedAt).reduce((s, f) => s + (f.tokensUsed ?? 0), 0);
  const newTokens = result.totalTokensUsed - cachedTokens;
  const costStr = result.estimatedCostUsd.toFixed(4);

  let costDetail = `~$${costStr}`;
  if (cachedTokens > 0) costDetail += ` (${cachedTokens.toLocaleString()} cached + ${newTokens.toLocaleString()} new tokens)`;
  else if (newTokens > 0) costDetail += ` (${newTokens.toLocaleString()} new tokens)`;

  const catCounts = Object.entries(result.byCategory).filter(([, v]) => v > 0) as [CheckCategory, number][];

  function renderSummaryCards(): string {
    return `<div class="summary">
      <div class="summary-card"><div class="value">${result.filesReviewed}</div><div class="label">Files</div></div>
      <div class="summary-card"><div class="value">${result.totalFindings}</div><div class="label">Findings</div></div>
      <div class="summary-card"><div class="value">${costDetail}</div><div class="label">Cost</div></div>
      <div class="summary-card"><div class="value">${now}</div><div class="label">Scanned</div></div>
    </div>`;
  }

  function renderCategoryBadges(): string {
    const items = catCounts
      .map(([cat, count]) => `<span class="badge" style="background:${CATEGORY_COLORS[cat]}">${escapeHtml(cat)}: ${count}</span>`)
      .join('');
    const zeroCats = (Object.keys(result.byCategory) as CheckCategory[])
      .filter((c) => result.byCategory[c] === 0)
      .map((c) => `<span class="badge" style="background:#bdc3c7">${escapeHtml(c)}: 0</span>`)
      .join('');
    return `<div class="categories">${items}${zeroCats}</div>`;
  }

  function renderFindings(): string {
    const filesWithFindings = result.files.filter((f) => f.findings.length > 0);
    if (filesWithFindings.length === 0) return '';

    const grouped: string[] = [];
    for (const fileReview of filesWithFindings) {
      const fileId = hashFileId(fileReview.file);
      const sections: string[] = [];

      for (const sev of SEVERITY_ORDER) {
        const findings = fileReview.findings.filter((f) => f.severity === sev);
        if (findings.length === 0) continue;

        sections.push(`<div class="severity-title ${sev}">${SEVERITY_LABELS[sev]} (${findings.length})</div>`);

        for (const finding of findings) {
          sections.push(renderFindingCard(finding));
        }
      }

      grouped.push(`<div class="file-group">
        <div class="file-header">
          <span class="file-path" id="${fileId}">${escapeHtml(fileReview.file)}</span>
          <span class="file-count">${fileReview.findings.length} finding${fileReview.findings.length !== 1 ? 's' : ''}</span>
        </div>
        ${sections.join('\n')}
      </div>`);
    }

    return grouped.join('\n');
  }

  function renderFindingCard(finding: Finding): string {
    const catColor = CATEGORY_COLORS[finding.category] || '#95a5a6';
    const fileId = hashFileId(finding.file);
    const sourceText = finding.source === 'ai' ? 'AI' : 'static';

    return `<div class="finding-card">
      <div class="finding-header">
        <span class="cat-badge" style="background:${catColor}">${escapeHtml(finding.category)}</span>
        <span class="finding-id">${escapeHtml(finding.id)}</span>
      </div>
      <div class="finding-title">${escapeHtml(finding.title)}</div>
      <div class="finding-message">${escapeHtml(finding.message)}</div>
      <div class="finding-location">
        <a href="#${fileId}">${escapeHtml(finding.file)}:${finding.line}:${finding.column}</a>
      </div>
      <div class="finding-suggestion">💡 ${escapeHtml(finding.suggestion)}</div>
      <div class="finding-source">Source: ${sourceText}</div>
    </div>`;
  }

  function renderFooter(): string {
    return `<footer>Generated by <strong>ai-review</strong></footer>`;
  }

  let bodyHtml: string;

  if (!hasFindings) {
    bodyHtml = `
      ${renderSummaryCards()}
      <div style="text-align:center;padding:60px 20px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <div style="font-size:48px;margin-bottom:16px">✓</div>
        <h2 style="font-size:20px;color:#27ae60">No issues found</h2>
        <p style="color:#7f8c8d;margin-top:8px">This code looks clean.</p>
      </div>
    `;
  } else {
    bodyHtml = `
      ${renderSummaryCards()}
      ${catCounts.length > 0 ? renderCategoryBadges() : ''}
      ${renderFindings()}
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>ai-review — Code Review Report</title>
<style>${css()}</style>
</head>
<body>
<div class="container">
<header>
  <h1>ai-review — AI Code Review</h1>
  <div class="meta">Target: ${escapeHtml(result.target)} | ${now}</div>
</header>
${bodyHtml}
${renderFooter()}
</div>
</body>
</html>`;

  writeFileSync(outputPath, html, 'utf-8');
}
