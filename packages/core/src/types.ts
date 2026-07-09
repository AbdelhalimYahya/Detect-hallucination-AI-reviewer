/** Programming languages supported by the review engine. */
export type Language = 'typescript' | 'javascript' | 'python' | 'unknown';

/** Categories a finding can belong to. */
export type CheckCategory =
  | 'deprecated-api'
  | 'hallucinated-package'
  | 'security'
  | 'complexity'
  | 'convention';

/**
 * Severity level of a finding.
 * Maps to LSP DiagnosticSeverity: error=red, warning=yellow, info=blue.
 */
export type Severity = 'error' | 'warning' | 'info';

/** A single issue found during code review. */
export interface Finding {
  /** Unique rule identifier, e.g. "DEPRECATED_URL_PARSE". */
  id: string;
  /** Category this finding belongs to. */
  category: CheckCategory;
  /** Severity level of the issue. */
  severity: Severity;
  /** Short human-readable title. */
  title: string;
  /** Plain-English explanation of the problem. */
  message: string;
  /** Concrete fix suggestion, specific to the finding. */
  suggestion: string;
  /** Relative file path where the issue was found. */
  file: string;
  /** 1-indexed line number. */
  line: number;
  /** 1-indexed column number. */
  column: number;
  /** 1-indexed end line number (optional). */
  endLine?: number;
  /** 1-indexed end column number (optional). */
  endColumn?: number;
  /** Whether this was caught by static analysis or an AI call. */
  source: 'static' | 'ai';
  /** Link to documentation for the rule (optional). */
  ruleUrl?: string;
}

/** Results of reviewing a single file. */
export interface FileReview {
  /** Relative file path. */
  file: string;
  /** Detected programming language. */
  language: Language;
  /** All findings for this file. */
  findings: Finding[];
  /** ISO timestamp if this result came from cache. */
  cachedAt?: string;
  /** AI tokens consumed (0 if static-only). */
  tokensUsed?: number;
}

/** Overall result of a scan. */
export interface ReviewResult {
  /** Path or folder scanned. */
  target: string;
  /** ISO timestamp of when the scan was performed. */
  scannedAt: string;
  /** Number of files reviewed. */
  filesReviewed: number;
  /** Total number of findings across all files. */
  totalFindings: number;
  /** Breakdown of findings by category. */
  byCategory: Record<CheckCategory, number>;
  /** Breakdown of findings by severity. */
  bySeverity: Record<Severity, number>;
  /** Per-file review results. */
  files: FileReview[];
  /** Total AI tokens consumed across all files. */
  totalTokensUsed: number;
  /** Estimated cost in USD for the scan. */
  estimatedCostUsd: number;
}

/** Configuration loaded from aireview.config.json. */
export interface ReviewConfig {
  /** Anthropic API key. Can also come from the ANTHROPIC_API_KEY env var. */
  anthropicApiKey?: string;
  /** Model to use for AI checks. Default: "claude-haiku-4-5". */
  model?: string;
  /** List of team conventions in plain English. */
  conventions?: string[];
  /** Glob patterns to skip during scanning. */
  ignorePatterns?: string[];
  /** Toggle individual check categories on or off. */
  checks?: {
    /** Check for deprecated APIs. Default: true. */
    deprecatedApis?: boolean;
    /** Check for hallucinated packages. Default: true. */
    hallucinatedPackages?: boolean;
    /** Check for security issues. Default: true. */
    security?: boolean;
    /** Check for unnecessary complexity. Default: true. */
    complexity?: boolean;
    /** Check for convention violations. Default: true (only if conventions array is set). */
    conventions?: boolean;
  };
  /** Which languages to scan. Defaults to all supported. */
  languages?: Language[];
}

/** Interface for implementing a static analysis rule. */
export interface Rule {
  /** Unique rule identifier. */
  id: string;
  /** Category this rule checks. */
  category: CheckCategory;
  /** Default severity for findings from this rule. */
  severity: Severity;
  /** Language this rule applies to, or "all" for all languages. */
  language: Language | 'all';
  /**
   * Run the rule against file content.
   * @param content - The full file content as a string.
   * @param filePath - Relative file path.
   * @param language - Detected language of the file.
   * @returns Array of findings.
   */
  check(content: string, filePath: string, language: Language): Finding[];
}
