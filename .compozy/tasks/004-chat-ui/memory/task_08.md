# Task Memory: task_08.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Ship the four citation rendering components per ADR-003: `CitationBadge`, `CitationTooltip`, `CitationSidePanel`, `UnresolvedCitationBadge`, plus the `useCitationPanel` shared state and a `useMediaQuery` breakpoint hook. Wire `CitationBadge` into `DialogusMessage` to replace the existing placeholder.

## Important Decisions

- Shared state (`citation-panel-state.ts`) follows the existing module-singleton pattern (`useSyncExternalStore`) used by `add-book-drawer-store.ts`. No Zustand dep added; the public hook signature matches the spec exactly: `useCitationPanel(): { openChunkId, open(id), close() }`. A second internal hook `useUnresolvedPanel()` lives in the same module and clears `openChunkId` when opened (and vice versa) so the two panels never overlap.
- `ChunkReadDto` (from `@dialogus/shared/schemas/ingestion`) does NOT include `book_title` — the task spec's required aria-label and tooltip both need it. Resolved by issuing a secondary `useQuery(['book', chunk.book_id], fetchBookById)` once the chunk is loaded; this query is cached per book so multiple citations from the same book are free after the first.
- `excerpt_preview` is derived inline from `chunk.text.slice(0, 200)` (with ellipsis if truncated). The DTO has no `excerpt_preview` field.
- Side-panel "surrounding context" (chunk_id ± 1) is deferred to Phase 2 — chunk IDs are UUIDs, and `GET /api/library/chunks/:id` does not advertise neighbors. Documented inline in `CitationSidePanel` with a comment.
- `useMediaQuery('(min-width: 1024px)')` drives the desktop-vs-mobile sheet side. Implemented with `useSyncExternalStore` over `window.matchMedia`, SSR-safe (defaults to `false`).
- `CitationSidePanel` uses Radix's `onPointerDownOutside`/`onInteractOutside` with `event.preventDefault()` to honor ADR-003's "does not close on outside click" rule. Esc + the close button still close the sheet (Radix defaults).

## Learnings

- The `usePrefetchCitations` test mock returns a chunk shape that does NOT match `chunkReadDtoSchema`; the schema rejection is silent because TanStack `prefetchQuery` swallows query errors when nothing awaits the promise. Tests for the citation components seed the cache directly via `queryClient.setQueryData(...)` to avoid this issue.
- Tooltip portal content only mounts when the tooltip opens (Radix default). Tests need to `fireEvent.pointerEnter` (or hover via `mouseEnter`) the trigger AND wait for the 300 ms `delayDuration` to elapse before asserting tooltip content. Using `findBy*` with `vi.useFakeTimers()` + `vi.advanceTimersByTime(300)` is the cleanest path.
- `<Sheet>` (Radix Dialog) auto-mounts content into a portal only when open. Tests open the sheet by setting state directly via the store and then asserting the sheet contents.

## Files / Surfaces

- `apps/web/src/components/citation/citation-panel-state.ts` (new, module-singleton via `useSyncExternalStore`)
- `apps/web/src/hooks/useMediaQuery.ts` (new, SSR-safe matchMedia hook)
- `apps/web/src/components/citation/CitationBadge.tsx` (new)
- `apps/web/src/components/citation/CitationTooltip.tsx` (new)
- `apps/web/src/components/citation/CitationSidePanel.tsx` (new — handles chunk + unresolved kinds)
- `apps/web/src/components/citation/UnresolvedCitationBadge.tsx` (new)
- `apps/web/src/components/chat/DialogusMessage.tsx` (modified — swap `CitationBadgePlaceholder` for `CitationBadge`)
- `apps/web/src/components/chat/CitationBadgePlaceholder.tsx` (deleted — superseded)
- `apps/web/__tests__/components/citation/*` (new suite: badge, tooltip, sidepanel, unresolved, panel-state, mediaquery)
- `apps/web/__tests__/components/chat/DialogusMessage.test.tsx` (updated — placeholder → real badge)

## Errors / Corrections

- Initial draft of `DialogusMessage` rewrote unresolved tokens as `<UnresolvedCitationBadge>`. Reverted: parser `unresolved` (malformed marker) is distinct from ADR-003 unresolved (valid UUID not in tool_outputs). Parser tokens stay as raw text; the badge is mounted by task_11 when tool_outputs visibility lands.
- Biome flagged `aria-label` on a plain `<div>` inside `CitationSidePanel`'s chunk-content body. Removed; Radix Dialog already exposes `SheetTitle` as the accessible name. The inner div is unlabeled because the SheetContent wrapper carries the role.

## Ready for Next Run

- The chunk panel mounting is centralized in `CitationSidePanel` — task_11 must mount it once at the chat-page level (singleton). Mounting it inside `DialogusMessage` would create N panels; the shared store ensures only one is open but the DOM duplication is wasteful.
- Once Feature 002 exposes neighboring chunks (or a `book_title` field on the chunk DTO), the secondary `useQuery(['book', book_id])` lookup and the Phase 2 surrounding-context TODO inside `CitationSidePanel` can be removed.
