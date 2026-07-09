import { readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { ReviewConfig, Language } from './types';

const languageSchema = z.enum(['typescript', 'javascript', 'python', 'unknown']);

const checksSchema = z.object({
  deprecatedApis: z.boolean().optional(),
  hallucinatedPackages: z.boolean().optional(),
  security: z.boolean().optional(),
  complexity: z.boolean().optional(),
  conventions: z.boolean().optional(),
}).optional();

const configSchema = z.object({
  anthropicApiKey: z.string().optional(),
  model: z.string().optional(),
  conventions: z.array(z.string()).optional(),
  ignorePatterns: z.array(z.string()).optional(),
  checks: checksSchema,
  languages: z.array(languageSchema).optional(),
});

const defaultConfig: ReviewConfig = {
  model: 'claude-haiku-4-5',
  checks: {
    deprecatedApis: true,
    hallucinatedPackages: true,
    security: true,
    complexity: true,
  },
};

async function findConfigFile(startDir: string): Promise<string | null> {
  let current = resolve(startDir);
  const root = resolve(current.split('\\').slice(0, 1).join('\\') + '\\');

  while (true) {
    const candidate = join(current, 'aireview.config.json');
    try {
      await access(candidate);
      return candidate;
    } catch {
      if (current === root) return null;
      current = dirname(current);
    }
  }
}

export async function loadConfig(rootDir: string): Promise<ReviewConfig> {
  const configPath = await findConfigFile(rootDir);

  if (!configPath) {
    return { ...defaultConfig };
  }

  const raw = await readFile(configPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`aireview.config.json is not valid JSON at ${configPath}`);
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`aireview.config.json has invalid fields:\n${issues}`);
  }

  const config: ReviewConfig = {
    ...defaultConfig,
    ...result.data,
    checks: {
      ...defaultConfig.checks,
      ...result.data.checks,
    },
  };

  if (process.env.ANTHROPIC_API_KEY) {
    config.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  }

  return config;
}

export async function generateDefaultConfig(outputPath: string): Promise<void> {
  const starter: ReviewConfig = {
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
  await writeFile(outputPath, JSON.stringify(starter, null, 2) + '\n', 'utf-8');
}
