---
status: completed
title: "useSpoilerCap + useThreadMetadata hooks"
type: frontend
complexity: medium
dependencies:
  - task_02
---

# Task 05: useSpoilerCap + useThreadMetadata hooks

## Overview

Implement the two React hooks that own client-side state for spoiler caps (localStorage per ADR-002) and thread metadata (Mastra primary / fallback per ADR-007). Both hooks expose ergonomic APIs to the UI components in tasks 07–13: hydrate state, mutate via simple methods, signal `isLoaded` for the SSR-safe pattern, and clean up on thread delete.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/web/src/lib/spoiler-cap.ts` exporting:
  - `useSpoilerCap(threadId, bookId): { cap: number | null, isLoaded: boolean, setCap(value: number | null): void }`.
  - `readAllSpoilerCaps(threadId: string): Record<string, number>` — returns map of book_id → cap, used by composer to assemble request body.
  - `clearSpoilerCapsForThread(threadId: string): void` — used by `useThreadCleanup` (task_09) on thread delete.
- Hook MUST use `useEffect` to read localStorage on mount (avoiding SSR `localStorage is not defined` errors); `isLoaded` is `false` until then.
- Storage key shape: `dialogus:spoiler_cap:<thread_id>:<book_id>`. Value: integer chapter ordinal as string. Missing key = "no cap".
- `setCap(null)` MUST remove the key (not store the string `"null"`).
- MUST create `apps/web/src/lib/thread-metadata.ts` exporting:
  - `useThreadMetadata(threadId): { data: ThreadMetadata, isLoading: boolean, mutateRename(newTitle: string), mutatePin(pinned: boolean) }`.
  - Internally calls `threads.fetchThreadMetadata` + `threads.updateThreadMetadata` (task_03) which themselves choose Mastra primary or fallback per `MASTRA_THREAD_METADATA_AVAILABLE`.
  - Uses TanStack Query: `useQuery({ queryKey: ['thread-metadata', threadId] })` + `useMutation` with optimistic update + invalidation on success.
- Both hooks MUST be `'use client'` only — no Server Component usage.

</requirements>

## Subtasks

- [x] 5.1 Implement `useSpoilerCap` with localStorage hydration.
- [x] 5.2 Implement `readAllSpoilerCaps` + `clearSpoilerCapsForThread` helpers.
- [x] 5.3 Implement `useThreadMetadata` with TanStack Query + optimistic mutations.
- [x] 5.4 Unit tests covering hydration, mutation, cleanup.

## Implementation Details

Reference ADR-002 (spoiler-cap rationale + key shape) and ADR-007 (thread metadata path selection). The hooks are intentionally narrow — no global state library; React Query handles caching for thread metadata; localStorage for spoiler caps is direct DOM access.

For `useSpoilerCap`, the SSR-safe pattern is:
- Initial render: `isLoaded: false`, `cap: null` (server-rendered state).
- After `useEffect` mount: read localStorage, update state, `isLoaded: true`.
- Components consuming the hook show a loading skeleton or default value until `isLoaded`.

For `useThreadMetadata`, the optimistic mutation pattern is:
- `onMutate`: read current cache, return rollback context, write new value.
- `onError`: roll back from context, show toast.
- `onSettled`: invalidate queryKey to refetch authoritative state.

### Relevant Files

- `apps/web/src/lib/api/threads.ts` (task_03) — `fetchThreadMetadata`, `updateThreadMetadata`.
- `apps/web/src/lib/feature-flags.ts` (task_01) — `MASTRA_THREAD_METADATA_AVAILABLE` (consumed via threads.ts).
- ADR-002 (this feature) — spoiler-cap key shape.
- ADR-007 (this feature) — thread metadata flow.

### Dependent Files

- `apps/web/src/lib/spoiler-cap.ts` (new)
- `apps/web/src/lib/thread-metadata.ts` (new)
- `apps/web/__tests__/lib/spoiler-cap.test.ts` (new)
- `apps/web/__tests__/lib/thread-metadata.test.ts` (new)

### Related ADRs

- [ADR-002: localStorage spoiler caps](adrs/adr-002.md) — `useSpoilerCap` implementation.
- [ADR-007: Thread metadata primary + fallback](adrs/adr-007.md) — `useThreadMetadata` chooses path via flag.
- [ADR-004: Thread management](adrs/adr-004.md) — rename + pin call into `mutateRename` + `mutatePin`.

## Deliverables

- 2 hook files + helper functions.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests (`useSpoilerCap`):
  - [x] Initial render returns `isLoaded: false`, `cap: null` (no localStorage read on first render).
  - [x] After mount, localStorage with `dialogus:spoiler_cap:t1:b1` = '5' returns `cap: 5`, `isLoaded: true`.
  - [x] `setCap(10)` writes `'10'` to localStorage and updates state.
  - [x] `setCap(null)` removes the localStorage key.
  - [x] `readAllSpoilerCaps('t1')` returns map of all `b*` keys for that thread.
  - [x] `clearSpoilerCapsForThread('t1')` removes all `dialogus:spoiler_cap:t1:*` keys; leaves other threads' keys untouched.
- Unit tests (`useThreadMetadata`):
  - [x] `useThreadMetadata('t1')` initial render: `isLoading: true`, `data: { custom_title: null, pinned: false }`.
  - [x] After fetch resolves: `data` reflects API response, `isLoading: false`.
  - [x] `mutateRename('New Title')` triggers optimistic update — `data.custom_title === 'New Title'` immediately.
  - [x] On API error: rollback restores original; toast called.
  - [x] `mutatePin(true)` flips pinned; cache invalidated on settle.
- Integration tests:
  - [ ] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Both hooks work in `'use client'` components without SSR errors.
- `useSpoilerCap`'s `isLoaded` correctly signals hydration completion.
- `useThreadMetadata` mutations feel instant (optimistic updates land before network round-trip).
