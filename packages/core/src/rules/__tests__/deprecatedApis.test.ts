import { describe, it, expect } from 'vitest';
import { createDeprecatedApiRule } from '../deprecatedApis';

const rule = createDeprecatedApiRule();

describe('createDeprecatedApiRule', () => {
  it('finds url.parse() in TypeScript code', () => {
    const content = `import url from 'url';\nurl.parse('http://example.com');\n`;
    const findings = rule.check(content, 'test.ts', 'typescript');

    const urlParseFinding = findings.find((f) => f.id === 'DEPRECATED_URL_PARSE');
    expect(urlParseFinding).toBeDefined();
    expect(urlParseFinding!.line).toBe(2);
    expect(urlParseFinding!.column).toBe(1);
    expect(urlParseFinding!.suggestion).toContain('new URL');
    expect(urlParseFinding!.severity).toBe('warning');
    expect(urlParseFinding!.source).toBe('static');
  });

  it('skips url.parse inside a single-line comment', () => {
    const content = `import url from 'url';\n// url.parse('http://example.com');\n`;
    const findings = rule.check(content, 'test.ts', 'typescript');

    const urlParseFinding = findings.find((f) => f.id === 'DEPRECATED_URL_PARSE');
    expect(urlParseFinding).toBeUndefined();
  });

  it('skips url.parse inside a block comment', () => {
    const content = `import url from 'url';\n/*\nurl.parse('http://example.com');\n*/\n`;
    const findings = rule.check(content, 'test.ts', 'typescript');

    const urlParseFinding = findings.find((f) => f.id === 'DEPRECATED_URL_PARSE');
    expect(urlParseFinding).toBeUndefined();
  });

  it('finds componentWillMount in React code', () => {
    const content = `class MyComponent extends React.Component {\n  componentWillMount() {\n    // setup\n  }\n}\n`;
    const findings = rule.check(content, 'test.tsx', 'typescript');

    const cwmFinding = findings.find((f) => f.id === 'DEPRECATED_COMPONENT_WILL_MOUNT');
    expect(cwmFinding).toBeDefined();
    expect(cwmFinding!.line).toBe(2);
    expect(cwmFinding!.column).toBe(3);
    expect(cwmFinding!.category).toBe('deprecated-api');
    expect(cwmFinding!.source).toBe('static');
  });

  it('finds optparse in Python code', () => {
    const content = `import optparse\nparser = optparse.OptionParser()\n`;
    const findings = rule.check(content, 'test.py', 'python');

    const optparseFinding = findings.find((f) => f.id === 'DEPRECATED_OPTPARSE');
    expect(optparseFinding).toBeDefined();
    expect(optparseFinding!.line).toBe(1);
    expect(optparseFinding!.column).toBe(1);
    expect(optparseFinding!.source).toBe('static');
  });

  it('skips optparse inside a Python comment', () => {
    const content = `# import optparse\n# optparse is deprecated\n`;
    const findings = rule.check(content, 'test.py', 'python');

    const optparseFinding = findings.find((f) => f.id === 'DEPRECATED_OPTPARSE');
    expect(optparseFinding).toBeUndefined();
  });

  it('returns empty array for clean code', () => {
    const content = `const x = 1;\nconst y = 2;\n`;
    const findings = rule.check(content, 'clean.ts', 'typescript');

    expect(findings).toEqual([]);
  });

  it('returns empty array for unknown language', () => {
    const content = `url.parse('test');\n`;
    const findings = rule.check(content, 'test.txt', 'unknown');

    expect(findings).toEqual([]);
  });

  it('finds multiple occurrences of the same pattern', () => {
    const content = `url.parse('a');\nurl.parse('b');\nurl.parse('c');\n`;
    const findings = rule.check(content, 'test.ts', 'typescript');

    const urlParseFindings = findings.filter((f) => f.id === 'DEPRECATED_URL_PARSE');
    expect(urlParseFindings).toHaveLength(3);
    expect(urlParseFindings[0].line).toBe(1);
    expect(urlParseFindings[1].line).toBe(2);
    expect(urlParseFindings[2].line).toBe(3);
  });

  it('finds patterns in code even when same pattern exists in a comment', () => {
    const content = `// url.parse is deprecated\nurl.parse('http://x.com');\n`;
    const findings = rule.check(content, 'test.ts', 'typescript');

    const urlParseFindings = findings.filter((f) => f.id === 'DEPRECATED_URL_PARSE');
    expect(urlParseFindings).toHaveLength(1);
    expect(urlParseFindings[0].line).toBe(2);
  });
});
