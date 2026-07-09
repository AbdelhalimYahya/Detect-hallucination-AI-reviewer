import { createHash } from 'crypto';
import { readFile, writeFile, mkdir, rm, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { access, constants } from 'fs/promises';
import { homedir } from 'os';
import type { FileReview } from '../types';

const DEFAULT_CACHE_DIR = join(homedir(), '.ai-review', 'cache');
const STALE_DAYS = 30;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

interface CacheEntry {
  cachedAt: string;
  result: FileReview;
}

export class ResultCache {
  private cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? DEFAULT_CACHE_DIR;
  }

  private hash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  private pathForHash(hash: string): string {
    return join(this.cacheDir, `${hash}.json`);
  }

  async get(fileContent: string): Promise<FileReview | null> {
    try {
      const h = this.hash(fileContent);
      const p = this.pathForHash(h);

      try {
        await access(p, constants.F_OK);
      } catch {
        return null;
      }

      const raw = await readFile(p, 'utf-8');
      const entry: CacheEntry = JSON.parse(raw);

      if (!entry.cachedAt) return null;

      const age = Date.now() - new Date(entry.cachedAt).getTime();
      if (age > STALE_MS) {
        return null;
      }

      return entry.result;
    } catch {
      return null;
    }
  }

  async set(fileContent: string, result: FileReview): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });

      const h = this.hash(fileContent);
      const p = this.pathForHash(h);

      const entry: CacheEntry = {
        cachedAt: new Date().toISOString(),
        result,
      };

      await writeFile(p, JSON.stringify(entry, null, 2), 'utf-8');
    } catch {
      // never crash the scan if cache fails
    }
  }

  async clear(): Promise<void> {
    try {
      await rm(this.cacheDir, { recursive: true, force: true });
    } catch {
      // never crash
    }
  }

  async stats(): Promise<{ entries: number; sizeKb: number }> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
      const files = await readdir(this.cacheDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      let totalBytes = 0;
      for (const f of jsonFiles) {
        try {
          const s = await stat(join(this.cacheDir, f));
          totalBytes += s.size;
        } catch {
          // skip files that disappeared
        }
      }
      return { entries: jsonFiles.length, sizeKb: Math.round(totalBytes / 1024) };
    } catch {
      return { entries: 0, sizeKb: 0 };
    }
  }
}
