import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Language, Finding, Rule, Severity } from '../types';

interface DatabaseEntry {
  id: string;
  pattern: string;
  patternType?: 'substring' | 'regex';
  title: string;
  message: string;
  suggestion: string;
  docsUrl: string;
  severity: Severity;
}

function getDbPath(): string {
  if (typeof __dirname !== 'undefined') {
    const candidates = [
      // Relative to core dist: packages/core/dist/../databases
      path.resolve(__dirname, '..', 'databases'),
      // Monorepo root: packages/core/dist/rules/../../../../databases
      path.resolve(__dirname, '..', '..', '..', '..', 'databases'),
      // npm install: node_modules/ai-review/node_modules/@ai-review/core/dist/rules/../../../../../databases
      path.resolve(__dirname, '..', '..', '..', '..', '..', 'databases'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return path.resolve(process.cwd(), 'databases');
}

function loadDatabase(fileName: string): DatabaseEntry[] {
  const filePath = path.join(getDbPath(), fileName);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

interface CommentRegion {
  start: number;
  end: number;
}

function buildJsCommentRegions(content: string): CommentRegion[] {
  const regions: CommentRegion[] = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === '\n' || content[i] === '\r') { i++; continue; }
    const two = content.slice(i, i + 2);
    if (two === '//') {
      const end = content.indexOf('\n', i);
      regions.push({ start: i, end: end === -1 ? content.length : end });
      i = end === -1 ? content.length : end;
      continue;
    }
    if (two === '/*') {
      const end = content.indexOf('*/', i + 2);
      regions.push({ start: i, end: end === -1 ? content.length : end + 2 });
      i = end === -1 ? content.length : end + 2;
      continue;
    }
    i++;
  }
  return regions;
}

function buildPyCommentRegions(content: string): CommentRegion[] {
  const regions: CommentRegion[] = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === '\n' || content[i] === '\r') { i++; continue; }
    if (content[i] === '#') {
      const end = content.indexOf('\n', i);
      regions.push({ start: i, end: end === -1 ? content.length : end });
      i = end === -1 ? content.length : end;
      continue;
    }
    if (content.slice(i, i + 3) === "'''") {
      const end = content.indexOf("'''", i + 3);
      regions.push({ start: i, end: end === -1 ? content.length : end + 3 });
      i = end === -1 ? content.length : end + 3;
      continue;
    }
    if (content.slice(i, i + 3) === '"""') {
      const end = content.indexOf('"""', i + 3);
      regions.push({ start: i, end: end === -1 ? content.length : end + 3 });
      i = end === -1 ? content.length : end + 3;
      continue;
    }
    i++;
  }
  return regions;
}

const REGION_CACHE = new Map<string, CommentRegion[]>();

function getCommentRegions(content: string, isPython: boolean): CommentRegion[] {
  const key = (isPython ? 'py:' : 'js:') + content.slice(0, 100);
  const cached = REGION_CACHE.get(key);
  if (cached) return cached;
  const regions = isPython ? buildPyCommentRegions(content) : buildJsCommentRegions(content);
  REGION_CACHE.set(key, regions);
  return regions;
}

function isInComment(index: number, regions: CommentRegion[]): boolean {
  return regions.some((r) => index >= r.start && index < r.end);
}

function findAllOccurrences(
  content: string,
  entry: DatabaseEntry,
  commentRegions: CommentRegion[],
): { index: number; line: number; column: number }[] {
  const results: { index: number; line: number; column: number }[] = [];

  if (entry.patternType === 'regex') {
    const re = new RegExp(entry.pattern, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (!isInComment(m.index, commentRegions)) {
        const lineStart = content.lastIndexOf('\n', m.index) + 1;
        const line = content.slice(0, m.index).split('\n').length;
        const column = m.index - lineStart + 1;
        results.push({ index: m.index, line, column });
      }
    }
    return results;
  }

  const pattern = entry.pattern;
  let searchFrom = 0;

  while (true) {
    const idx = content.indexOf(pattern, searchFrom);
    if (idx === -1) break;

    if (!isInComment(idx, commentRegions)) {
      const lineStart = content.lastIndexOf('\n', idx) + 1;
      const line = content.slice(0, idx).split('\n').length;
      const column = idx - lineStart + 1;
      results.push({ index: idx, line, column });
    }

    searchFrom = idx + 1;
  }

  return results;
}

const NODE_DB: DatabaseEntry[] = loadDatabase('deprecated-node.json');
const REACT_DB: DatabaseEntry[] = loadDatabase('deprecated-react.json');
const PYTHON_DB: DatabaseEntry[] = loadDatabase('deprecated-python.json');

export function createDeprecatedApiRule(): Rule {
  return {
    id: 'deprecated-api',
    category: 'deprecated-api',
    severity: 'warning',
    language: 'all',
    check(content: string, filePath: string, language: Language): Finding[] {
      if (language === 'unknown') return [];

      const isPython = language === 'python';
      const entries = isPython ? PYTHON_DB : [...NODE_DB, ...REACT_DB];
      const commentRegions = getCommentRegions(content, isPython);
      const findings: Finding[] = [];

      for (const entry of entries) {
        const occurrences = findAllOccurrences(content, entry, commentRegions);
        for (const occ of occurrences) {
          findings.push({
            id: entry.id,
            category: 'deprecated-api',
            severity: entry.severity,
            title: entry.title,
            message: entry.message,
            suggestion: entry.suggestion,
            file: filePath,
            line: occ.line,
            column: occ.column,
            source: 'static',
            ruleUrl: entry.docsUrl,
          });
        }
      }

      return findings;
    },
  };
}
