---
status: completed
title: "Chat-first landing /page.tsx (composição)"
type: frontend
complexity: medium
dependencies:
    - task_07
    - task_08
    - task_09
    - task_10
---

# Task 11: Chat-first landing /page.tsx (composição)

## Overview

Compose the chat-first landing route at `apps/web/src/app/page.tsx`: combines `<ThreadSidebar>` (task_09) on the left, `<ThreadHeader>` (task_10) + `<DialogusThread>` (task_07) in the center, and reserves the right side for `<CitationSidePanel>` (task_08). The page is a Server Component shell that delegates to client components for state.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST author `apps/web/src/app/page.tsx` as a Server Component:
  - Layout: 3-column grid on desktop (sidebar 280px / main flex / citation panel 480px).
  - Below 1024px: sidebar collapses into a drawer (shadcn `<Sheet side="left">` toggled by hamburger button); citation panel renders as bottom sheet (already handled by `<CitationSidePanel>` via `useMediaQuery` task_08).
  - Server-side prefetch of `listThreads()` via TanStack Query for initial sidebar render; pass through `<HydrationBoundary>` per ADR-009 pattern.
  - Renders `<DialogusLanding />` (Client Component child) — see below.
- MUST author `apps/web/src/app/_components/DialogusLanding.tsx` as a Client Component:
  - Reads active thread id from URL state or React state (hash routing or `useState` — TechSpec leaves open; use `useState` for V1 simplicity, route-based deep-linking is a Phase 2 feature).
  - When no active thread: shows `<ThreadSidebar>` + empty main state ("Selecione uma conversa ou comece uma nova").
  - When active thread: shows `<ThreadSidebar>` + `<ThreadHeader>` + `<DialogusThread>` with thread context provided.
  - Handles "Nova conversa" CTA: clears active thread; renders an "empty thread" state that's actually a thread-creation composer (book picker active, no message list yet).
- MUST handle the responsive layout via Tailwind v4 classes; no JS-driven layout switching beyond what `useMediaQuery` already provides for the citation panel.
- MUST verify keyboard navigation: Tab cycles sidebar → composer → message list; Esc closes any open sheet/popover (default Radix behavior).

</requirements>

## Subtasks

- [x] 11.1 Author `page.tsx` as Server Component shell with prefetch.
- [x] 11.2 Author `DialogusLanding.tsx` Client Component with active-thread state.
- [x] 11.3 Implement responsive layout (3-column desktop, drawer-mobile).
- [x] 11.4 Wire active-thread switching from sidebar.
- [x] 11.5 Wire "Nova conversa" empty state.
- [x] 11.6 Component tests covering layout + thread switching.

## Implementation Details

Reference TechSpec § Component Overview for the file layout. ADR-009 covers the RSC + TanStack Query hydration pattern; replicate the same shape used in task_12 (library page) for consistency.

The active-thread URL-state question: TechSpec defers this. For V1, use `useState` in `DialogusLanding`. Phase 2 can introduce deep-linkable URLs (`/thread/[id]` or `/?thread=<id>`) without breaking the V1 component contracts.

### Relevant Files

- `apps/web/src/components/chat/ThreadSidebar.tsx` (task_09).
- `apps/web/src/components/chat/ThreadRow.tsx` (task_09).
- `apps/web/src/components/chat/EmptyStateCard.tsx` (task_09).
- `apps/web/src/components/chat/ThreadHeader.tsx` (task_10).
- `apps/web/src/components/chat/DialogusThread.tsx` (task_07).
- `apps/web/src/components/citation/CitationSidePanel.tsx` (task_08).
- `apps/web/src/lib/api/threads.ts` (task_03) — server prefetch source.
- `apps/web/src/lib/query-client.tsx` (task_01) — `<HydrationBoundary>` setup.

### Dependent Files

- `apps/web/src/app/page.tsx` (modify: replace Foundation stub)
- `apps/web/src/app/_components/DialogusLanding.tsx` (new)
- `apps/web/__tests__/app/page.test.tsx` (new)

### Related ADRs

- [ADR-001: Full chat-first V1](adrs/adr-001.md) — defines what `/` shows.
- [ADR-009: RSC + TanStack hydration](adrs/adr-009.md) — pattern.
- Product [ADR-001: Chat-first product shape](../../dialogus/adrs/adr-001.md).

## Deliverables

- `page.tsx` Server Component.
- `DialogusLanding.tsx` Client Component.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests:
  - [x] `page.tsx` server-renders without errors; passes thread list to `<DialogusLanding>`.
  - [x] `<DialogusLanding>` no active thread → renders sidebar + "Selecione uma conversa" main.
  - [x] `<DialogusLanding>` active thread → renders sidebar + ThreadHeader + DialogusThread.
  - [x] "Nova conversa" CTA → clears active thread; main shows empty composer with book picker active.
  - [x] Selecting a different thread from sidebar → active thread switches.
  - [x] Below 1024px viewport (mocked via `useMediaQuery`) → sidebar renders as `<Sheet>` drawer triggered by hamburger.
  - [x] Citation panel state from `useCitationPanel` (task_08) opens/closes panel correctly.
- Integration tests:
  - [ ] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- `pnpm dev` opens `/` and shows the working chat-first landing.
- Layout responsive at the 1024px breakpoint.
- Keyboard navigation works (Tab cycles, Esc closes).
- No console errors during navigation.
