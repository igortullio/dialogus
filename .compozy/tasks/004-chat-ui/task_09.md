---
status: completed
title: "Sidebar (ThreadSidebar/ThreadRow/EmptyStateCard)"
type: frontend
complexity: medium
dependencies:
  - task_05
  - task_06
---

# Task 09: Sidebar (ThreadSidebar/ThreadRow/EmptyStateCard)

## Overview

Build the chat-first landing's left sidebar: thread list grouped into "Fixadas" + "Recentes", "Nova conversa" CTA, "Gerenciar acervo" footer link, and the "Primeiros passos" empty state with three pre-filled book recommendations. Per-row three-dot menu enables rename + pin + delete (per ADR-004).

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/web/src/components/chat/ThreadSidebar.tsx`:
  - Reads thread list via `useQuery({ queryKey: ['threads'], queryFn: listThreads })` from `lib/api/threads.ts`.
  - Renders header: `<button>` "Nova conversa" → starts new thread (clears selection; opens empty composer).
  - Renders two groups: "Fixadas" (thread metadata `pinned: true`, sorted by `updated_at` desc) + "Recentes" (rest, sorted by last-message timestamp desc). Group label hidden when section empty.
  - Renders footer: `<Link>` to `/library` labeled "Gerenciar acervo".
  - Empty state: when `threads.length === 0`, renders `<EmptyStateCard />` instead of the list.
- MUST create `apps/web/src/components/chat/ThreadRow.tsx`:
  - Props: `{ threadId: string, isActive: boolean, onSelect(threadId) }`.
  - Reads thread title via `useThreadMetadata(threadId)` (task_05) — `custom_title` if set, else default (first message truncated to ~40 chars; pulled from Mastra thread directly).
  - Hover: shows three-dot menu icon; click opens shadcn `<DropdownMenu>` with "Renomear" / "Fixar"/"Desafixar" / "Excluir".
  - Renomear: replaces title with inline `<Input>`, auto-focused, select-all; Enter or blur saves via `mutateRename`; Esc cancels.
  - Fixar/Desafixar: toggles via `mutatePin`.
  - Excluir: opens shadcn `<AlertDialog>` confirming with thread title; on confirm, calls `useThreadCleanup(threadId)` (this task or extracted helper) which:
    - Clears localStorage spoiler caps (`clearSpoilerCapsForThread` from task_05).
    - Calls `deleteThread(threadId)` API.
    - Optimistically removes the row from sidebar.
- MUST create `apps/web/src/components/chat/EmptyStateCard.tsx`:
  - Renders three book cards (Monte Cristo, Brás Cubas, Crime and Punishment) using hardcoded Gutendex IDs from `apps/web/src/lib/onboarding-titles.ts` (author here as a small constant export).
  - Each card: cover image (or `<CoverFallback>` from task_13 — placeholder import), title, author, language flag.
  - Per-card "Adicionar e ingerir" button: calls `addBook(gutendexId, idempotencyKey)` then `startIngestion(...)` in sequence; shows progress until `ready`.
  - On all three `ready`, the card collapses with a "Pronto!" message + link to compose.
  - Copy in PT, conversational ("comece com:"), not promotional.
- MUST create `apps/web/src/lib/onboarding-titles.ts` exporting:
  - `ONBOARDING_TITLES: Array<{ gutendexId: number, title: string, language: 'en' | 'pt' }>` with the three IDs verified at task_01 against Gutendex search.

</requirements>

## Subtasks

- [x] 9.1 Author `onboarding-titles.ts` constant (verify Gutendex IDs at execution time).
- [x] 9.2 Implement `EmptyStateCard` with one-click ingestion flow.
- [x] 9.3 Implement `ThreadRow` with three-dot menu + rename overlay + delete confirm.
- [x] 9.4 Implement `ThreadSidebar` with groups + empty-state + new-thread CTA.
- [x] 9.5 Author `useThreadCleanup` helper (or inline if simple).
- [x] 9.6 Unit + component tests for each.

## Implementation Details

Reference TechSpec § Data flow — thread rename + pin + delete for the lifecycle. ADR-004 covers thread management surface; ADR-002 covers localStorage cleanup on delete.

The Gutendex IDs in `ONBOARDING_TITLES` should be verified during task_01 (TechSpec § Key Decisions #13 enumerates the three): The Count of Monte Cristo (`1184`), Memórias Póstumas de Brás Cubas (`54829`), Crime and Punishment (`2554`). Use these as defaults; adjust after Gutendex verification if any have changed.

### Relevant Files

- `apps/web/src/lib/api/threads.ts` (task_03) — list, delete, mutate.
- `apps/web/src/lib/api/library.ts` (task_03) — addBook + startIngestion + ingestion polling.
- `apps/web/src/lib/spoiler-cap.ts` (task_05) — `clearSpoilerCapsForThread`.
- `apps/web/src/lib/thread-metadata.ts` (task_05) — `useThreadMetadata`.
- `apps/web/src/components/ui/{dropdown-menu,alert-dialog,input}.tsx` (task_06).

### Dependent Files

- `apps/web/src/components/chat/ThreadSidebar.tsx` (new)
- `apps/web/src/components/chat/ThreadRow.tsx` (new)
- `apps/web/src/components/chat/EmptyStateCard.tsx` (new)
- `apps/web/src/lib/onboarding-titles.ts` (new)
- `apps/web/src/hooks/useThreadCleanup.ts` (new — or inline in ThreadRow)
- `apps/web/__tests__/components/chat/*.test.tsx` (new — 3+ files)

### Related ADRs

- [ADR-004: Thread CRUD + pin](adrs/adr-004.md) — primary reference.
- [ADR-002: localStorage spoiler-cap cleanup on delete](adrs/adr-002.md).
- [ADR-001: "Primeiros passos" card scope](adrs/adr-001.md).

## Deliverables

- 4 component files + 1 lib constant + optional 1 hook.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests (`ThreadSidebar`):
  - [x] Empty threads → renders `<EmptyStateCard>`.
  - [x] 5 threads, 2 pinned → renders "Fixadas" group with 2 + "Recentes" with 3.
  - [x] All threads pinned → "Recentes" group hidden.
  - [x] "Nova conversa" click clears selection.
- Unit tests (`ThreadRow`):
  - [x] Renders thread title (custom_title if set, else first message).
  - [x] Three-dot menu opens; "Renomear" → inline input.
  - [x] Inline input save → `mutateRename` called.
  - [x] "Fixar" → `mutatePin(true)` called; row moves to Fixadas group.
  - [x] "Excluir" → `<AlertDialog>` opens; on confirm, cleanup runs (localStorage cleared) + delete API called.
  - [x] On delete error: row restored, toast shown.
- Unit tests (`EmptyStateCard`):
  - [x] Renders 3 cards (Monte Cristo, Brás Cubas, Crime and Punishment).
  - [x] Click "Adicionar e ingerir" on Brás Cubas → mocked addBook called with gutendex_id 54829.
  - [x] After successful add, card shows ingestion progress.
  - [x] All cards `ready` → "Pronto!" message + link.
- Integration tests:
  - [x] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Sidebar renders threads grouped correctly.
- Rename, pin, delete all work optimistically and gracefully on error.
- "Primeiros passos" card disappears when at least one thread exists.
- localStorage cleanup verified on thread delete.
