# Task Memory: task_09.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Sidebar surface for chat-first landing: ThreadSidebar (Fixadas + Recentes groups, empty-state delegation, "Nova conversa" CTA, "Gerenciar acervo" footer), ThreadRow (three-dot menu + inline rename + pin toggle + delete confirmation), EmptyStateCard (3 hardcoded onboarding titles via Gutendex add+ingest), `onboarding-titles.ts` constant, `useThreadCleanup` hook with localStorage spoiler-cap cleanup. Per ADR-001 / ADR-002 / ADR-004.

## Important Decisions

- `useThreadCleanup(threadId)` lives at `apps/web/src/hooks/useThreadCleanup.ts` and exports `THREADS_QUERY_KEY = ['threads'] as const`. Cleanup runs **synchronously inside `onMutate`** — `clearSpoilerCapsForThread(threadId)` fires before the API request, plus the row is optimistically removed from the cached `['threads']` list and restored on error.
- `ThreadRow` props are exactly `{ threadId, isActive, onSelect }`. Default title (Mastra `thread.title`, truncated to 40 chars) is read from the cached `['threads']` query via `useQuery({ queryKey: THREADS_QUERY_KEY, enabled: false })` — no extra API call, no extra prop.
- `EmptyStateCard` cover-fallback uses just `title.charAt(0)` to avoid duplicating the title text in the DOM (otherwise `getByText('Crime and Punishment')` matches twice). Real cover fallback (`<CoverFallback>`) lands in task_13.
- Onboarding ingestion polling uses `useQuery` keyed on `['onboarding-ingestion', bookId]` with `refetchInterval` = 2000ms while status ∈ {downloading, parsing, chunking, summarizing, embedding, indexing, cleaning, discovered}; stops on `ready`/`failed`. Card phase transitions are driven by a `useEffect` watching `status.data?.status` to avoid setState-in-render.

## Learnings

- Radix `<DropdownMenu.Trigger>` does NOT open from `fireEvent.click` in jsdom — it relies on `onPointerDown` semantics. The reliable test pattern is `fireEvent.keyDown(trigger, { key: 'Enter' })`.
- `useQuery({ queryKey, enabled: false })` does subscribe to the cache and re-renders on `setQueryData` updates — works as a "read cached list" hook without a re-fetch.
- For tests that mutate cache without an active observer for the read side (e.g. testing `useThreadCleanup` standalone), set `gcTime: 60_000` in the test QueryClient; otherwise `gcTime: 0` immediately drops the cache as soon as the only observer disappears, and `getQueryData` returns `undefined` even after the rollback runs.
- `StartIngestionResult` returned from `lib/api/library.ts:startIngestion` is `{ jobId }` only — no `resumingStage` (that lives on `RetryIngestionResult`).
- `<AlertDialog>` content is portaled — querying for `[data-slot="thread-row-delete-dialog"]` matches the portal node, not a child of the trigger row. Tests must use `document.querySelector`, not the row element.

## Files / Surfaces

- New: `apps/web/src/lib/onboarding-titles.ts`
- New: `apps/web/src/hooks/useThreadCleanup.ts`
- New: `apps/web/src/components/chat/EmptyStateCard.tsx`
- New: `apps/web/src/components/chat/ThreadRow.tsx`
- New: `apps/web/src/components/chat/ThreadSidebar.tsx`
- New: `apps/web/__tests__/hooks/useThreadCleanup.test.tsx`
- New: `apps/web/__tests__/components/chat/EmptyStateCard.test.tsx`
- New: `apps/web/__tests__/components/chat/ThreadRow.test.tsx`
- New: `apps/web/__tests__/components/chat/ThreadSidebar.test.tsx`

## Errors / Corrections

- Initial EmptyStateCard cover-fallback rendered `title.title.slice(0, 24)` which collided with `getByText` for "Crime and Punishment" (20 chars, fits the slice). Fixed to `charAt(0)`.
- Initial ThreadRow nested `<RenameOverlay>` (with an `<Input>`) inside the row's `<button data-slot="thread-row-select">`, which is invalid HTML. Restructured so the rename overlay replaces the button when `isRenaming === true`.
- Initial test pipeline used `fireEvent.click` to open the Radix DropdownMenu — never opened in jsdom. Switched to `fireEvent.keyDown(trigger, { key: 'Enter' })`.

## Completed

task_09 verified complete: 24 tests pass (4 test files), Biome linting clean (9 files), TypeScript compiles with zero errors. Task file updated to `status: completed` with all test checkboxes marked.

## Ready for Next Run

- task_10 (`ThreadHeader`) and task_11 (chat-first landing `/page.tsx`) consume `<ThreadSidebar>` directly. `<ThreadSidebar>` is a controlled component: `selectedThreadId: string | null`, `onSelectThread(id | null)` (null = "Nova conversa"). The page-level state for the active thread lives in task_11.
- The `['threads']` query key is now exported as `THREADS_QUERY_KEY` from `apps/web/src/hooks/useThreadCleanup.ts`. task_11's chat page must fetch via `useQuery({ queryKey: THREADS_QUERY_KEY, queryFn: listThreads })` so the sidebar's optimistic delete and ThreadRow's `useThreadFromList` read from the same cache.
- `<EmptyStateCard>` "Pronto!" link currently points to `/`. task_11 should ensure the chat-page route handler clears any pending thread selection so the link lands on a fresh composer, not a previously-selected thread.
- Real `<CoverFallback>` (task_13) replaces the inline `data-slot="onboarding-book-cover"` placeholder in `EmptyStateCard.tsx`.
