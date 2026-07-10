# ai-review — Project Structure & Developer Guide

## Overview

Monorepo with three packages sharing a common core engine. The CLI, VS Code extension, and future integrations all consume `@ai-review/core`.

## Directory Layout

```
ai-review/
├── packages/
│   ├── core/               Shared engine (rules, cache, AI caller, types)
│   ├── cli/                npx ai-review (terminal tool)
│   └── vscode/             VS Code / Cursor extension (LSP server)
├── databases/              Deprecated API databases (JSON, one per language)
├── fixtures/               Test corpus with expected results
│   ├── corpus/             Synthetic labeled fixtures (clean, deprecated, security, etc.)
│   └── prompt-patterns/    5 patterns for AI prompt engineering validation
├── scripts/                Build and test helper scripts
├── Docs/                   Documentation
├── package.json            Root monorepo config (workspaces)
└── tsconfig.base.json      Shared TypeScript config (strict mode)
```

## Packages

### `packages/core` (`@ai-review/core`)

The engine. All packages import from here. No runtime dependencies on other packages.

| Module | File | Purpose |
|--------|------|---------|
| Types | `types.ts` | All shared interfaces (`Finding`, `ReviewResult`, `ReviewConfig`, `Rule`, etc.) |
| Config | `config.ts` | Loads `aireview.config.json` with Zod validation, walks up directories |
| File scanner | `scanner/fileWalker.ts` | Recursive directory walk, language detection, ignore patterns |
| Orchestrator | `scanner/runReview.ts` | Runs all static rules per file, aggregates results into `ReviewResult` |
| Deprecated APIs | `rules/deprecatedApis.ts` | Pattern-matches code against JSON databases (comment-aware) |
| Security patterns | `rules/securityPatterns.ts` | 9 regex-based checks (eval, SQL injection, pickle, etc.) |
| Hallucinated packages | `rules/hallucinatedPackages.ts` | Checks imports against npm/PyPI registries (HEAD requests) |
| AI caller | `ai/batchCaller.ts` | One Anthropic API call per file for complexity + convention checks |
| Cache | `cache/resultCache.ts` | Content-hash (SHA-256) cache for AI results, 30-day TTL |

### `packages/cli` (`ai-review` published as `ai-review`)

Three commands:

- **`ai-review scan <target>`** — Scans a directory. Flags: `--no-ai`, `--no-cache`, `--no-html`, `--json <path>`, `--html <path>`, `--min-severity <level>`, `--quiet`. Exit code 1 if any error-severity findings exist (CI-friendly).
- **`ai-review init`** — Creates `aireview.config.json` in the current directory. Prompts for API key or reads from env.
- **`ai-review clear-cache`** — Clears `~/.ai-review/cache/`.

Reports: terminal (chalk + cli-table3), JSON, and self-contained HTML (inline CSS, dark mode, responsive).

### `packages/vscode` (`@ai-review/vscode`)

VS Code extension using LSP (Language Server Protocol). Works in Cursor too (VS Code-based).

- **Server** (`server.ts`): LSP server running `vscode-languageserver/node`. On document open: static analysis only (fast). On save: static + hallucinated checks + AI checks (with cache). Diagnostics appear as inline squiggles.
- **Extension** (`extension.ts`): Client activating the LSP server. Status bar shows "Analyzing..." / "Done". Commands: `ai-review.clearCache`, `ai-review.reviewFile`.

Built as a `.vsix` via `vsce package`.

## Databases

Three JSON files at the monorepo root (`databases/`):

- `deprecated-node.json` — 23 entries (Node.js deprecated APIs)
- `deprecated-react.json` — 17 entries (React deprecated APIs)
- `deprecated-python.json` — 16 entries (Python deprecated APIs)

Each entry has: `id`, `pattern` (substring or regex), `title`, `message`, `suggestion`, `docsUrl`, `severity`. The pattern matcher is comment-aware — patterns inside comments or docstrings are skipped.

