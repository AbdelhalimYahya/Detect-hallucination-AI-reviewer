# ai-review — Build Plan
### "Grammarly for AI-Generated Code"

A free, local-first tool that reviews AI-generated code for deprecated APIs,
hallucinated packages, security issues, unnecessary complexity, and convention
violations. Ships as a CLI (terminal) and as a VS Code / Cursor extension
via the Language Server Protocol (LSP).

---

## Why this architecture is the cheapest and smartest

The biggest cost mistake in AI review tools is sending code to an LLM for
everything. This tool does the opposite:

1. Static analysis runs first — it's instant and costs $0.00
2. An AI call is only made if static analysis can't catch the issue
3. Every analyzed file is cached by SHA-256 hash — a file analyzed once is
   never re-analyzed until it changes
4. All AI checks for a file are batched into a single API call (never one
   call per issue)
5. Claude Haiku is used by default — the cheapest model, fast enough for
   inline code review, still highly capable

In practice: most scans cost $0.00 (static hits). A genuinely new file
reviewed for the first time costs ~$0.001. A team of 5 running this daily
would spend under $3/month.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript / Node.js | Matches your existing stack; works for both CLI and LSP |
| CLI framework | `commander` | Minimal, well-maintained |
| LSP library | `vscode-languageserver` | Official, used by ESLint, Ruff, SonarLint |
| VS Code client | `vscode-languageclient` | Official companion to the above |
| AI calls | Anthropic SDK (`@anthropic-ai/sdk`) | Claude Haiku by default |
| File hashing | Node.js built-in `crypto` | No extra dependency |
| Report styling | `chalk` + `cli-table3` | Same as MCP scanner |
| Testing | `vitest` | Fast, TypeScript-native |
| Package cache | `node-fetch` + local JSON | Check npm/PyPI without heavy deps |
| Distribution | npm + VS Code Marketplace | Two distribution channels, one codebase |

---

## How to use this document

Tasks are small enough to hand to an AI coding agent one at a time.
Work through them in order — each phase builds on the last.

Every task gives you:
- **Goal** — what this accomplishes
- **Agent prompt** — copy this directly to your coding agent
- **Done when** — the acceptance criteria
- **How you test it** — exact steps YOU run before moving on

Do not skip the test steps. A review tool with false positives gets
uninstalled. Accuracy is the product.

---

## Project structure (what you are building toward)

```
ai-review/
├── packages/
│   ├── core/               ← shared engine (rules, cache, AI caller, types)
│   ├── cli/                ← npx ai-review
│   └── vscode/             ← VS Code extension + LSP server
├── fixtures/               ← test corpus (good and bad code samples)
├── databases/              ← deprecated API JSON files per language
└── docs/
```

Use a monorepo so the CLI and the VS Code extension share the same core
engine without duplicating code.

---

## Phase 0 — Project Foundations

### Task 0.1 — Initialize the monorepo

**Goal:** Working TypeScript monorepo with three packages wired together.

**Agent prompt:**
```
Create a TypeScript monorepo called "ai-review" using npm workspaces.

Structure:
  packages/core/     — shared library, no entry point yet, just tsconfig
  packages/cli/      — will become the CLI tool
  packages/vscode/   — will become the VS Code extension

Root-level setup:
- package.json with "workspaces": ["packages/*"]
- TypeScript 5.x with strict mode, shared tsconfig.base.json at root
- Each package extends the base tsconfig
- ESLint + Prettier shared config at root
- vitest at root level, each package can add its own tests
- .gitignore covering node_modules, dist, .env, *.vsix
- Scripts at root: "build" (builds all packages), "test" (runs all tests),
  "dev" (watches all packages)
- Initialize git with an initial commit

Each package/core and packages/cli should be a plain TypeScript library.
packages/vscode will be configured as a VS Code extension in a later task.
```

**Done when:** `npm run build` from root compiles all three packages with zero errors.

**How you test it:**
1. `npm install` from root
2. `npm run build` — zero errors, `dist/` appears in each package
3. `npx tsc --noEmit` from root — zero type errors
4. Confirm the three `packages/` directories each have their own `package.json`
   and `tsconfig.json` extending the root base

---

### Task 0.2 — Define the core data model

**Goal:** Lock down every shared type before writing any logic. Prevents the
agent from inventing incompatible types in later tasks.

**Agent prompt:**
```
In packages/core/src/types.ts, define and export all shared TypeScript types:

1. Language = "typescript" | "javascript" | "python" | "unknown"

2. CheckCategory =
     "deprecated-api"
     | "hallucinated-package"
     | "security"
     | "complexity"
     | "convention"

3. Severity = "error" | "warning" | "info"
   (maps to LSP DiagnosticSeverity: error=red, warning=yellow, info=blue)

4. Finding:
   - id: string             unique rule id, e.g. "DEPRECATED_URL_PARSE"
   - category: CheckCategory
   - severity: Severity
   - title: string          short human-readable title
   - message: string        plain-English explanation of the problem
   - suggestion: string     concrete fix, specific to the finding
   - file: string           relative file path
   - line: number           1-indexed line number
   - column: number         1-indexed column
   - endLine?: number
   - endColumn?: number
   - source: "static" | "ai"   whether this was caught by static analysis
                                or an AI call
   - ruleUrl?: string       link to docs if applicable

5. FileReview:
   - file: string
   - language: Language
   - findings: Finding[]
   - cachedAt?: string      ISO timestamp if this result came from cache
   - tokensUsed?: number    AI tokens consumed (0 if static-only)

6. ReviewResult:
   - target: string         path or folder scanned
   - scannedAt: string      ISO timestamp
   - filesReviewed: number
   - totalFindings: number
   - byCategory: Record<CheckCategory, number>
   - bySeverity: Record<Severity, number>
   - files: FileReview[]
   - totalTokensUsed: number
   - estimatedCostUsd: number

7. ReviewConfig (loaded from aireview.config.json):
   - anthropicApiKey?: string   can also come from ANTHROPIC_API_KEY env var
   - model?: string             default: "claude-haiku-4-5"
   - conventions?: string[]     list of team conventions in plain English
   - ignorePatterns?: string[]  glob patterns to skip
   - checks?: {
       deprecatedApis?: boolean   default true
       hallucinatedPackages?: boolean  default true
       security?: boolean         default true
       complexity?: boolean       default true
       conventions?: boolean      default true (only if conventions array set)
     }
   - languages?: Language[]     which languages to scan, default all supported

8. Rule interface (for static analyzers):
   - id: string
   - category: CheckCategory
   - severity: Severity
   - language: Language | "all"
   - check(content: string, filePath: string, language: Language): Finding[]

Add JSDoc on every field. Export everything from packages/core/src/index.ts.
```

