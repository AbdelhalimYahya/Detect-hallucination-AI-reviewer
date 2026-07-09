import type { Finding, Language, Rule } from '../types';

interface SecurityRule {
  id: string;
  severity: 'error' | 'warning' | 'info';
  check(content: string, filePath: string, language: Language): Finding[];
}

const rules: SecurityRule[] = [
  {
    id: 'SEC_EVAL',
    severity: 'error',
    check: (content, filePath, language) => {
      if (language === 'python') return [];
      const findings: Finding[] = [];
      const re = /eval\s*\(\s*[^'"\s]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const lineStart = content.lastIndexOf('\n', m.index) + 1;
        const line = content.slice(0, m.index).split('\n').length;
        const column = m.index - lineStart + 1;
        findings.push({
          id: 'SEC_EVAL',
          category: 'security',
          severity: 'error',
          title: 'Use of eval() with dynamic input',
          message: `eval() with a variable argument is dangerous — it executes arbitrary code in the current context.`,
          suggestion: 'Never use eval(). Parse JSON with JSON.parse(), execute operations with explicit function calls.',
          file: filePath,
          line,
          column,
          source: 'static',
        });
      }
      return findings;
    },
  },
  {
    id: 'SEC_INNER_HTML',
    severity: 'warning',
    check: (content, filePath, language) => {
      if (language === 'python') return [];
      const findings: Finding[] = [];
      const lines = content.split('\n');
      const re = /\.innerHTML\s*=\s*[^\s"']/g;
      for (let i = 0; i < lines.length; i++) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(lines[i])) !== null) {
          findings.push({
            id: 'SEC_INNER_HTML',
            category: 'security',
            severity: 'warning',
            title: 'Assignment to innerHTML with non-literal value',
            message: `Setting innerHTML from a variable can lead to XSS if the value contains user-controlled data.`,
            suggestion: 'Use textContent for plain text, or sanitize with DOMPurify before using innerHTML.',
            file: filePath,
            line: i + 1,
            column: m.index + 1,
            source: 'static',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC_SQL_CONCAT',
    severity: 'error',
    check: (content, filePath, language) => {
      if (language === 'python') return [];
      const findings: Finding[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const concatRe = /(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)[^;]{0,200}\+\s*[^\s"']/gi;
        const templateRe = /(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)[^;`]*\$\{/gi;
        for (const re2 of [concatRe, templateRe]) {
          let m: RegExpExecArray | null;
          while ((m = re2.exec(lines[i])) !== null) {
            findings.push({
              id: 'SEC_SQL_CONCAT',
              category: 'security',
              severity: 'error',
              title: 'SQL query built with string concatenation',
              message: `SQL query built by concatenating strings or using template literals with variables is vulnerable to SQL injection.`,
              suggestion: 'Use parameterized queries or a query builder. Never interpolate user input into SQL strings.',
              file: filePath,
              line: i + 1,
              column: m.index + 1,
              source: 'static',
            });
          }
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC_HARDCODED_SECRET',
    severity: 'error',
    check: (content, filePath, language) => {
      const findings: Finding[] = [];
      const lines = content.split('\n');
      const secretRe = /\b(?:api[_.]?key|apikey|secret|token|password|passwd|credential|auth[_.]?token)\s*[=:]\s*['"]([^'"]+)['"]/gi;
      for (let i = 0; i < lines.length; i++) {
        let m: RegExpExecArray | null;
        while ((m = secretRe.exec(lines[i])) !== null) {
          const val = m[1];
          const redacted = val.length <= 8 ? val : val.slice(0, 4) + '...' + val.slice(-4);
          findings.push({
            id: 'SEC_HARDCODED_SECRET',
            category: 'security',
            severity: 'error',
            title: 'Hardcoded secret or credential',
            message: `A credential-sounding value was found hardcoded in the source. Value: "${redacted}".`,
            suggestion: 'Store secrets in environment variables, a secrets manager (e.g. Azure Key Vault, AWS Secrets Manager), or a .env file loaded at runtime.',
            file: filePath,
            line: i + 1,
            column: m.index + 1,
            source: 'static',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC_WEAK_CRYPTO',
    severity: 'warning',
    check: (content, filePath, language) => {
      if (language === 'python') return [];
      const findings: Finding[] = [];
      const lines = content.split('\n');
      const weakRe = /create(?:Hash|Hmac)\s*\(\s*['"](md5|sha1)['"]\s*\)|crypto\.subtle\.digest\s*\(\s*['"]SHA-1['"]\s*\)/gi;
      for (let i = 0; i < lines.length; i++) {
        let m: RegExpExecArray | null;
        while ((m = weakRe.exec(lines[i])) !== null) {
          findings.push({
            id: 'SEC_WEAK_CRYPTO',
            category: 'security',
            severity: 'warning',
            title: 'Use of weak cryptographic algorithm',
            message: `MD5 and SHA-1 are cryptographically broken and should not be used for security purposes.`,
            suggestion: 'Use SHA-256 or stronger for security purposes. MD5/SHA1 are broken for cryptographic use.',
            file: filePath,
            line: i + 1,
            column: m.index + 1,
            source: 'static',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC_PROTOTYPE_POLLUTION',
    severity: 'warning',
    check: (content, filePath, language) => {
      if (language === 'python') return [];
      const findings: Finding[] = [];
      const lines = content.split('\n');
      const protoRe = /Object\.assign\s*\(\s*(?!\{\s*\})|merge\s*\(\s*true\s*,|\.__proto__\s*=/g;
      for (let i = 0; i < lines.length; i++) {
        let m: RegExpExecArray | null;
        while ((m = protoRe.exec(lines[i])) !== null) {
          findings.push({
            id: 'SEC_PROTOTYPE_POLLUTION',
            category: 'security',
            severity: 'warning',
            title: 'Potential prototype pollution vulnerability',
            message: `Object.assign or merge patterns with user input can lead to prototype pollution if the source object contains __proto__ keys.`,
            suggestion: 'Use Object.assign({}, source) with an empty target, or use Object.create(null) for safe object creation. Filter out __proto__ keys.',
            file: filePath,
            line: i + 1,
            column: m.index + 1,
            source: 'static',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC_PICKLE',
    severity: 'error',
    check: (content, filePath, language) => {
      if (language !== 'python') return [];
      const findings: Finding[] = [];
      const lines = content.split('\n');
      const pickleRe = /pickle\.(?:loads|load)\s*\(/g;
      for (let i = 0; i < lines.length; i++) {
        let m: RegExpExecArray | null;
        while ((m = pickleRe.exec(lines[i])) !== null) {
          const afterParen = lines[i].slice(m.index + m[0].length);
          const trimmed = afterParen.trimStart();
          if (/^[rRfFubUB]*["']/.test(trimmed)) continue;
          findings.push({
            id: 'SEC_PICKLE',
            category: 'security',
            severity: 'error',
            title: 'Deserializing untrusted pickle data',
            message: `pickle.loads() and pickle.load() can execute arbitrary code when deserializing untrusted data.`,
            suggestion: 'Never deserialize pickle data from untrusted sources. Use JSON or a safe serialization format instead.',
            file: filePath,
            line: i + 1,
            column: m.index + 1,
            source: 'static',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC_SHELL_INJECT',
    severity: 'error',
    check: (content, filePath, language) => {
      if (language !== 'python') return [];
      const findings: Finding[] = [];
      const lines = content.split('\n');
      const shellRe = /subprocess\.(?:call|run|Popen|check_call|check_output)\s*\([^)]*shell\s*=\s*True/g;
      for (let i = 0; i < lines.length; i++) {
        if (shellRe.test(lines[i])) {
          findings.push({
            id: 'SEC_SHELL_INJECT',
            category: 'security',
            severity: 'error',
            title: 'Shell injection via subprocess with shell=True',
            message: `Using shell=True with subprocess functions can lead to shell injection if the command string contains user-controlled input.`,
            suggestion: 'Use shell=False with a list of arguments, or sanitize input with shlex.quote().',
            file: filePath,
            line: i + 1,
            column: 1,
            source: 'static',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'SEC_YAML_LOAD',
    severity: 'warning',
    check: (content, filePath, language) => {
      if (language !== 'python') return [];
      const findings: Finding[] = [];
      const lines = content.split('\n');
      const yamlLoadRe = /\byaml\.load\s*\(/g;
      for (let i = 0; i < lines.length; i++) {
        let m: RegExpExecArray | null;
        while ((m = yamlLoadRe.exec(lines[i])) !== null) {
          const rest = lines[i].slice(m.index + m[0].length);
          if (rest.includes('SafeLoader') || rest.includes('Loader=yaml.SafeLoader')) continue;
          findings.push({
            id: 'SEC_YAML_LOAD',
            category: 'security',
            severity: 'warning',
            title: 'yaml.load() without SafeLoader',
            message: `yaml.load() without Loader=yaml.SafeLoader can execute arbitrary Python when parsing malicious YAML.`,
            suggestion: 'Use yaml.safe_load() instead. yaml.load() can execute arbitrary Python when parsing malicious YAML.',
            file: filePath,
            line: i + 1,
            column: m.index + 1,
            source: 'static',
          });
        }
      }
      return findings;
    },
  },
];

export function createSecurityRule(): Rule {
  return {
    id: 'security',
    category: 'security',
    severity: 'error',
    language: 'all',
    check(content: string, filePath: string, language: Language): Finding[] {
      return rules.flatMap((r) => r.check(content, filePath, language));
    },
  };
}
