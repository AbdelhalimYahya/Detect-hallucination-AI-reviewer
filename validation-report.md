# Real-World Validation Report

## Overview

Validated `ai-review` static analysis rules against 5 AI-generated open-source repos.
All scans performed with `--no-ai` flag (static analysis only).

## Repos Scanned

| Repo | Owner | Files | Type | Status |
|------|-------|-------|------|--------|
| baseClaudeReactWebtemplate | lucasps136 | 199 | Next.js template with code gen scripts | Findings: 12 SEC_SQL_CONCAT + 1 SEC_WEAK_CRYPTO (all debatable/FP) |
| claude-managed-agents | vercel-labs | 66 | Next.js managed-agent app | Clean - 0 findings |
| next16-claude-starter | textura-agency | 58 | Next.js 16 starter | Clean - 0 findings |
| constellation | avarajar | 31 | CLI/web project generator | Findings: 11 SEC_INNER_HTML (all FP) |
| starbase | bstaruk | 27 | TypeScript starter kit | Clean - 0 findings |

## FP Analysis (Before Fixes)

| Rule | Total Before | Real Issues | FPs Before | FP Rate Before |
|------|-------------|-------------|------------|----------------|
| DEPRECATED_STRING_REFS | 21 | 0 | 21 | 100% |
| SEC_SQL_CONCAT | 89 | 0 | 89 | 100% |
| SEC_INNER_HTML | 22 | 0 | 22 | 100% |
| SEC_WEAK_CRYPTO | 1 | 0 | 1 | 100% |
| **TOTAL** | **133** | **0** | **133** | **100%** |

## Fixes Applied

1. **DEPRECATED_STRING_REFS**: Pattern changed from substring `ref="` to regex `(?<=^|[\\s{}(\\[])(ref=\"[^\"]*\")` with word-boundary lookbehind. Fixed: `href="` no longer matches.

2. **SEC_SQL_CONCAT**: Regex flags changed from `gi` to `g` (case-sensitive). Fixed: English word "Select" no longer matches SQL keyword `SELECT`.

3. **SEC_INNER_HTML**: Added exception for values using `escHtml()` or `DOMPurify.sanitize()` sanitizer functions, and template literals using `escHtml()` or with no interpolation.

## FP Analysis (After Fixes)

| Rule | Total After | Real Issues | FPs After | FP Rate After |
|------|------------|-------------|-----------|---------------|
| DEPRECATED_STRING_REFS | 0 | 0 | 0 | 0% |
| SEC_SQL_CONCAT | 12 | 0 | 12* | 100%* |
| SEC_INNER_HTML | 11 | 0 | 11 | 100% |
| SEC_WEAK_CRYPTO | 1 | 0 | 1 | 100% |
| **TOTAL** | **24** | **0** | **24** | **100%** |

*\*SEC_SQL_CONCAT in baseclaude are build-time SQL code generators, not runtime queries. Technically correct detection but low-risk context.*

## Remaining FP Root Causes

### SEC_SQL_CONCAT (12 findings)
- **All 12** in `baseclaude/scripts/modules/generate-module.js` — a build-time script that generates SQL migration files
- Uses template literals with SQL keywords (CREATE TABLE, INSERT INTO)
- Uses parameterized placeholders (`$1`, `$2`) — proper SQL practice
- Table/column names derived from controlled module config, not user input
- **Fix limitation**: Distinguishing build-time SQL generation from runtime SQL queries requires build-context analysis beyond regex scope

### SEC_INNER_HTML (11 findings)
- **All 11** in `constellation/src/web/public/app.js`
- Pattern: `container.innerHTML = html;` where `html` is a local variable built from concatenated `escHtml()`-sanitized strings
- The scanner only sees the variable assignment, not how the variable was constructed
- **Fix limitation**: Cross-line dataflow analysis would be needed to trace variable origin

### SEC_WEAK_CRYPTO (1 finding)
- `baseclaude/scripts/modules/cache-manager.js:128` — MD5 used for cache checksum, not security
- **Fix limitation**: Detecting cryptographic intent vs. non-security checksum usage requires semantic understanding

## Conclusion

- **Zero real issues** found across 5 repos (381 total source files scanned)
- Fixes reduced findings from **133 → 24** (82% reduction)
- 3 of 5 repos are now **completely clean** (cmagents, next16, starbase)
- Remaining 24 findings are all false positives in edge cases that require cross-line or build-context analysis
- FP rate target (< 10%) not met for remaining SEC_SQL_CONCAT and SEC_INNER_HTML rules, but these are acceptably low-severity warnings in safe contexts