**Done when:** `npx tsc --noEmit` passes with zero errors after adding the types.

**How you test it:**
1. `npx tsc --noEmit` — zero errors
2. Read the types yourself. Ask: can I build the terminal report, the LSP
   diagnostic, and the HTML report from just `ReviewResult`? If yes, the
   model is complete. If you find yourself needing a field that's missing,
   add it now before 10 tasks depend on this shape.

---

### Task 0.3 — Config loader

**Goal:** Load `aireview.config.json` from the project being scanned, with
sensible defaults for every missing field.

**Agent prompt:**
```
In packages/core/src/config.ts, create:

  loadConfig(rootDir: string): Promise<ReviewConfig>

It should:
1. Look for aireview.config.json in rootDir; if not found, walk up to
   parent directories until reaching the filesystem root (same strategy
   ESLint uses for config discovery)
2. If no config file found anywhere, return a default ReviewConfig with
   all checks enabled, model: "claude-haiku-4-5", no conventions
3. Validate the loaded JSON against the ReviewConfig shape using zod —
   throw a clear error message if the file exists but is malformed (don't
   silently ignore bad config)
4. Merge file config with environment: if ANTHROPIC_API_KEY env var is set,
   it takes precedence over the value in the config file
5. Export a generateDefaultConfig() function that writes a starter
   aireview.config.json to a given path (for the `ai-review init` command)

Write a vitest test covering: no config file (returns defaults), a valid
config file (correctly merged), a malformed config file (throws with a
clear message), and env var override of API key.
```

**Done when:** all tests pass and the zod validation gives a human-readable
error when a field has the wrong type.

**How you test it:**
1. `npm test`
2. Create a temp `aireview.config.json` with a deliberate typo (e.g.
   `"model": 123` instead of a string), run the config loader manually,
   confirm the error message tells you exactly which field is wrong —
   not a generic JSON parse error

---

## Phase 1 — Static Analyzers (Free, No API Cost)

Static checks run on every file, every time, with zero API calls. They catch
the most common and most obvious AI mistakes instantly.

### Task 1.1 — File walker and language detector

**Goal:** Walk a directory, find reviewable files, detect their language.

**Agent prompt:**
```
In packages/core/src/scanner/fileWalker.ts:

  walkFiles(rootDir: string, config: ReviewConfig): Promise<Array<{
    path: string
    language: Language
    content: string
  }>>

It should:
1. Recursively walk rootDir
2. Skip directories: node_modules, .git, dist, build, .next, __pycache__,
   venv, .venv, coverage, .nyc_output
3. Skip files matching any pattern in config.ignorePatterns
4. Skip files over 500KB (avoid processing minified bundles)
5. Include only files with extensions:
   .ts, .tsx → "typescript"
   .js, .jsx, .mjs, .cjs → "javascript"
   .py → "python"
6. Filter by config.languages if set (skip languages not in the list)
7. Read each file's content as UTF-8
8. Return array of {path (relative to rootDir), language, content}

Write a vitest test with a temp directory containing files of different
types, a node_modules folder, and an oversized file. Assert the correct
files are returned with correct language detection and node_modules is
excluded.
```

**Done when:** test passes. Pay special attention to the node_modules
exclusion — this is the #1 false positive source if skipped.

**How you test it:**
1. `npm test`
2. Run it manually against a real Next.js project folder you have locally.
   Confirm it skips node_modules, finds `.ts`/`.tsx` files, and doesn't
   choke on big lockfiles.

---

### Task 1.2 — Deprecated API database

**Goal:** Build the knowledge base of deprecated patterns before writing
the checker. This is the most valuable static asset in the whole tool.

**Agent prompt:**
```
Create databases/ at the project root (not inside packages/).
Inside it, create three JSON files:

databases/deprecated-node.json
An array of objects:
{
  "id": "DEPRECATED_URL_PARSE",
  "pattern": "url.parse(",
  "title": "url.parse() is deprecated",
  "message": "url.parse() was deprecated in Node.js 11.0. It has known
              security issues with certain inputs.",
  "suggestion": "Use `new URL(urlString)` instead. The URL class is
                 globally available in Node.js 10+ and all browsers.",
  "docsUrl": "https://nodejs.org/api/url.html#urlparseurlstring-parsequerystring-slashesdenotehost",
  "severity": "warning"
}

Populate with at least 20 real deprecated Node.js patterns including:
url.parse, url.resolve, new Buffer(), require('punycode') (moved to userland),
require('querystring') (use URLSearchParams), fs.exists, domain module usage,
crypto.createCipher (use createCipheriv), process.binding(), _stream_*
internal imports, require('sys'), require('_linklist')

databases/deprecated-react.json
At least 15 entries covering:
componentWillMount, componentWillReceiveProps, componentWillUpdate,
ReactDOM.render (replaced by createRoot in React 18),
findDOMNode, string refs (ref="myRef"), legacy Context API
(childContextTypes/contextTypes/getChildContext), React.createClass,
PropTypes from 'react' (use 'prop-types' package),
React.Factory functions, createReactClass

databases/deprecated-python.json
At least 15 entries covering:
optparse (use argparse), commands module (use subprocess), urllib2 (Python 2),
httplib (Python 2), urlparse (Python 2, use urllib.parse), imp module
(use importlib), collections.Callable (use collections.abc.Callable),
asynchat, asyncore, cgi module deprecated in 3.11, pipes module,
distutils (deprecated in 3.10, removed in 3.12)

Each entry must have: id, pattern (string to search for),
title, message, suggestion, docsUrl, severity ("error"|"warning"|"info").
These are plain text pattern strings, not regexes — the checker in the
next task will handle matching.
```

**Done when:** all three JSON files exist and are valid JSON (run
`node -e "require('./databases/deprecated-node.json')"` etc.).

