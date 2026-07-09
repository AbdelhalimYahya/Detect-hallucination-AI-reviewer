import type { Finding, Language, Severity } from '../types';

interface PackageImport {
  name: string;
  line: number;
  column: number;
}

const NPM_BUILTINS = new Set([
  'fs', 'path', 'crypto', 'os', 'http', 'https', 'net', 'dgram', 'dns',
  'url', 'querystring', 'stream', 'util', 'events', 'assert', 'buffer',
  'child_process', 'cluster', 'console', 'constants', 'domain', 'http2',
  'inspector', 'module', 'perf_hooks', 'process', 'punycode', 'readline',
  'repl', 'string_decoder', 'timers', 'tls', 'trace_events', 'tty',
  'v8', 'vm', 'worker_threads', 'zlib', 'async_hooks', 'diagnostics_channel',
  'wasi', 'sys', '_linklist', '_stream_readable', '_stream_writable',
  '_stream_transform', '_stream_duplex', '_stream_passthrough',
]);

function extractImports(content: string, language: Language): PackageImport[] {
  const imports: PackageImport[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (language === 'typescript' || language === 'javascript') {
      const importFromRe = /\b(?:import|export)\s+(?:\w+\s*,?\s*)?(?:\{[^}]*\})?\s*from\s+['"]([^'"]+)['"]/g;
      const sideEffectRe = /\bimport\s+['"]([^'"]+)['"]/g;
      const requireRe = /\b(?:const|let|var)\s+\w+\s*=\s*require\(['"]([^'"]+)['"]\)/g;

      for (const re of [importFromRe, sideEffectRe, requireRe]) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          const pkg = m[1].split('/')[0].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
          if (!pkg.startsWith('.') && !pkg.startsWith('/') && !pkg.startsWith('node:') && !pkg.startsWith('@/') && !NPM_BUILTINS.has(pkg)) {
            imports.push({ name: pkg, line: i + 1, column: m.index + 1 });
          }
        }
      }
    }

    if (language === 'python') {
      const importRe = /^import\s+(\w[\w.]*)/;
      const fromRe = /^from\s+(\w[\w.]*)\s+import/;

      let m: RegExpExecArray | null;
      if ((m = importRe.exec(line)) !== null) {
        const pkg = m[1].split('.')[0];
        if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
          imports.push({ name: pkg, line: i + 1, column: m.index + 1 });
        }
      }
      if ((m = fromRe.exec(line)) !== null) {
        const pkg = m[1].split('.')[0];
        if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
          imports.push({ name: pkg, line: i + 1, column: m.index + 1 });
        }
      }
    }
  }

  return imports;
}

export interface RegistryChecker {
  (packageName: string): Promise<{ exists: boolean; error?: string }>;
}

export async function checkNpmPackage(packageName: string): Promise<{ exists: boolean; error?: string }> {
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    if (res.status === 404) return { exists: false };
    if (res.status >= 500) return { exists: true, error: `registry error: ${res.status}` };
    return { exists: true };
  } catch (err) {
    return { exists: true, error: (err as Error).message };
  }
}

export async function checkPypiPackage(packageName: string): Promise<{ exists: boolean; error?: string }> {
  try {
    const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    if (res.status === 404) return { exists: false };
    if (res.status >= 500) return { exists: true, error: `registry error: ${res.status}` };
    return { exists: true };
  } catch (err) {
    return { exists: true, error: (err as Error).message };
  }
}

const memoryCache = new Map<string, { exists: boolean }>();

export function clearMemoryCache(): void {
  memoryCache.clear();
}

export async function checkHallucinatedPackages(
  content: string,
  filePath: string,
  language: Language,
  checker?: RegistryChecker,
): Promise<Finding[]> {
  if (language === 'unknown') return [];
  const imports = extractImports(content, language);
  const findings: Finding[] = [];
  const registryChecker = checker ?? (language === 'python' ? checkPypiPackage : checkNpmPackage);

  for (const imp of imports) {
    const cached = memoryCache.get(imp.name);
    if (cached && cached.exists) continue;
    if (cached && !cached.exists) {
      findings.push(makeFinding(imp, filePath, language));
      continue;
    }

    try {
      const result = await registryChecker(imp.name);
      memoryCache.set(imp.name, { exists: result.exists });
      if (!result.exists) {
        findings.push(makeFinding(imp, filePath, language));
      }
    } catch {
      memoryCache.set(imp.name, { exists: true });
    }
  }

  return findings;
}

function makeFinding(imp: PackageImport, filePath: string, language: Language): Finding {
  const registry = language === 'python' ? 'PyPI' : 'npm';
  return {
    id: 'HALLUCINATED_PACKAGE',
    category: 'hallucinated-package',
    severity: 'error',
    title: `Package does not exist on ${registry}`,
    message: `The package '${imp.name}' does not exist on the ${registry} registry. This is a common AI hallucination pattern where an LLM invents a package name that sounds plausible but doesn't exist.`,
    suggestion: `Verify the package name at ${registry === 'npm' ? 'https://npmjs.com/' : 'https://pypi.org/'}${encodeURIComponent(imp.name)}. If you need similar functionality, search for real packages with comparable names. If this is an internal package, ensure it is published to your private registry.`,
    file: filePath,
    line: imp.line,
    column: imp.column,
    source: 'static',
  };
}
