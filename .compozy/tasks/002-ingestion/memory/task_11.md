# Task Memory: task_11.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Implement `ingestion.parse` (stage 3) that streams chapters from EPUB or TXT, batch-saves every 50, enqueues `ingestion.chunk`, and surfaces "no chapters" as a `ParseError`.

## Important Decisions

- Picked the two-port wiring described in the task spec (`deps.chapterParser` for EPUB, `deps.txtChapterParser` for TXT) over a factory function. Both fields are mandatory on `StageDeps`; apps/worker (task_15) will wire `EpubChapterParserWithFallback` to `chapterParser` and `TxtChapterParser` to `txtChapterParser`.
- Generated chapter IDs in the parse stage with `crypto.randomUUID()` and stamped `createdAt = new Date()` to satisfy the `Chapter` domain shape that `ChapterRepository.saveMany` requires (the mapper passes both through; Postgres defaults are bypassed).
- Mid-stream progress is reported as a sentinel `50` between batches and `100` on completion — the techspec only requires that `books.update` is called per batch, and we have no chapter-count estimate before streaming.

## Learnings

- `BookRecordForStage` did not expose `languages`; extended it (and `findBookForStage`) so the parse stage can resolve `SupportedLanguage`. Existing `download.test.ts` and `clean.test.ts` `makeBook` factories had to be updated with `languages: ['en']` because the field is now required.
- `resolveLanguage` normalises with `.toLowerCase().slice(0, 2)` so book rows like `pt-br` map cleanly to `'pt'`; unknowns fall back to `'en'`.
- `vi.fn` typed as `async function*` works with vitest's `vi.fn` only when the argument is a generator — keep the wrapper signature explicit (`(_path, _language) => AsyncIterable<ParsedChapter>`).

## Files / Surfaces

- Added: `packages/ingestion/src/application/stages/parse.ts`
- Added: `packages/ingestion/__tests__/application/stages/parse.test.ts`
- Edited: `packages/ingestion/src/application/stages/_common.ts` (added `languages` to `BookRecordForStage`, added `txtChapterParser` to `StageDeps`, extended `findBookForStage` columns).
- Edited: `packages/ingestion/__tests__/application/stages/{download,clean}.test.ts` (added `languages: ['en']` to `makeBook` factory to satisfy the new required field).

## Errors / Corrections

- None.

## Ready for Next Run

- Parse handler is ready for apps/worker registration in task_15. Worker boot must inject:
  - `chapterParser`: `new EpubChapterParserWithFallback({ primary: new EpubChapterParser(), fallback: new EpubChapterParserEpub2() })`
  - `txtChapterParser`: `new TxtChapterParser()`