## Data Flow

```
aireview.config.json
        │
        ▼
    loadConfig()          ← walks up directories, merges defaults
        │
        ▼
    walkFiles()           ← discovers files by extension, respects ignores
        │
        ▼
    ┌───────────────────────────────────────────┐
    │           Per File Pipeline               │
    │                                           │
    │  1. createDeprecatedApiRule().check()      │
    │     → matches patterns from JSON databases │
    │                                           │
    │  2. createSecurityRule().check()           │
    │     → 9 regex-based security checks       │
    │                                           │
    │  3. checkHallucinatedPackages()            │
    │     → HEAD requests to npm/PyPI            │
    │     → in-memory cache per process          │
    │                                           │
    │  4. reviewFileWithAI()  (if API key set)  │
    │     → ResultCache.get() → hit? skip       │
    │     → Anthropic API call → cache result    │
    └───────────────────────────────────────────┘
        │
        ▼
    computeSummary()      ← aggregates by category, severity, tokens
        │
        ▼
    Terminal / HTML / JSON / LSP Diagnostics
```

## Cost Model

| Check | Cost | Mechanism |
|-------|------|-----------|
| Deprecated APIs | $0.00 | String pattern matching |
| Security patterns | $0.00 | Regex matching |
| Hallucinated packages | $0.00 | HEAD requests (negligible) |
| Complexity (AI) | ~$0.0005/file | Anthropic Haiku API |
| Conventions (AI) | ~$0.0005/file | Batched with complexity in one call |
| Re-scans | $0.00 | SHA-256 content cache (30-day TTL) |

## Development Workflow

```bash
# Install
npm install

# Build all packages
npm run build

# Run all tests
npm test

# Watch mode
npm run dev

# Build CLI bundle (single-file esbuild)
node scripts/bundle-core.mjs

# Package VS Code extension
npm run package --workspace=packages/vscode

# Publish CLI to npm
npm publish --workspace=packages/cli
```

## Adding Things

### Add a deprecated API rule

Edit the relevant JSON file in `databases/`:

```json
{
  "id": "MY_NEW_RULE",
  "pattern": "oldFunction(",
  "title": "oldFunction() is deprecated",
  "message": "oldFunction() was deprecated in v1.0. Use newFunction() instead.",
  "suggestion": "Replace oldFunction() with newFunction() — the API is identical.",
  "docsUrl": "https://example.com/docs",
  "severity": "warning"
}
```

No code changes needed. The pattern matcher reads all entries at startup.

### Add a security pattern

Add a new check function in `packages/core/src/rules/securityPatterns.ts` following the existing pattern, then wire it into the `createSecurityRule()` function.

### Tune AI prompts

Edit the system prompt or user prompt construction in `packages/core/src/ai/batchCaller.ts`. Test against fixtures in `fixtures/prompt-patterns/`.

## Testing Strategy

- **Unit tests**: Vitest, one test file per module, in `__tests__/` alongside source
- **Integration tests**: `corpus.test.ts` runs `runReview()` against every fixture in `fixtures/corpus/` and asserts findings match `expected-results.json`
- **Prompt tests**: Manual, run against `fixtures/prompt-patterns/` with real API calls
- **Real-world validation**: Scan real repos, record false positive rate per rule

## Dependencies

| Dependency | Used By | Purpose |
|-----------|---------|---------|
| `commander` | CLI | CLI framework |
| `@anthropic-ai/sdk` | Core | Anthropic API client |
| `chalk` | CLI | Terminal colors |
| `cli-table3` | CLI | Terminal tables |
| `zod` | Core | Config validation |
| `vscode-languageserver` | VS Code | LSP server library |
| `vscode-languageclient` | VS Code | LSP client library |
| `vitest` | Root | Test runner |
| `esbuild` | Root/CLI | Bundling CLI distribution |
| `typescript` | Root | TypeScript compiler |
