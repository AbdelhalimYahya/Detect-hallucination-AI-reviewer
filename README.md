# ai-review

AI coding assistants write fast but sometimes write wrong. `ai-review` catches the specific patterns that AI code generators get wrong systematically — deprecated APIs that the model was trained on, package names that look real but don't exist, security anti-patterns that crop up in generated code, and unnecessary complexity introduced by models that tend to over-engineer. It runs as a CLI, inside VS Code or Cursor, or in CI.

## Quickstart

```bash
npx ai-review scan ./src
```

That scans your `src/` directory with static analysis only (free, no API key needed). For AI-powered checks, set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx ai-review scan ./src
```

## What it checks

- **Deprecated APIs** with their modern replacements. Catches things like `url.parse()` (use `new URL()`), `componentWillMount` (use `useEffect`), and `optparse` (use `argparse`). Powered by plain-text databases — one entry per deprecated API, language by language.
- **Package names that don't exist on npm or PyPI.** AI models sometimes invent package names that sound plausible. Each imported package is checked against the real registry. If it 404s, you'll know before you run `npm install` and get a build error.
- **Security patterns** — SQL injection via string concatenation, `eval()` with dynamic input, hardcoded secrets, `pickle.loads()` from untrusted sources, `shell=True` in subprocess calls, weak crypto, and prototype pollution. These are the patterns that show up most often in AI-generated code.
- **Unnecessary complexity** (requires an API key). AI models tend to over-engineer. This check finds manual iterations that could be built-in array methods, nested ternaries that could be lookup tables, sequential independent async calls that should be `Promise.all()`, and unnecessary abstraction layers.
- **Team convention violations** (requires conventions to be configured). Write your team rules in plain English — "Always use `async/await` instead of `.then()` chains" — and the AI checks generated code against them.

## Configuration

Drop an `aireview.config.json` in your project root:

```json
{
  "conventions": [
    "Always use async/await instead of .then() chains",
    "Functions must have explicit return type annotations"
  ],
  "ignorePatterns": ["node_modules", "dist", ".next"],
  "model": "claude-haiku-4-5"
}
```

Conventions are plain English sentences — not regexes, not AST patterns. The AI reads them and checks each file. You don't need to be a linter expert to add one.

Run `npx ai-review init` to generate a starter config in the current directory.

## VS Code / Cursor integration

Install the **ai-review** extension from the VS Code marketplace. Findings appear as inline squiggles in your editor — yellow for warnings, red for errors — as soon as you open a file or save changes. The same extension works in Cursor (which is VS Code-based).

## Cost

- **Static analysis** (deprecated APIs, hallucinated packages, security checks): $0.00. Always. Runs locally with no external API calls.
- **AI checks** (complexity, conventions): pay only for what you use. A first-time scan of ten files (~300 lines each) costs around $0.005 in Anthropic API fees. Re-scans of unchanged files cost $0.00 because each file's results are cached by content hash — the cache is checked before any API call is made, and most re-scans hit it.
- **Without an API key**: the tool works fine — you get all static checks for free. Only the complexity and convention checks require an API call.

If you're worried about a monthly budget, don't be. A team of five running this daily would spend under $3/month.

## Limitations

- **Static analysis is pattern-based.** It finds deprecated APIs and security patterns by searching for known strings in the file text. It can't catch dynamically constructed calls or obfuscated code.
- **AI checks are heuristic.** The complexity and convention checks use a language model and can produce false positives. Treat every flagged issue as a suggestion, not a command. If a finding doesn't make sense, the right response is often to think about whether the code really needs to be that way — and then ignore the finding if it does.
- **Convention checking requires you to have written your conventions down.** If your team hasn't articulated its conventions, the tool can't read minds.
- **Not a substitute for human code review.** This tool catches the patterns AI generators get wrong. It doesn't evaluate architecture, business logic correctness, or product fit. A human still needs to read the code.

## Adding a custom rule

Static rules (deprecated APIs, security patterns) are stored as JSON files in [`databases/`](./databases/). There's one file per language or domain — `deprecated-node.json`, `deprecated-react.json`, `deprecated-python.json`. Each entry specifies a pattern string to match, a message, and a fix suggestion. To add a rule, add an entry to the relevant JSON file. No code changes needed.

AI rules (complexity, conventions) are driven entirely by the prompt — modify the prompt in `batchCaller.ts` to change what the AI looks for.

## License

MIT