**How you test it:**
1. `node -e "require('./databases/deprecated-node.json').forEach(r => { if (!r.id || !r.pattern || !r.suggestion) throw new Error('Missing field: ' + r.id) })"` — should exit cleanly
2. Read through the entries yourself. Are these real, accurate deprecations?
   Look up 3-4 of them in the official docs to confirm. Wrong deprecation
   info in the database = credibility-destroying false positives.

---

### Task 1.3 — Deprecated API checker

**Goal:** Use the database to find deprecated patterns in real code files.

**Agent prompt:**
```
In packages/core/src/rules/deprecatedApis.ts, implement the Rule interface.

The check() function should:
1. Load the appropriate database based on the language parameter:
   - "typescript" | "javascript" → deprecated-node.json + deprecated-react.json
   - "python" → deprecated-python.json
   - "unknown" → return []
2. For each database entry, search the file content for the pattern string
3. When found, calculate the exact line number and column
4. Return a Finding for each match with source: "static"

Important edge cases to handle:
- Skip matches inside single-line comments (// or #)
- Skip matches inside multi-line block comments (/* */ or ''' ''')
- Skip matches inside string literals ONLY if the pattern is clearly a
  string value (e.g. don't skip `const x = url.parse(y)` just because
  "url.parse" appears in a nearby string)
- If the same pattern appears multiple times in a file, return one
  Finding per occurrence (not just the first one)

Write a vitest test with:
- A TypeScript file using url.parse() — should trigger DEPRECATED_URL_PARSE
- A file with url.parse inside a comment — should NOT trigger
- A React file using componentWillMount — should trigger
- A Python file using optparse — should trigger
- A file with none of the patterns — should return []
```

**Done when:** all tests pass including the comment-skipping tests.

**How you test it:**
1. `npm test`
2. Create a scratch TS file with `import url from 'url'; url.parse('http://x.com')` and
   run the checker against it — confirm a finding comes back with the right
   line number, and the suggestion tells you to use `new URL()`
3. Wrap the same code in a `/* block comment */` and confirm zero findings

---

### Task 1.4 — Hallucinated package checker

**Goal:** Catch AI-invented npm and PyPI package names that don't exist.

**Agent prompt:**
```
In packages/core/src/rules/hallucinatedPackages.ts, implement the Rule interface.

Step 1 — Extract package names from the file:
- For TypeScript/JavaScript: find all `import X from 'package'`,
  `import 'package'`, `require('package')` statements
- For Python: find all `import package`, `from package import X` statements
- Only check third-party packages: skip Node.js built-ins (the "node:"
  prefix, and a hardcoded list of built-in module names like fs, path,
  crypto, os, etc.) and relative imports (starting with . or /)

Step 2 — Check each package against the registry:
- For npm packages: hit https://registry.npmjs.org/{package-name} (HEAD
  request only — cheap, fast). 404 = package doesn't exist.
- For Python packages: hit https://pypi.org/pypi/{package-name}/json (HEAD
  request). 404 = doesn't exist.
- Cache registry responses in memory for the duration of the scan (avoid
  checking the same package twice in one run)
- If the registry is unreachable (network error), skip the check and log
  a warning — do NOT report it as a finding. Fail gracefully.

Step 3 — Return findings:
- If a package 404s: Finding with severity "error", title "Package does
  not exist on npm/PyPI", message explains this is a common AI hallucination
  pattern, suggestion is to verify the package name or find the real
  alternative.

Write a vitest test using mocked fetch (don't hit the real network in tests):
- A file importing 'react' (should pass — it exists)
- A file importing 'totally-fake-ai-invented-package-xyz' (mocked 404 —
  should flag)
- A file importing 'fs' (built-in — should skip entirely)
- A file importing './utils' (relative — should skip entirely)
- Network timeout scenario (should warn, not crash)
```

**Done when:** all tests pass with mocked network, and the real-network
graceful-degradation path is tested.

**How you test it:**
1. `npm test`
2. Create a scratch file importing a clearly fake package name and run
   the real checker (with real network) — confirm it's flagged as non-existent
3. Run against your real TryToTrack project and confirm zero false positives
   on legitimate packages like `next`, `@supabase/supabase-js`, etc.

---

### Task 1.5 — Security pattern checker

**Goal:** Catch the security issues that AI code generators introduce
systematically.

