# Task Memory: task_09.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

EPUB path of the ChapterParser port: gxl primary + epub2 fallback + runtime fallback wrapper, plus 2 committed fixture EPUBs.

## Important Decisions

- Wrapper `EpubChapterParserWithFallback` only switches to fallback when the primary throws **before yielding any chapter**. If the primary throws mid-stream, the wrapper rethrows as ParseError without invoking fallback (no duplicates, preserves streaming discipline).
- Shared `htmlToPlainText()` helper used by both adapters. Strips `<head>`/`<script>`/`<style>`/`<svg>`/`<template>` blocks, replaces block tags + `<br>` with newlines, decodes a small named-entity table + numeric/hex entities. Lives next to the parsers in `infrastructure/parsing/`.
- Fixture EPUBs are generated one-shot via `__fixtures__/epub/build-fixtures.mjs` (committed) using the system `zip` binary. The `mimetype` entry is stored uncompressed first per EPUB spec. `.epub` binaries are committed; the script is for reproducibility.
- `language` parameter on `parse()` is accepted but unused in EPUB path (EPUB carries its own `<dc:language>`).

## Learnings

- `@gxl/epub-parser` ESM default import path (`import gxl from '@gxl/epub-parser'`) returns an object with `parseEpub` — not a callable. Cast through `{ parseEpub }` to call it. The library is CJS-built with `lib/index.js` exporting `{ parseLink, parseHTML, parseEpub }`.
- `@gxl/epub-parser` exposes `epub.sections[]` (Section per spine entry, with `htmlString` + `toMarkdown()`) and `epub.structure` (TOC tree with `name`/`path`/`playOrder`, `sectionId`/`nodeId` may be undefined for navMap-only TOCs). For our minimal fixtures the structure mirrors the spine 1:1, so positional zip is reliable.
- `epub2` exposes `EPub.createAsync(filePath)` returning a Promise<EPub>; after parse, walk `epub.flow` (spine in reading order) and call `epub.getChapterAsync(id)`. Returns cleaned chapter HTML with the `<head>` already stripped, but body still contains tags + entities — needs the shared HTML→text pass.
- `epub2` brings `bluebird`, `adm-zip`, and `xml2js` as transitive deps; `@gxl/epub-parser` brings `jsdom`, `lodash`, `node-zip`, `to-markdown`, `xml2js`. Both pull in legacy packages flagged as deprecated by pnpm — accepted for V1.
- Biome's `lint/correctness/useYield` flags `async function* () { throw … }` even when the throw is the only statement. Workaround: use a hand-built async iterator (`{ next: () => Promise.reject(error) }`) for "always-failing" parser test fakes instead of generator syntax.
- v8 coverage instrumentation slows tests just enough that the task_06 GutendexDownloader rate-limit timing assertion (`>= 1000ms`) flakes (~once per 5 runs at 999ms). Pre-existing — out of scope for this task.

## Files / Surfaces

- `packages/ingestion/src/infrastructure/parsing/EpubChapterParser.ts` (new)
- `packages/ingestion/src/infrastructure/parsing/EpubChapterParserEpub2.ts` (new)
- `packages/ingestion/src/infrastructure/parsing/EpubChapterParserWithFallback.ts` (new)
- `packages/ingestion/src/infrastructure/parsing/html-to-text.ts` (new helper)
- `packages/ingestion/__fixtures__/epub/{build-fixtures.mjs, sample-en.epub, sample-pt.epub}` (new)
- `packages/ingestion/package.json` (added `@gxl/epub-parser@^2`, `epub2@^3`)
- `packages/ingestion/__tests__/scaffold.test.ts` (flipped the "no adapter libs yet" assertion to "deps present")
- `packages/ingestion/__tests__/infrastructure/parsing/{EpubChapterParser,EpubChapterParserEpub2,EpubChapterParserWithFallback,html-to-text}.test.ts` (new)

## Errors / Corrections

- First implementation of `humanizeId('chapter02')` chained two regex `.replace()` calls and produced `Chapter ter02`. Replaced with a single `match(/^chap(?:ter)?\s*(\d+)$/i)` to extract the number cleanly.

## Ready for Next Run

- task_11 (Parse stage handler) wires the parser. Inject `EpubChapterParserWithFallback`, never the raw primary — failure semantics depend on the wrapper.
- Use `TxtChapterParser` for `.txt` files and `EpubChapterParserWithFallback` for `.epub`; selection should happen at the worker / stage handler level by inspecting `books.format` (TXT vs EPUB).
