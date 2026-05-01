# Task Memory: task_12.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

`application/stages/chunk.ts` — paragraph-aligned 768-token chunking with 10-15% overlap; streams chapters one-at-a-time; batches saveMany at 50; enqueues `ingestion.summarize` per ADR-008.

## Important Decisions

- Added `streamByBookId(bookId): AsyncIterable<Chapter>` to `ChapterRepository` port and Drizzle impl. Required for ADR-004 streaming discipline (existing `listByBookId` returns a full array; not safe for War-and-Peace-class books). Mirrors the existing `chunkRepo.listByBookIdWithoutEmbedding` keyset-pagination pattern but pages on `chapters.ordinal` (batch=25).
- Injected `tokenCounter?: (text: string) => number` on `ChunkStageDeps` (default lazily wraps `getEncoding('cl100k_base')`). Lets unit tests substitute a deterministic word-counting tokenizer instead of building text precisely tuned to cl100k_base.
- Chunk text is computed as `chapter.plainText.slice(startChar, endChar)` so the substring invariant (`plain_text.slice(start, end) === chunk.text`) holds even when the chunk includes overlap paragraphs from the previous chunk. Original separators (`\n\n+`) are preserved verbatim.
- Overlap algorithm: walks paragraphs from the tail, accumulating until tokens >= 75; stops adding when the next paragraph would push past 115 (unless overlap is empty, in which case at least one paragraph is always kept). When overlap+next-paragraph would exceed 768, falls back to no overlap rather than splitting the paragraph.
- Per-chapter progress capped at 99 (`Math.min(99, …)`); a final `ingestionProgress: 100` is set after the last batch flush so the chunking-finished signal is unambiguous.

## Learnings

- biome's complexity ceiling (15) flagged the original chunk-builder when it carried the buffer mutation inline. Refactor lifted `emitBuffer` and `startNextChunk` into pure helpers operating on a `ChunkBuilderState` object. Same logic, lower cyclomatic count.
- Reused the chunk-repo test's `Object.assign(Promise.resolve(rows), { limit })` trick on the chapter-repo mock so the same mock satisfies both the array-returning `listByBookId` (`await orderBy()`) and the streaming `streamByBookId` (`orderBy().limit()`) paths.
- `pnpm vitest run --coverage --coverage.include='src/application/stages/chunk.ts'` produces a focused coverage report; full-suite coverage isn't needed when verifying a new file's threshold.

## Files / Surfaces

- New: `packages/ingestion/src/application/stages/chunk.ts`
- New: `packages/ingestion/__tests__/application/stages/chunk.test.ts`
- Modified: `packages/ingestion/src/domain/chapter/ChapterRepository.port.ts` (added `streamByBookId`)
- Modified: `packages/ingestion/src/infrastructure/persistence/DrizzleChapterRepository.ts` (added `streamByBookId` + private generator; `STREAM_BATCH_SIZE = 25`)
- Modified: `packages/ingestion/__tests__/infrastructure/persistence/DrizzleChapterRepository.test.ts` (mock supports limit-chained streaming + 3 new test cases)

## Errors / Corrections

- First implementation set `chunk.text = paragraphs.map(p => p.text).join('\n\n')`, which broke the substring invariant when the original separator was `\n\n\n` or longer. Fixed by slicing `plainText` directly using `startChar`/`endChar`.
- Initial `chunkChapter` had complexity 17. Refactored to use `ChunkBuilderState` + extracted helpers, no behavior change.

## Ready for Next Run

- task_13 (embed + index handlers) can rely on `ingestion.summarize` being the queue chunk now enqueues. ADR-008 still expects task_23 (summarize handler) to enqueue `ingestion.embed`; until then a chunked-but-unsummarized book stalls at the summarize queue, which is correct.
- `ChapterRepository.streamByBookId` is now part of the port contract — any future fake/mock must implement it.