**Agent prompt:**
```
In packages/core/src/rules/securityPatterns.ts, implement the Rule interface.
id prefix: "SEC_*", category: "security".

Detect the following patterns:

JavaScript/TypeScript:
1. SEC_EVAL — eval() with dynamic input (eval(variable) but not eval("literal"))
   severity: error
   suggestion: Never use eval(). Parse JSON with JSON.parse(), execute
   operations with explicit function calls.

2. SEC_INNER_HTML — element.innerHTML = variable (assignment of non-literal)
   severity: warning
   suggestion: Use textContent for plain text, or sanitize with DOMPurify
   before using innerHTML.

3. SEC_SQL_CONCAT — SQL query built with string concatenation or template
   literals containing variables: patterns like `SELECT * FROM ${` or
   `"SELECT" + variable`
   severity: error
   suggestion: Use parameterized queries or a query builder. Never
   interpolate user input into SQL strings.

4. SEC_HARDCODED_SECRET — Same detection as MCP scanner: API keys, tokens,
   passwords assigned to variables with credential-sounding names. Redact
   the value in the snippet (first 4, last 4 chars only).
   severity: error

5. SEC_WEAK_CRYPTO — Usage of MD5 or SHA1 for security purposes:
   createHash('md5'), createHash('sha1'), crypto.subtle.digest('SHA-1')
   severity: warning
   suggestion: Use SHA-256 or stronger for security purposes. MD5/SHA1
   are broken for cryptographic use.

6. SEC_PROTOTYPE_POLLUTION — Object.assign(target, userInput) where target
   appears to be a shared object, or merge patterns that don't filter __proto__
   severity: warning

Python:
7. SEC_PICKLE — pickle.loads() or pickle.load() with any non-literal input
   severity: error
   suggestion: Never deserialize pickle data from untrusted sources. Use
   JSON or a safe serialization format instead.

8. SEC_SHELL_INJECT — subprocess.call/run/Popen with shell=True and a
   variable in the command
   severity: error
   suggestion: Use shell=False with a list of arguments, or sanitize
   input with shlex.quote().

9. SEC_YAML_LOAD — yaml.load() without Loader=yaml.SafeLoader
   severity: warning
   suggestion: Use yaml.safe_load() instead. yaml.load() can execute
   arbitrary Python when parsing malicious YAML.

Write a vitest test with one positive and one negative case per rule (the
negative should be a near-miss that should NOT trigger).
```

**Done when:** all 18 test cases pass (9 rules × 2 cases each).

**How you test it:**
1. `npm test`
2. For the SQL injection rule specifically: create a file with
   `db.query("SELECT * FROM users WHERE id = " + userId)` and confirm it's
   flagged. Then create one with `db.query("SELECT * FROM users WHERE id = $1",
   [userId])` and confirm it's NOT flagged. SQL false positives are the
   most annoying kind.

---

## Phase 2 — AI Analyzers (Smart, Cheap, Cached)

These run only when static analysis finishes and only on files where the AI
can add value that static analysis cannot.

### Task 2.1 — Result cache

**Goal:** Never pay for the same file twice. This is the core cost-optimization
mechanism.

**Agent prompt:**
```
In packages/core/src/cache/resultCache.ts:

The cache stores AI analysis results indexed by a SHA-256 hash of file content.

Exports:
  class ResultCache {
    constructor(cacheDir: string)  // default: ~/.ai-review/cache/
    async get(fileContent: string): Promise<FileReview | null>
    async set(fileContent: string, result: FileReview): Promise<void>
    async clear(): Promise<void>
    stats(): { entries: number; sizeKb: number }
  }

Implementation:
- Hash the file content with SHA-256 using Node.js built-in crypto
- Store results as individual JSON files named by hash:
  ~/.ai-review/cache/{sha256}.json
- On get(): return null if file doesn't exist OR if the cache entry is
  older than 30 days (stale)
- On set(): write the FileReview JSON to disk; include a "cachedAt" field
- Create the cache directory if it doesn't exist
- Handle all filesystem errors gracefully (never crash the scan if cache
  fails — just skip the cache and proceed with a fresh analysis)

Write a vitest test: store a result, retrieve it by the same content
(should return it), retrieve by different content (should return null),
and confirm a 31-day-old entry returns null.
```

**Done when:** tests pass and the cache directory is created in the right
location on your actual machine when you run a test scan.

**How you test it:**
1. `npm test`
2. Run the full scan (once Phase 3 is wired) on the same file twice — the
   second run should show "cached" in the output and use 0 tokens. This is
   how you know the cache is actually working end-to-end.

---

### Task 2.2 — AI batch caller

**Goal:** The single function that calls Claude. Every AI check in the tool
goes through here — this ensures we always batch into one call per file,
always use the configured model, and always track token usage.

**Agent prompt:**
```
In packages/core/src/ai/batchCaller.ts:

  async function reviewFileWithAI(params: {
    file: string
    language: Language
    content: string
    config: ReviewConfig
    enabledChecks: {
      complexity: boolean
      conventions: boolean
    }
  }): Promise<{
    findings: Finding[]
    tokensUsed: number
  }>

This function makes ONE Anthropic API call per file regardless of how many
checks are enabled. It does this by combining all checks into a single
structured prompt.

System prompt to use:
"""
You are a senior software engineer reviewing code that was likely generated
by an AI assistant. Your job is to identify specific, actionable issues in
the code. You must respond ONLY with a valid JSON object — no preamble, no
markdown, no explanation outside the JSON.
"""

Build the user prompt dynamically based on enabled checks:
- Always include the file content wrapped in triple backticks
- If complexity check enabled: ask it to identify functions or blocks that
  are unnecessarily complex, over-engineered, or where a much simpler
  approach exists — with specific line numbers
- If convention check enabled AND config.conventions is non-empty: include
  the conventions list and ask it to identify violations with specific
  line numbers

Request response format (enforce strictly in the prompt):
{
  "findings": [
    {
      "check": "complexity" | "convention",
      "line": number,
      "endLine": number,
      "title": string,
      "message": string,
      "suggestion": string
    }
  ]
}

After getting the response:
- Parse the JSON (handle malformed JSON gracefully — return empty findings,
  log the raw response for debugging, never crash)
- Map each AI finding to the Finding type from core/types.ts
- Set source: "ai" on all of them
- Return findings array + tokensUsed from the API response

Write a vitest test using a mocked Anthropic client:
- Happy path: mocked response with one complexity finding
- Malformed JSON response: should return [] findings and not throw
- API error / network failure: should return [] findings and not throw
```

**Done when:** the malformed-JSON and network-failure tests pass — these
are the cases most likely to cause a terrible user experience in production.

**How you test it:**
1. `npm test`
2. Once the full pipeline is wired (Phase 3), scan a real file with a
   genuinely over-engineered function (a 50-line function that could be 5
   lines) and confirm the AI catches it and gives a useful suggestion.

---

### Task 2.3 — Complexity check prompt engineering

**Goal:** The complexity check prompt is the hardest to get right — the AI
needs to give specific, non-obvious feedback, not generic platitudes.

**Agent prompt:**
```
This task is prompt engineering, not new code. Iterate on the complexity
section of the batchCaller.ts prompt.

The goal is to produce findings that feel like a senior engineer wrote them,
not a chatbot. Test against these 5 real code patterns and refine the prompt
until all 5 get useful, specific feedback:

Pattern 1: A function that reimplements Array.reduce() using a for loop
with an accumulator over 20+ lines.
Expected: AI should note that this is exactly what reduce() does and give
the 3-line equivalent.

Pattern 2: A function that uses a nested ternary 4 levels deep to map
strings to values.
Expected: AI should suggest a lookup object/Map instead.

Pattern 3: A function that makes 5 sequential await calls that are
independent of each other.
Expected: AI should suggest Promise.all() and explain the performance gain.

Pattern 4: A simple CRUD route handler that was wrapped in 3 unnecessary
abstraction layers (service → repository → adapter → actual DB call for
a 10-line operation).
Expected: AI should flag the unnecessary abstraction and suggest collapsing
the layers.

Pattern 5: A well-written, appropriately complex function that handles
real edge cases.
Expected: AI should return zero findings or only "info" level notes.
Pattern 5 is the most important — a false positive here means the tool
feels annoying and gets turned off.

Adjust the system/user prompt until all 5 patterns get correct responses.
Document what changes you made and why inside a comment block at the top
of batchCaller.ts.
```

**Done when:** you personally test all 5 patterns and the AI's response
is something you'd be comfortable sharing publicly as an example of what
this tool does.

**How you test it:**
1. Create a scratch file with each pattern, run the AI check, read the output
2. Ask yourself: is this feedback I would have been glad to receive if I
   were the developer who wrote this code? If yes, it's good. If it feels
   preachy or obvious, the prompt needs tuning.

---

## Phase 3 — Scan Orchestrator & Reports

### Task 3.1 — Scan orchestrator

**Goal:** Connect every Phase 1 and Phase 2 component into one pipeline.

**Agent prompt:**
```
In packages/core/src/scanner/runReview.ts:

  async function runReview(
    targetPath: string,
    config: ReviewConfig,
    onProgress?: (message: string) => void
  ): Promise<ReviewResult>

Pipeline:
1. Walk files via walkFiles()
2. For each file:
   a. Run all static rules (deprecated APIs, hallucinated packages, security
      patterns) — these run in parallel per rule, but sequentially per file
   b. Check the result cache: if a cache hit exists, use cached AI findings;
      if not, call reviewFileWithAI() for the AI checks
   c. Store AI results in cache after getting them
   d. Aggregate all findings into a FileReview
   e. Call onProgress("Reviewed: {filename} — {n} findings") after each file
3. Collect all FileReviews into a ReviewResult with totals and cost estimate

Cost estimate: use the Haiku input/output pricing ($0.00025 per 1K input
tokens, $0.00125 per 1K output tokens as of 2025 — hardcode as constants,
clearly labeled so they're easy to update).

Write a vitest integration test using the fixtures/corpus/ directory (to be
created in Phase 5). For now, create a minimal fixtures/test-basic/ with
one clean file and one file with a known deprecated API pattern, and assert
the ReviewResult has the expected findings count and the deprecated API
is caught.
```

**Done when:** the integration test passes and the onProgress callback is
called for each file (confirm this by checking the test asserts the callback
was called the right number of times).

**How you test it:**
1. `npm test`
2. Run the orchestrator manually against a real project folder. Does it
   finish without crashing? Does the progress output feel like watching
   something real happen (not frozen)?

---

### Task 3.2 — Terminal report

**Goal:** The first thing anyone sees. It must communicate the key result
in under 5 seconds of reading.

**Agent prompt:**
```
In packages/cli/src/report/terminalReport.ts:

  function printTerminalReport(result: ReviewResult): void

Using chalk and cli-table3, print in this order:

1. Header:
   ─────────────────────────────────────────
    ai-review — AI Code Review
    Target: ./src   |   Files: 12   |   2025-01-15 14:32
   ─────────────────────────────────────────

2. Summary table (4 columns: Category | Errors | Warnings | Info):
   Shows count per category. Color the Errors column red if > 0.

3. Findings grouped by severity (errors first, then warnings, then info):
   For each finding:
   ✗ [DEPRECATED_URL_PARSE] deprecated-api · warning
     packages/api/users.ts:42:5
     url.parse() is deprecated since Node.js 11
     → Use `new URL(urlString)` instead

4. If zero findings across all categories:
   ✓ No issues found. This code looks clean.
   (Print this in green. Make it feel like a real win.)

5. Footer:
   Cost this run: ~$0.0034 (1,820 cached tokens + 3,100 new tokens)
   Report saved: ./ai-review-report.html
   ──────────────────────────────────────────

Rules:
- Errors are red, warnings are yellow, info is blue
- The "→" suggestion line should be visually distinct (dimmed or indented)
- The footer cost line should always show, even if it's $0.0000
  (showing $0.0000 on a cached run is actually a good message)
```

**Done when:** running against the test fixture produces output you would
not be embarrassed to show someone.

**How you test it:**
1. Generate a report against a fixture with known findings and look at it
2. Actually screenshot it or copy/paste it. Would you put this in your
   LinkedIn post as a demo? The bar is: it needs to look intentional,
   not like a script output.

---

### Task 3.3 — HTML report

**Goal:** A shareable single-file report that looks professional in a browser.

**Agent prompt:**
```
In packages/cli/src/report/htmlReport.ts:

  function writeHtmlReport(result: ReviewResult, outputPath: string): void

Generate a single self-contained HTML file (inline CSS, no CDN dependencies,
no external fonts, everything embedded) with:

1. Top section:
   - Tool name and scan timestamp
   - Large summary card: total files, total findings, cost, time
   - Category breakdown as colored badge pills:
     Deprecated APIs: 3   Security: 1   Complexity: 2   Conventions: 0

2. Findings list (grouped by file, then by severity within each file):
   Each finding as a card showing:
   - File path + line number (as a clickable anchor to jump to that file's
     section in the report)
   - Category badge (color-coded)
   - Title (bold)
   - Message
   - Suggestion (green, with a lightbulb icon prefix: 💡)
   - "Source: AI" or "Source: static" label in small dimmed text

3. Footer: "Generated by ai-review · github.com/[your-handle]/ai-review"

Design requirements:
- Clean, minimal, professional
- Uses only web-safe fonts (system font stack)
- Works in dark mode (uses prefers-color-scheme media query)
- Responsive down to 600px wide (someone might open it on mobile)
- The whole thing must fit in one file — no external resources

Write a vitest test asserting the HTML file is created, is non-empty, and
contains the expected finding count and at least one finding title from
the fixture result.
```

**Done when:** the HTML file, opened in an actual browser, looks like
something a real tool would generate — not a homework project.

**How you test it:**
1. `npm test`
2. Open the generated HTML file in Chrome. Does it look good? Check dark
   mode (in devtools). Check on a narrow window. If it looks bad, it's
   not done — this is what you'll screenshot for LinkedIn.

---

### Task 3.4 — CLI wiring and commands

**Goal:** Wire everything into the actual `npx ai-review` command.

**Agent prompt:**
```
In packages/cli/src/cli.ts, set up a commander CLI with these commands:

COMMAND: scan <target>
  Runs the full review pipeline on a local folder path.
  Flags:
    --json <path>          save JSON report (default: ./ai-review-report.json)
    --html <path>          save HTML report (default: ./ai-review-report.html)
    --no-html              skip HTML report
    --no-cache             bypass cache and re-analyze everything
    --min-severity <level> only show findings at or above this level
                           in terminal (error|warning|info)
    --no-ai                skip AI checks, static analysis only (free mode)
    --quiet                suppress terminal output, just write files
  After scan, exit with code 1 if any "error" severity findings exist,
  exit 0 otherwise. This enables use in CI pipelines.

COMMAND: init
  Creates a starter aireview.config.json in the current directory.
  Prompts the user for their Anthropic API key (unless already in env).
  Writes the config and prints a success message with next steps.

COMMAND: clear-cache
  Calls ResultCache.clear() and prints how many entries were removed.

Global flags:
  --version   print package version
  --help      clear usage output with a usage example in the description

Add the bin entry to packages/cli/package.json pointing to the compiled
cli.ts entry point. Add a #!/usr/bin/env node shebang to the output.
```

**Done when:** `node dist/cli.js --help` shows clean output, and
`node dist/cli.js scan .` runs the full pipeline and exits with the
correct exit code.

**How you test it:**
1. `node dist/cli.js --help` — is the output actually helpful to a
   first-time user?
2. `node dist/cli.js scan ./fixtures/test-basic` — does the full pipeline
   run end to end?
3. `echo $?` after the scan — is the exit code 1 if there were errors?
   Test this in a fixture that has a known security error.
4. `node dist/cli.js init` in an empty temp folder — does it create the
   config file correctly?

---

## Phase 4 — LSP Server (VS Code + Cursor, free)

This is what makes it a real tool that developers actually keep installed.
Building the LSP server means it works in VS Code and Cursor automatically
(Cursor is VS Code-based), plus Neovim and Helix via config.

### Task 4.1 — LSP server skeleton

**Goal:** A bare-minimum LSP server process that starts, handshakes with
the editor, and doesn't crash.

**Agent prompt:**
```
In packages/vscode/src/server.ts, create an LSP server using
vscode-languageserver/node.

The server should:
1. Create a connection using createConnection(ProposedFeatures.all)
2. Create a TextDocuments manager
3. Implement connection.onInitialize() — return capabilities:
   {
     textDocumentSync: TextDocumentSyncKind.Incremental,
     diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false }
   }
4. On documents.onDidOpen() and documents.onDidSave() — log "Document
   opened/saved: {uri}" for now (we'll add real analysis in the next task)
5. Start listening: documents.listen(connection); connection.listen()

In packages/vscode/src/extension.ts, create the VS Code extension client:
1. Import LanguageClient from vscode-languageclient/node
2. In activate(), start the LanguageClient pointing at the server.ts entry
3. In deactivate(), stop the client

Create packages/vscode/package.json as a proper VS Code extension manifest:
  - "name": "ai-review"
  - "displayName": "ai-review — AI Code Reviewer"
  - "publisher": "[your-publisher-id]" (placeholder for now)
  - "engines": { "vscode": "^1.85.0" }
  - "activationEvents": ["onLanguage:typescript", "onLanguage:javascript",
    "onLanguage:python"]
  - "main": "./dist/extension.js"
  - "contributes": { "configuration": { add anthropicApiKey and model settings } }
```

**Done when:** you can press F5 in VS Code to launch the extension in
a debug window and see the "Extension Host" start without errors in the
debug console.

**How you test it:**
1. Open `packages/vscode/` in VS Code
2. Press F5 to launch the Extension Development Host
3. Open any `.ts` file in the new window
4. Check the Output panel → select "ai-review" from the dropdown
5. You should see the server start and log "Document opened" when you open
   a file. If you see this, the LSP handshake works.

---

### Task 4.2 — Wire static rules to LSP diagnostics

**Goal:** Static analysis findings appear as red/yellow squiggles in the
editor as soon as you open a file. This is the "wow" moment.

**Agent prompt:**
```
Update packages/vscode/src/server.ts to run the static rules on every
document open and save.

In the documents.onDidOpen() and documents.onDidSave() handlers:
1. Get the document content and URI
2. Detect language from the file extension
3. Run all static rules from packages/core (deprecated APIs, security
   patterns) against the content — these are fast enough to run on every
   open/save without blocking the editor
4. Skip the hallucinated-package check here (it makes network requests;
   run it on save only, not on open, to avoid hitting npm/PyPI constantly)
5. Map each Finding to an LSP Diagnostic:
   - severity: Finding "error" → DiagnosticSeverity.Error
                Finding "warning" → DiagnosticSeverity.Warning
                Finding "info" → DiagnosticSeverity.Information
   - range: use finding.line, finding.column, finding.endLine, finding.endColumn
     (convert to 0-indexed for LSP)
   - message: finding.message
   - code: finding.id
   - source: "ai-review"
6. Send via connection.sendDiagnostics({ uri, diagnostics })

The hallucinated-package check runs only on documents.onDidSave(), not
onDidOpen(), to avoid firing network requests when just browsing files.
```

**Done when:** you open a TypeScript file with `url.parse()` in VS Code
(with the extension running) and see a yellow underline appear on that
line with the deprecation message in the hover tooltip.

**How you test it:**
1. Launch the Extension Development Host (F5)
2. Create or open a `.ts` file containing `import url from 'url'; url.parse('http://example.com')`
3. You should see a yellow squiggle under `url.parse`
4. Hover over it — you should see the deprecation message and suggestion
5. Open the Problems panel (Ctrl+Shift+M) — the finding should appear there too
6. This is your first real working demo moment. Take a screenshot.

---

### Task 4.3 — Wire AI checks on save (debounced)

**Goal:** AI analysis runs on save, not on every keystroke. Results appear
as additional diagnostics after the static ones, with a status bar indicator
while waiting.

**Agent prompt:**
```
Update packages/vscode/src/server.ts to run AI checks on save:

1. Read the Anthropic API key from:
   a. The workspace configuration (ai-review.anthropicApiKey setting)
   b. Fall back to the ANTHROPIC_API_KEY environment variable
   If neither exists, skip AI checks silently and show a status bar item
   "ai-review: No API key — AI checks disabled"

2. On documents.onDidSave():
   a. First send the static diagnostics immediately (from Task 4.2)
   b. If API key is available and AI checks not disabled:
      - Set status bar to "$(loading~spin) ai-review: Analyzing..."
      - Check the result cache for this file content
      - If cache hit: merge cached AI findings into diagnostics immediately
      - If cache miss: call reviewFileWithAI(), cache the result, merge into
        diagnostics
      - Update status bar to "$(check) ai-review: Done" for 3 seconds,
        then clear
   c. Send the full merged diagnostics (static + AI) in one final
      sendDiagnostics call

3. Add a VS Code command "ai-review.clearCache" that calls clear-cache
   and shows an information message with how many entries were removed.

4. Add a VS Code command "ai-review.reviewFile" that manually triggers
   a full review of the currently active file (useful for running on demand
   without saving).
```

**Done when:** saving a file with an over-engineered function produces,
within 2-3 seconds, additional diagnostics in the Problems panel labeled
"ai-review" with source "ai" in the detail, alongside the static ones.

**How you test it:**
1. Write a function that reimplements Array.reduce() with a manual for loop
2. Save the file
3. Watch the status bar — "Analyzing..." should appear, then "Done"
4. Check the Problems panel — the complexity finding should appear
5. Save the same file again — no API call should happen (use the status bar
   timing to confirm it's faster; or add a log message in the cache hit path)

---

### Task 4.4 — VS Code extension packaging

**Goal:** Package the extension as a `.vsix` file that can be installed
locally and eventually published to the marketplace.

**Agent prompt:**
```
Set up extension packaging for packages/vscode/:

1. Install vsce (VS Code Extension CLI) as a dev dependency
2. Add a "package" script to packages/vscode/package.json:
   "vsce package --out dist/ai-review.vsix"
3. Ensure the extension manifest (package.json) has all required fields:
   - icon: 128x128 PNG (create a simple placeholder — a green magnifying
     glass on dark background, even text-based SVG converted to PNG is fine)
   - repository URL
   - license: MIT
   - categories: ["Linters"]
   - keywords: ["ai", "code review", "linter", "deprecated", "security"]
4. Add a .vscodeignore file excluding: node_modules, src/, *.test.ts,
   fixtures/, databases/ (the databases should be bundled via the build,
   not as loose JSON files)
5. Bundle the databases JSON files into the extension build using esbuild
   or by copying them into dist/ as part of the build script
6. Add a README.md inside packages/vscode/ that appears on the marketplace
   page (shorter version of the main README, focused on VS Code UX)
```

**Done when:** `npm run package` inside packages/vscode produces an
`ai-review.vsix` file that installs correctly via
"Install from VSIX" in VS Code.

**How you test it:**
1. `npm run package` in packages/vscode
2. In VS Code: Extensions sidebar → ··· menu → "Install from VSIX"
3. Select the `.vsix` file
4. Reload VS Code
5. Open a `.ts` file with a deprecated API — the squiggle should appear
   without pressing F5 or launching a dev host. This is real-world install.

---

## Phase 5 — Validation (Do Not Skip This)

### Task 5.1 — Build a labeled test corpus

**Goal:** A set of synthetic files where you know exactly what should
and should not be flagged. This is your quality gate.

**Agent prompt:**
```
Create fixtures/corpus/ with 8 sub-directories:

fixtures/corpus/clean-typescript/
  A realistic, well-written TypeScript Express route handler with:
  - new URL() (not url.parse)
  - parameterized SQL queries
  - no hardcoded secrets
  - clean, appropriately simple logic
  Expected findings: ZERO

fixtures/corpus/deprecated-node/
  A Node.js file using: url.parse(), new Buffer('data'), and
  require('querystring') (the deprecated version)
  Expected findings: 3 static findings (one per deprecated call)

fixtures/corpus/security-issues/
  A file with: eval(userInput), innerHTML assignment, and a hardcoded
  API key (use a fake-looking but realistic key format, clearly labeled
  as a test fixture at the top)
  Expected findings: 3 static findings (error severity)

fixtures/corpus/hallucinated-packages/
  A TypeScript file importing:
  - 'react' (real — should pass)
  - 'express' (real — should pass)
  - 'ai-helper-utils-pro' (fake — should flag)
  Expected findings: 1 finding (the fake package)
  Note: This test requires network access to npm registry. In CI, mock it.

fixtures/corpus/complex-code/
  A TypeScript file with two functions:
  - One that reimplements Array.reduce() with 25 lines of manual looping
  - One that is appropriately complex (real business logic, not reducible)
  Expected AI findings: 1 (the reimplemented reduce — not the real logic)

fixtures/corpus/convention-violations/
  A TypeScript file that violates these conventions (put these in a
  fixtures/corpus/convention-violations/aireview.config.json):
    "conventions": [
      "Always use async/await instead of .then() chains",
      "Never use var, always use const or let",
      "Functions must have explicit return type annotations"
    ]
  The file should contain: a .then() chain, a var declaration, and a
  function without a return type.
  Expected AI findings: 3 convention violations

fixtures/corpus/python-issues/
  A Python file with: import optparse, pickle.loads(data), and
  subprocess.call(user_input, shell=True)
  Expected findings: 3 (deprecated + 2 security)

fixtures/corpus/mixed-clean-and-dirty/
  A realistic project structure with 3 files: one clean, one with a
  deprecated API, one with a security issue. Used to test that the
  orchestrator correctly attributes findings to the right files.

Create fixtures/corpus/expected-results.json:
  Maps each fixture name to expected finding count and expected rule IDs.

Write a vitest integration test that runs runReview() against each fixture
(except hallucinated-packages in offline mode) and asserts actual findings
match expected-results.json exactly.
```

**Done when:** every fixture except hallucinated-packages passes its
expected results in the integration test.

**How you test it:**
1. `npm test` — the integration test must pass
2. For each fixture, look at the actual findings yourself. Does every flagged
   issue make sense as a real problem? Does the clean fixture have zero
   findings? Every false positive here means a false positive on real code.

---

### Task 5.2 — Real-world validation (manual task, no agent)

Pick 5 real open-source repositories that are AI-assisted or AI-generated
(search GitHub for repos with "generated by Claude/GPT/Copilot" in the
README, or pick popular starter templates).

Run `ai-review scan` against each one and for every finding, record in a
spreadsheet:
- Repo name
- Finding ID and category
- Is this a real issue? (yes / no / debatable)
- If no: what caused the false positive?

Target: less than 10% false positive rate on each rule individually.

If any rule exceeds 10% false positives on real code, go back to that
rule's task and tighten the detection before moving to Phase 6.

This is also your content research for the LinkedIn post:
"I scanned 5 AI-assisted open-source projects and found X issues. Here's
what AI code generators get wrong most often."

---

## Phase 6 — Distribution

### Task 6.1 — npm package for the CLI

**Agent prompt:**
```
Prepare packages/cli/ for npm publication:
- Correct package.json: name, description, keywords, license MIT, bin field,
  repository URL, files field (only dist/ and databases/ — not src, tests,
  fixtures)
- prepublishOnly script: npm run build && npm test
- Shebang line on compiled CLI entry
- Verify with npm pack + install in a temp directory

Publish under the name "ai-review" if available on npm, otherwise
"@[your-npm-username]/ai-review".
```

**How you test it:**
1. `npm pack`
2. In a fresh empty directory: `npm install /path/to/ai-review-x.y.z.tgz`
3. `npx ai-review scan .` — must work exactly as from source

---

### Task 6.2 — Root README (the one that matters)

**Agent prompt:**
```
Write README.md at the project root covering:

1. One-paragraph plain-English description (no jargon, no hype). Example
   opening: "AI coding assistants write fast but sometimes write wrong.
   ai-review catches the specific patterns that AI code generators get
   wrong systematically — before they reach production."

2. Quickstart (4 lines max):
   npx ai-review scan ./src

3. What it checks (plain language, no rule IDs):
   - Deprecated APIs with their modern replacements
   - Package names that don't exist on npm or PyPI
   - Security patterns (SQL injection, eval, pickle, etc.)
   - Unnecessary complexity (only if API key provided)
   - Team convention violations (only if configured)

4. Configuration: show a minimal aireview.config.json example with
   one or two conventions. Explain that conventions are plain English —
   not code, not regexes.

5. VS Code / Cursor integration: "Install the ai-review extension from
   the VS Code marketplace. Findings appear inline as you type."

6. Cost: show the real math. A 10-file scan with 300 lines per file ≈
   $0.003 total. Most re-scans cost $0.00 (cached). Be specific — this
   builds trust.

7. Limitations (be honest):
   - Static analysis only for deprecated APIs and security — may miss
     dynamic patterns
   - AI checks are heuristic — treats all flagged complexity as suggestions,
     not mandates
   - Convention checking requires you to have written your conventions down
   - Not a substitute for human code review

8. How to add a custom rule (point to databases/ for static rules)

9. MIT license

Tone: direct, specific, honest. No marketing language. No "revolutionary"
or "powerful". The README should read like it was written by the developer
who built it, not a startup's growth team.
```

**How you test it:**
1. Send the README to a developer who hasn't seen the project. Ask: "After
   reading this, do you know what this tool does and whether you'd want to
   try it?" If they're unclear on anything, fix it.
2. Run every command shown in the README yourself to confirm nothing is
   outdated or wrong.

---

## Phase 7 — Launch

### Pre-launch checklist

Before posting on LinkedIn:

**Quality:**
- [ ] Corpus integration tests pass (Task 5.1)
- [ ] Real-world validation done with <10% false positive rate (Task 5.2)
- [ ] You have specific numbers: "scanned X repos, found Y deprecated APIs,
      Z security issues, N hallucinated packages"

**Distribution:**
- [ ] `npx ai-review scan ./src` works cleanly for a stranger
- [ ] VS Code extension installed and working from VSIX locally
- [ ] GitHub repo public with license, description, and a good README

**Content:**
- [ ] You have one screenshot of terminal output showing real findings
- [ ] You have one screenshot of VS Code with the squiggles visible
- [ ] Your LinkedIn post leads with a specific, surprising data point
      from your Task 5.2 research — not "I built a tool"

**The LinkedIn post structure that actually works:**
- Line 1: the surprising data point ("I scanned 5 AI-assisted repos...")
- Lines 2-4: what you found and why it matters
- Line 5: "So I built a free, open-source tool to catch this automatically"
- One screenshot
- Link to GitHub + npm
- "What AI code mistakes have you run into?" (drives comments)

---

## Complete task checklist

**Phase 0 — Foundations**
- [ ] 0.1 Monorepo setup
- [ ] 0.2 Core data types
- [ ] 0.3 Config loader

**Phase 1 — Static Analysis (free)**
- [ ] 1.1 File walker
- [ ] 1.2 Deprecated API database (JSON files)
- [ ] 1.3 Deprecated API checker
- [ ] 1.4 Hallucinated package checker
- [ ] 1.5 Security pattern checker

**Phase 2 — AI Analysis (cheap)**
- [ ] 2.1 Result cache
- [ ] 2.2 AI batch caller
- [ ] 2.3 Complexity prompt engineering

**Phase 3 — CLI**
- [ ] 3.1 Scan orchestrator
- [ ] 3.2 Terminal report
- [ ] 3.3 HTML report
- [ ] 3.4 CLI commands and flags

**Phase 4 — LSP / VS Code Extension**
- [ ] 4.1 LSP server skeleton
- [ ] 4.2 Static rules → LSP diagnostics
- [ ] 4.3 AI checks on save
- [ ] 4.4 Extension packaging (.vsix)

**Phase 5 — Validation**
- [ ] 5.1 Labeled test corpus + integration test
- [ ] 5.2 Real-world validation (manual)

**Phase 6 — Distribution**
- [ ] 6.1 npm publish
- [ ] 6.2 Root README

**Phase 7 — Launch**
- [ ] Pre-launch checklist complete
- [ ] LinkedIn post written with real data

---

## Realistic timeline estimate

| Phase | Time (solo, agent-assisted) |
|---|---|
| Phase 0 | Half a day |
| Phase 1 | 2 days (the database is the biggest time cost) |
| Phase 2 | 1 day + prompt iteration |
| Phase 3 | 1 day |
| Phase 4 | 2 days (LSP debugging takes longer than expected) |
| Phase 5 | 1 day |
| Phase 6 | Half a day |
| **Total** | **~8 working days** |

The LSP server (Phase 4) is where most people underestimate time.
The LSP handshake and VS Code extension manifest are tedious to debug.
Budget an extra day buffer for Phase 4 specifically.
