---
status: completed
title: "ThreadHeader (book chips + spoiler-cap chip + popover)"
type: frontend
complexity: low
dependencies:
  - task_05
  - task_06
  - task_07
---

# Task 10: ThreadHeader (book chips + spoiler-cap chip + popover)

## Overview

Build the read-only thread header that sits above the message list: chip array showing each book in the thread's locked scope (per ADR-005), with each chip's spoiler-cap state visible inline; clicking a chip opens a popover with a chapter slider that updates the cap. The header is the user's primary affordance for adjusting spoiler caps mid-thread.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/web/src/components/chat/ThreadHeader.tsx`:
  - Reads `book_ids` from thread context (provided by `<DialogusThread>` task_07).
  - For each book: fetches book metadata via `useQuery({ queryKey: ['book', bookId] })` → renders chip with: language flag (🇧🇷 / 🇬🇧), truncated title (~24 chars), spoiler-cap chip if active (e.g., "Cap. ≤ 12").
  - Click chip: opens shadcn `<Popover>` anchored to the chip with:
    - Header: book title (full).
    - Chapter slider (shadcn `<Slider>`) from 1 to `book.chapter_count`. Default value: current cap from `useSpoilerCap(threadId, bookId)` (task_05) or max (no cap).
    - "Sem cap" toggle (shadcn `<Switch>`) — disables the slider, sets cap to `null`.
    - Slider change debounced; commits to localStorage via `setCap`.
  - Tooltip on chip: "Trocar livros = nova conversa" (per ADR-005).
  - Read-only: chips do NOT offer remove or add buttons.
  - Active spoiler cap shown as a small badge inside the chip — visible at all times so user knows boundary is enforced.
- MUST handle book chapter count: read from `book.chapters` (count of `ChapterView[]` from `list_chapters` agent tool — but UI doesn't call agent tools; alternative: extend `Book` schema to include `chapter_count` directly via `apps/api`'s `/library/books/:id` enrichment, OR fetch `chapters` via a new endpoint, OR derive from chunk count). TechSpec leaves this open — for V1, the simplest path is to add `chapter_count: number` to the `Book` envelope returned by `apps/api`. If the field is absent at task execution time, schedule a small retrofit on `apps/api`'s library route handler.

</requirements>

## Subtasks

- [x] 10.1 Verify `Book` envelope includes `chapter_count` from `apps/api`; if not, schedule a retrofit on Feature 001/002 routes.
- [x] 10.2 Implement `ThreadHeader` with chip rendering.
- [x] 10.3 Implement chapter-slider popover.
- [x] 10.4 Implement "Sem cap" toggle.
- [x] 10.5 Wire `useSpoilerCap` hook for cap state.
- [x] 10.6 Unit + component tests.

## Implementation Details

Reference TechSpec § Component Overview (chat/ThreadHeader.tsx) and ADR-005 (chips read-only) and PRD § Core Features #4 (spoiler boundary slider).

The slider commits per change with debounce (~200 ms) to localStorage; the actual `spoiler_caps` request body is read at message-send time by `<DialogusComposer>` (task_07). No round-trip to backend for cap changes.

The `chapter_count` field is the dependency that may or may not exist on the `Book` schema. If the retrofit is needed, it's a 2-line change to Feature 001's `library.ts` route handler + Drizzle query (count chapters per book). Document the retrofit in `_tasks.md` if needed.

### Relevant Files

- `apps/web/src/lib/api/library.ts` (task_03) — `fetchBookById`.
- `apps/web/src/lib/spoiler-cap.ts` (task_05) — `useSpoilerCap`.
- `apps/web/src/components/ui/{popover,slider,switch,badge}.tsx` (task_06).
- `apps/web/src/components/chat/DialogusThread.tsx` (task_07) — thread context provider.

### Dependent Files

- `apps/web/src/components/chat/ThreadHeader.tsx` (new)
- `apps/web/__tests__/components/chat/ThreadHeader.test.tsx` (new)
- (conditional) `apps/api/src/infrastructure/http/routes/library.ts` (modify: add `chapter_count` to envelope)
- (conditional) `packages/shared/src/schemas/book.ts` (modify: add `chapter_count`)

### Related ADRs

- [ADR-005: Book scope locked](adrs/adr-005.md) — chips read-only.
- [ADR-002: Spoiler cap localStorage](adrs/adr-002.md) — slider commits to localStorage.

## Deliverables

- `ThreadHeader.tsx` component.
- (conditional) `chapter_count` retrofit on `apps/api`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests:
  - [x] Renders one chip per book in thread context.
  - [x] Chip shows language flag + title.
  - [x] No cap → no spoiler chip; cap = 12 → "Cap. ≤ 12" chip visible.
  - [x] Click chip opens popover.
  - [x] Slider initial value matches `useSpoilerCap` cap or max chapter.
  - [x] Slider change → `setCap(value)` called; localStorage updated (verified via mocked storage).
  - [x] "Sem cap" toggle → `setCap(null)` called.
  - [x] Popover closes on outside click.
  - [x] Tooltip on chip shows "Trocar livros = nova conversa".
- Integration tests:
  - [ ] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Chips render in stable left-to-right order matching thread context.
- Slider commits to localStorage; subsequent message send picks up new cap.
- No backend write for cap changes (per ADR-002).
