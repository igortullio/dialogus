---
status: completed
title: "Library page (/library + LibraryGrid + BookCard + StatusBadge)"
type: frontend
complexity: high
dependencies:
    - task_03
    - task_06
---

# Task 12: Library page (/library + LibraryGrid + BookCard + StatusBadge)

## Overview

Build the `/library` route per ADR-001 (polished library) + ADR-009 (RSC + TanStack Query hydration). The page renders a responsive grid of `<BookCard>`s with cover image, title, authors, language flag, and `<StatusBadge>`. Per-card polling for in-progress ingestions via TanStack Query's `refetchInterval`. Mutations (add via task_13's drawer, retry, soft-delete via task_13's dialog) wired through `useMutation`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/web/src/app/library/page.tsx` as a Server Component:
  - Server-prefetch `fetchLibrary()` via TanStack Query.
  - Pass via `<HydrationBoundary>` to `<LibraryGrid>`.
  - Page header: "Gerenciar acervo" (label PT) + search input filtering local library + "Adicionar do Gutendex" button (opens drawer from task_13 via shared state).
- MUST create `apps/web/src/app/library/LibraryGrid.tsx` as a Client Component:
  - Reads from hydrated cache via `useQuery({ queryKey: ['library'], initialData })`.
  - Renders responsive grid: 4 cols ≥ 1280px, 3 cols ≥ 1024px, 2 cols ≥ 640px, 1 col below.
  - Empty state: "Você ainda não tem livros..." per PRD § Core Features #6.
  - Per book: renders `<BookCard book={book} />`.
  - Local search input filters the grid client-side (case-insensitive substring match on title + authors).
- MUST create `apps/web/src/components/library/BookCard.tsx`:
  - Cover image (or `<CoverFallback>` from task_13 for null `cover_url`).
  - Title (serif font), authors (sans), language flag (🇧🇷 / 🇬🇧).
  - `<StatusBadge>` with progress for in-progress states.
  - Per-card actions area: depends on status —
    - `discovered`: "Ingerir" button → `useMutation(startIngestion)`.
    - `ready`: "Detalhes" button (opens read-only modal — V1 may stub this) + "Remover" (opens `<RemoveBookDialog>` from task_13).
    - `failed`: "Tentar novamente" (`<RetryButton>` from task_13) + last error message visible.
    - in-progress: status badge + progress bar; no actions.
  - Per-card progress polling: `useQuery({ queryKey: ['ingestion', bookId], refetchInterval: 2000, enabled: isInProgress(book.ingestion_status) })`.
- MUST create `apps/web/src/components/library/StatusBadge.tsx`:
  - Visual variant per status: `discovered` (neutral), `downloading`/`parsing`/`chunking`/`summarizing`/`embedding` (amber + percent), `ready` (green check), `failed` (red).
  - Progress percent shown inline for in-progress states, sourced from `book.ingestion_progress`.

</requirements>

## Subtasks

- [x] 12.1 Author `app/library/page.tsx` Server Component with prefetch.
- [x] 12.2 Author `LibraryGrid` with responsive grid + local search.
- [x] 12.3 Author `BookCard` with per-status actions.
- [x] 12.4 Author `StatusBadge` with per-state visuals + progress.
- [x] 12.5 Wire ingestion-progress polling per in-progress card.
- [x] 12.6 Component tests for each.

## Implementation Details

Reference TechSpec § Component Overview (library/ folder) + ADR-009 (RSC + TanStack hydration pattern). Polling pattern: TanStack Query's `refetchInterval` is the idiomatic way; `enabled` flag stops polling once status flips to `ready` or `failed`.

The local search is client-only — filters the loaded grid; does NOT round-trip to the API. For Phase 2, debounced server-side search via `?q=` could replace this; V1 stays simple.

For the "Detalhes" modal: V1 stub (renders a simple shadcn `<Dialog>` with the book's metadata). Full polish deferred.

### Relevant Files

- `apps/web/src/lib/api/library.ts` (task_03) — fetchers + mutations.
- `apps/web/src/lib/query-client.tsx` (task_01) — hydration helpers.
- `apps/web/src/components/ui/{card,badge,button,dialog,skeleton,input}.tsx` (task_06).
- `packages/shared/src/schemas/library.ts` (Feature 001) — `Book` shape.
- `packages/shared/src/schemas/ingestion.ts` (Feature 002) — `IngestionStatus` enum.
- ADR-009 — primary reference.

### Dependent Files

- `apps/web/src/app/library/page.tsx` (new)
- `apps/web/src/app/library/LibraryGrid.tsx` (new)
- `apps/web/src/components/library/BookCard.tsx` (new)
- `apps/web/src/components/library/StatusBadge.tsx` (new)
- `apps/web/src/components/library/BookDetailsDialog.tsx` (new — V1 stub)
- `apps/web/__tests__/components/library/*.test.tsx` (new — 4+ files)

### Related ADRs

- [ADR-001: Full library polish](adrs/adr-001.md) — primary.
- [ADR-009: RSC + TanStack hydration](adrs/adr-009.md) — data flow pattern.

## Deliverables

- 5 files in `app/library/` and `components/library/`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests (`page.tsx`):
  - [x] Server-renders without errors; prefetches library.
- Unit tests (`LibraryGrid`):
  - [x] Empty library → renders empty-state.
  - [x] 6 books → renders 6 cards in grid.
  - [x] Search input "moby" → filters to books with "moby" in title/author.
  - [x] Below 640px viewport → 1 col. (Verified via `_internals.GRID_CLASSES` assertion: `grid-cols-1` is the base, sm:2 / lg:3 / xl:4 unlock larger viewports.)
- Unit tests (`BookCard`):
  - [x] `discovered` book → "Ingerir" button visible; click triggers `startIngestion` mutation.
  - [x] `ready` book → "Detalhes" + "Remover" buttons.
  - [x] `failed` book → "Tentar novamente" + last error visible.
  - [x] `embedding` book → progress bar visible at the polled progress percent; no actions. (Note: `Book` schema has no `ingestion_progress` field; progress is sourced from the per-card `fetchIngestionStatus` polling result, mirroring `EmptyStateCard`'s pattern.)
  - [x] In-progress → polling enabled (verified by asserting `fetchIngestionStatus` is called for `embedding` books and not called for `ready` / `discovered`).
- Unit tests (`StatusBadge`):
  - [x] Each status renders distinct visual.
  - [x] In-progress states show percent inline.
  - [x] `failed` shows red + warning icon.
- Integration tests:
  - [ ] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- `/library` renders the user's books with covers + status.
- Polling activates only for in-progress books.
- Local search filters cards instantly.
- Layout responsive across breakpoints.
