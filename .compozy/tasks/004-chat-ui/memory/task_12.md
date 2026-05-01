# Task Memory: task_12.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- `/library` route shipped: RSC `page.tsx` prefetches `['library']` and hydrates `<LibraryGrid>`; grid renders responsive `<BookCard>`s with per-card status polling; `<StatusBadge>` and `<BookDetailsDialog>` stubs in place.

## Important Decisions

- BookCard owns its own mutations (ingest/retry/remove). task_13 will wrap remove + retry with their dedicated dialogs/buttons; ingest stays inline.
- `data-slot="book-card"` carries `data-book-id` and `data-status` (live, polled). BookDetailsDialog lives inside BookCard mounted only for `ready` books; `data-slot="book-details-dialog"` only present in DOM when open.
- Cover fallback inline (initial-letter monospace block) is a placeholder until task_13 ships `<CoverFallback>`. BookCard's `<Cover>` helper is the swap point.
- LibraryGrid local search uses `_internals.filterBooks` (lowercased trim, title + author substring). Trim of an all-whitespace query short-circuits to the original `books` reference (preserves referential equality for memoization).
- `LIBRARY_QUERY_KEY = ['library'] as const` exported from `LibraryGrid.tsx`; reused by RSC prefetch in `page.tsx` and by BookCard's `invalidateQueries` calls. Per-card ingestion polling key: `['ingestion', book.id]`.

## Learnings

- Test pitfall: a `useQuery({ initialData, queryFn })` with `staleTime: 0` triggers an immediate refetch on mount. If the test mocks the query function with `mockReset()` (no implementation), TanStack logs `"Query data cannot be undefined"` and re-renders with `data === undefined`, blowing away the initialData. Fix: in any LibraryGrid test that needs the initialData to remain, set `mockedFetch.mockResolvedValue({ books, nextCursor: null })` with the same payload before `render()`.
- `[data-book-id="<short-string>"]` selector is fine in jsdom; the failure I saw was a side-effect of the staleTime/refetch issue above, not the selector.
- Biome `lint/performance/noImgElement` fires on `<img>` and is a warning (exit 0). Acceptable for V1 cover_url; switching to `next/image` would also require `next.config` `images.remotePatterns` for Gutendex covers — Phase 2 polish.

## Files / Surfaces

- Created: `apps/web/src/app/library/page.tsx`, `apps/web/src/app/library/LibraryGrid.tsx`, `apps/web/src/components/library/BookCard.tsx`, `apps/web/src/components/library/StatusBadge.tsx`, `apps/web/src/components/library/BookDetailsDialog.tsx`.
- Tests: `apps/web/__tests__/app/library/page.test.tsx`, `apps/web/__tests__/components/library/{StatusBadge,BookDetailsDialog,BookCard,LibraryGrid}.test.tsx` (5 files, 39 tests).
- Touches `apps/web/src/components/chat/add-book-drawer-store.ts` only as a consumer — `openAddBookDrawer()` invoked from `<LibraryGrid>` header button + empty-state CTA.

## Errors / Corrections

- Initial LibraryGrid search test failed because the mocked `fetchLibrary` returned `undefined`, replacing `initialData` with `undefined` after the first refetch tick. Resolved by configuring the mock to resolve to the same `{ books, nextCursor: null }` payload in tests that exercise post-render state.

## Ready for Next Run

- task_13 picks up this scaffolding by replacing `<Cover>` (inline fallback) with `<CoverFallback>`, wrapping `book-card-action-remove` with `<RemoveBookDialog>`, and replacing `book-card-action-retry` with `<RetryButton>` (confirmation-backed). The drawer state (`add-book-drawer-store`) is already wired to the LibraryGrid header button and empty-state CTA — task_13 only needs to mount `<AddGutendexSheet>` somewhere global.
