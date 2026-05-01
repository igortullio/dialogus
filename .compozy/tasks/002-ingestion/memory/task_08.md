# Task Memory: task_08.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Implement chapter-heuristics YAML + Zod loader, GutenbergCleaner, TxtChapterParser; ship 6 fixture text files (3 EN + 3 PT) and unit tests.

## Important Decisions

- Loader compiles patterns with the `i` flag automatically (per ADR-006 file-header convention) so YAML authors don't need to repeat ALL CAPS variants.
- Loader exposes `loadChapterHeuristics()` (singleton, no args) for production and `parseChapterHeuristics(yamlText)` for tests with arbitrary YAML strings; `_resetChapterHeuristicsCache()` is a test seam to drop the module-level cache.
- TxtChapterParser drops front-matter lines that appear before the first detected chapter header. They are accumulated into a `fallbackBody` buffer that is cleared as soon as the first header fires; if no header is ever seen, that buffer becomes the body of a single fallback chapter using `langConfig.fallbackTitle`.
- Token count uses `js-tiktoken` `getEncoding('cl100k_base')`; the encoder is constructed once per parser instance and held on the instance so `parse()` calls reuse it.
- Cleaner accepts three Project Gutenberg start/end variants (`THE`, `THIS`, bare) and is case-insensitive. Blank-line normalization runs unconditionally; with no markers the function still trims the boundaries.

## Learnings

- Biome's `lint/suspicious/useIterableCallbackReturn` rejects `chapters.forEach((c) => expect(c.x).toMatch(...))` because `expect()` returns a value; use a `for ... of` loop or block body instead.
- `js-tiktoken@^1` is pure JS (no WASM). `getEncoding('cl100k_base')` is sync and safe to call inside a constructor; ranks are bundled under `node_modules/js-tiktoken/dist/ranks/`.
- Node's `readline.createInterface({ crlfDelay: Number.POSITIVE_INFINITY })` over `createReadStream(path, { encoding: 'utf8' })` is the standard streaming line iterator. It strips the trailing `\n`/`\r\n`, so re-joining with `\n` is enough; I trim leading/trailing newlines on the rebuilt body.

## Files / Surfaces

- `packages/ingestion/src/infrastructure/parsing/chapter-heuristics.yaml` (new)
- `packages/ingestion/src/infrastructure/parsing/chapter-heuristics.ts` (new — schema, loader, compiler, cache reset)
- `packages/ingestion/src/infrastructure/parsing/GutenbergCleaner.ts` (new)
- `packages/ingestion/src/infrastructure/parsing/TxtChapterParser.ts` (new)
- `packages/ingestion/__fixtures__/txt/{moby-dick,crime-and-punishment,pride-and-prejudice,dom-casmurro,memorias-postumas,os-lusiadas}-excerpt.txt` (new)
- `packages/ingestion/__tests__/infrastructure/parsing/{chapter-heuristics,GutenbergCleaner,TxtChapterParser}.test.ts` (new)
- `packages/ingestion/package.json` (added `js-tiktoken@^1`, `yaml@^2`)

## Errors / Corrections

- First lint pass flagged 3 `chapters.forEach((c) => expect(...))` callbacks; rewrote as `for ... of` blocks. Biome's auto-fix did not handle these — only formatting was auto-corrected.

## Ready for Next Run

- Stage handlers (task_10 chunk, task_11 parse) can compose `TxtChapterParser` directly via `new TxtChapterParser()` and rely on the singleton heuristics cache. Tests for stage handlers should pass an in-memory tokenizer or pre-built `ChapterHeuristicsConfig` if they want determinism without touching the YAML file.
