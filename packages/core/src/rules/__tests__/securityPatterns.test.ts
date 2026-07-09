import { describe, it, expect } from 'vitest';
import { createSecurityRule } from '../securityPatterns';
import type { Language } from '../../types';

const rule = createSecurityRule();

function check(content: string, lang: Language = 'typescript', file = 'test.ts') {
  return rule.check(content, file, lang);
}

function hasId(id: string, findings: ReturnType<typeof check>) {
  return findings.some((f) => f.id === id);
}

describe('securityPatterns', () => {
  describe('SEC_EVAL — eval() with dynamic input', () => {
    it('detects eval() with a variable', () => {
      const findings = check('const result = eval(userInput);');
      expect(hasId('SEC_EVAL', findings)).toBe(true);
    });

    it('skips eval() with a string literal', () => {
      const findings = check('const result = eval("2+2");');
      expect(hasId('SEC_EVAL', findings)).toBe(false);
    });
  });

  describe('SEC_INNER_HTML — innerHTML assignment to non-literal', () => {
    it('detects innerHTML assignment with variable', () => {
      const findings = check('element.innerHTML = userContent;');
      expect(hasId('SEC_INNER_HTML', findings)).toBe(true);
    });

    it('skips innerHTML assignment with string literal', () => {
      const findings = check('element.innerHTML = "<p>Hello</p>";');
      expect(hasId('SEC_INNER_HTML', findings)).toBe(false);
    });
  });

  describe('SEC_SQL_CONCAT — SQL query string concatenation', () => {
    it('detects SQL query built with string concatenation', () => {
      const findings = check("db.query('SELECT * FROM users WHERE id = ' + userId);");
      expect(hasId('SEC_SQL_CONCAT', findings)).toBe(true);
    });

    it('skips SQL query with parameterized query', () => {
      const findings = check("db.query('SELECT * FROM users WHERE id = $1', [userId]);");
      expect(hasId('SEC_SQL_CONCAT', findings)).toBe(false);
    });
  });

  describe('SEC_HARDCODED_SECRET — hardcoded credentials', () => {
    it('detects hardcoded API key', () => {
      const findings = check('const apiKey = "sk-abc123def456";');
      expect(hasId('SEC_HARDCODED_SECRET', findings)).toBe(true);
    });

    it('skips environment variable reference for secret', () => {
      const findings = check('const apiKey = process.env.API_KEY;');
      expect(hasId('SEC_HARDCODED_SECRET', findings)).toBe(false);
    });
  });

  describe('SEC_WEAK_CRYPTO — weak cryptographic algorithm', () => {
    it('detects MD5 usage', () => {
      const findings = check("const hash = createHash('md5').update(data).digest('hex');");
      expect(hasId('SEC_WEAK_CRYPTO', findings)).toBe(true);
    });

    it('skips SHA-256 usage', () => {
      const findings = check("const hash = createHash('sha256').update(data).digest('hex');");
      expect(hasId('SEC_WEAK_CRYPTO', findings)).toBe(false);
    });
  });

  describe('SEC_PROTOTYPE_POLLUTION — prototype pollution', () => {
    it('detects Object.assign with non-literal argument', () => {
      const findings = check('Object.assign(target, userInput);');
      expect(hasId('SEC_PROTOTYPE_POLLUTION', findings)).toBe(true);
    });

    it('skips safe Object.assign with literal target', () => {
      const findings = check('Object.assign({}, defaults);');
      expect(hasId('SEC_PROTOTYPE_POLLUTION', findings)).toBe(false);
    });
  });

  describe('SEC_PICKLE — Python pickle deserialization', () => {
    it('detects pickle.loads() with variable', () => {
      const findings = check('data = pickle.loads(user_input)', 'python');
      expect(hasId('SEC_PICKLE', findings)).toBe(true);
    });

    it('skips pickle.loads() with literal string', () => {
      const findings = check("data = pickle.loads(b'hello')", 'python');
      expect(hasId('SEC_PICKLE', findings)).toBe(false);
    });
  });

  describe('SEC_SHELL_INJECT — subprocess shell=True', () => {
    it('detects subprocess.call with shell=True', () => {
      const findings = check('subprocess.call(command, shell=True)', 'python');
      expect(hasId('SEC_SHELL_INJECT', findings)).toBe(true);
    });

    it('skips subprocess.call without shell=True', () => {
      const findings = check('subprocess.call([command], shell=False)', 'python');
      expect(hasId('SEC_SHELL_INJECT', findings)).toBe(false);
    });
  });

  describe('SEC_YAML_LOAD — yaml.load without SafeLoader', () => {
    it('detects yaml.load() without SafeLoader', () => {
      const findings = check('data = yaml.load(content)', 'python');
      expect(hasId('SEC_YAML_LOAD', findings)).toBe(true);
    });

    it('skips yaml.load() with SafeLoader', () => {
      const findings = check('data = yaml.load(content, Loader=yaml.SafeLoader)', 'python');
      expect(hasId('SEC_YAML_LOAD', findings)).toBe(false);
    });
  });
});
