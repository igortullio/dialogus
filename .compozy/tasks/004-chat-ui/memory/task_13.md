# Task Memory: task_13.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Ship the four book-management primitives that complete `/library`'s interactive surface — `<AddGutendexSheet>` (left-side drawer), `<RemoveBookDialog>`, `<RetryButton>`, `<CoverFallback>` — and rewire `<BookCard>` at the existing `data-slot` anchors. Drawer must open from both `/library` and the chat composer.

## Important Decisions

- Mounted `<AddGutendexSheet />` globally inside `<QueryClientProvider>` in `src/app/layout.tsx` so the same singleton serves both `/library` and the chat composer trigger; matches the module-singleton store convention shared with `<CitationSidePanel>`.
- Used `Sheet` + state-controlled `open` with `setAddBookDrawerOpen`/`closeAddBookDrawer` rather than `<SheetTrigger>` so external callers (LibraryGrid button, BookPicker link) drive open state via the existing `add-book-drawer-store`.
- For `RemoveBookDialog` and `RetryButton`, used a plain `<Button>` + state-controlled `<AlertDialog>` (no `<AlertDialogTrigger>`) so jsdom-based tests can drive open/close via `fireEvent.click` deterministically.
- `CoverFallback` palette: 8 hard-coded hex values (no token dependency since `--scholarly`/`--status-*` are domain-scoped). FNV-1a hash modulo 8 over the title.
- Optimistic library-cache update on add: when `['library']` is hydrated, prepend the new `Book` directly; otherwise invalidate. Keeps the `LibraryGrid` showing the new card immediately.

## Learnings

- TanStack Query's `placeholderData: keepPreviousData` keeps results visible across debounced query-key changes, but resetting them when the drawer closes still requires a separate `useEffect` watching `open`.
- `searchGutendex` returns `{ books, nextCursor, count }`; pagination via "Carregar mais" must call `searchGutendex({ ...params, cursor })` and append, not replace, results — handled in a `useMutation` to keep the page state local while letting React Query manage the initial fetch.
- `SearchGutendexParams` fields are `readonly`; building the params object via spread (not assignment) is required for typecheck.
- `getByText` in `BookCard.test.tsx` started matching both the heading and the SVG `<text>` inside `<CoverFallback>` once the new fallback was wired in. Switched the title/authors assertions to `data-slot` querySelector lookups to keep the test scoped.
- Biome `noArrayIndexKey` flags any use of an array-index variable inside a `key`, even when stable — sidestepped by precomputing `{ key, text, y }` objects with the index baked into the key string before the JSX map.

## Files / Surfaces

New:
- `apps/web/src/components/library/CoverFallback.tsx`
- `apps/web/src/components/library/RemoveBookDialog.tsx`
- `apps/web/src/components/library/RetryButton.tsx`
- `apps/web/src/components/library/AddGutendexSheet.tsx`
- `apps/web/__tests__/components/library/{CoverFallback,RemoveBookDialog,RetryButton,AddGutendexSheet}.test.tsx`

Modified:
- `apps/web/src/components/library/BookCard.tsx` — replaced inline fallback/remove/retry with the new components.
- `apps/web/src/app/layout.tsx` — mounted `<AddGutendexSheet />` globally.
- `apps/web/__tests__/components/library/BookCard.test.tsx` — updated remove/retry to click through the AlertDialog confirm; switched cover-card title assertion off `getByText` (now ambiguous due to SVG text).

## Errors / Corrections

- First-pass debounce test asserted `searchGutendex` was not called before debounce — failed because the empty-query initial fetch fires on open. Updated the test to clear the mock after the open-time fetch, then assert the typed query triggers the debounced second call.

## Ready for Next Run

- `<AddGutendexSheet />` is mounted globally; no further wiring needed for task_14.
- task_14 (Playwright happy path) can target stable `data-slot` anchors: `add-gutendex-sheet`, `add-gutendex-search`, `add-gutendex-filter-chip[data-language]`, `add-gutendex-row[data-state]`, `add-gutendex-row-add`, `add-gutendex-load-more`, `remove-book-dialog{,-confirm,-cancel}`, `retry-button-dialog{,-confirm,-cancel}`, `cover-fallback`.
- Drawer-state side effects (auto-focus, reset on close) live in `useEffect`s inside `AddGutendexSheet`; integration tests should rely on user-visible behavior, not trigger order.
