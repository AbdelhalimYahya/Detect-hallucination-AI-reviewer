# ai-review — AI Code Reviewer

Catches deprecated APIs, hallucinated packages, security issues, and unnecessary complexity in AI-generated code. Findings appear as inline squiggles in the editor and in the Problems panel.

## Features

- **Deprecated APIs** — flags deprecated Node.js, React, and Python APIs with their modern replacements
- **Security issues** — detects eval(), SQL injection, hardcoded secrets, weak crypto, insecure deserialization, and more
- **Hallucinated packages** — checks that npm and PyPI package names actually exist (on save)
- **AI-powered complexity analysis** — identifies over-engineered code and suggests simpler alternatives (requires Anthropic API key)
- **Result caching** — analyzed files are never re-analyzed until they change

## Getting started

1. Install the extension from the VS Code marketplace
2. Set your Anthropic API key in settings: `ai-review.anthropicApiKey`
3. Open any `.ts`, `.js`, `.tsx`, `.jsx`, or `.py` file
4. Deprecated API and security squiggles appear immediately
5. On save, AI-powered complexity analysis runs (if API key configured)

## Commands

| Command | Description |
|---|---|
| `ai-review.reviewFile` | Run a full review on the active file |
| `ai-review.clearCache` | Clear the AI analysis result cache |

## Configuration

| Setting | Description |
|---|---|
| `ai-review.anthropicApiKey` | Anthropic API key for AI-powered checks |
| `ai-review.model` | Model to use (default: `claude-haiku-4-5`) |

If no API key is configured, static checks (deprecated APIs, security, hallucinated packages) still work — only AI-powered analysis is disabled.

## Requirements

- VS Code 1.85 or later
- Node.js 18 or later (for the language server)
- Anthropic API key (for AI-powered analysis only)
