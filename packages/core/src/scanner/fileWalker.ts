import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Language, ReviewConfig, FileReview } from '../types';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  'venv',
  '.venv',
  'coverage',
  '.nyc_output',
]);

const EXT_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
};

function detectLanguage(filePath: string): Language | null {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_MAP[ext] ?? null;
}

function shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return ignorePatterns.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' +
          pattern
            .replace(/\\/g, '/')
            .split(/\//g)
            .map((part) => {
              if (part === '**') return '.*';
              if (part === '*') return '[^/]*';
              return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
            })
            .join('\\/') +
          '$',
      );
      return regex.test(normalized);
    }
    return normalized === pattern || normalized.startsWith(pattern + '/');
  });
}

export async function walkFiles(
  rootDir: string,
  config: ReviewConfig,
): Promise<FileReview[]> {
  const results: FileReview[] = [];
  const maxSize = 500 * 1024;
  const ignorePatterns = config.ignorePatterns ?? [];
  const languages = config.languages;

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      if (shouldIgnore(relativePath, ignorePatterns)) continue;

      const lang = detectLanguage(entry.name);
      if (lang === null) continue;

      if (languages && !languages.includes(lang)) continue;

      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch {
        continue;
      }
      if (stat.size > maxSize) continue;

      let content: string;
      try {
        content = await fs.promises.readFile(fullPath, 'utf-8');
      } catch {
        continue;
      }

      results.push({
        file: relativePath.replace(/\\/g, '/'),
        language: lang,
        findings: [],
      });
    }
  }

  await walk(rootDir);
  return results;
}
