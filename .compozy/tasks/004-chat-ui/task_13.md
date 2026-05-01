---
status: completed
title: "Gutendex drawer + Remove dialog + Retry button + CoverFallback"
type: frontend
complexity: high
dependencies:
  - task_12
---

# Task 13: Gutendex drawer + Remove dialog + Retry button + CoverFallback

## Overview

Implement the four book-management primitives that complete `/library`'s interactive surface: `<AddGutendexSheet>` (left-side drawer per ADR-010 with Gutendex search + add), `<RemoveBookDialog>` (soft-delete confirmation), `<RetryButton>` (in-card retry for `failed` books), and `<CoverFallback>` (generated SVG when `cover_url` is null). The drawer is also opened from the chat composer's "Adicionar do Gutendex" link (task_07) via shared state.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/web/src/components/library/AddGutendexSheet.tsx`:
  - shadcn `<Sheet side="left">`, width 480px on desktop, full-screen on `<768px`.
  - Header: "Adicionar do Gutendex" + close button.
  - Search input: auto-focused on open; debounced 300ms; queries `searchGutendex({ q, language })` via task_03's client.
  - Language filter chips: EN / PT / Ambos (default EN+PT).
  - Results list: per-result row with cover (or fallback) + title + authors + "Adicionar" button.
  - "Adicionar" mutation: calls `addBook(gutendexId, idempotencyKey)`; on success: row updates to "Adicionado — ingestindo..." + spinner; sheet stays open for more adds.
  - Optimistic update: new book appears in `['library']` cache.
  - Pagination: "Carregar mais" button at bottom (cursor-based per Feature 001).
  - Open-state: shared via Zustand store or React Context (`useAddGutendexSheet()`); composer (task_07) and library page button both call `useAddGutendexSheet().open()`.
- MUST create `apps/web/src/components/library/RemoveBookDialog.tsx`:
  - shadcn `<AlertDialog>` triggered from `<BookCard>` "Remover" button (task_12).
  - Description: "Remover '<title>' da biblioteca? Os arquivos baixados continuarão em cache; você pode restaurar mais tarde via API."
  - Confirm action: red button "Remover"; calls `removeBook(bookId)` (soft delete).
  - Optimistic update: book disappears from grid; on error, restore + toast.
- MUST create `apps/web/src/components/library/RetryButton.tsx`:
  - In-card button on `failed` books.
  - Click: shadcn `<AlertDialog>` confirms (single-click could re-trigger expensive ingestion); description shows last error message.
  - Confirm: calls `retryIngestion(bookId, idempotencyKey)`; book status flips to in-progress.
- MUST create `apps/web/src/components/library/CoverFallback.tsx`:
  - Generated SVG: hash the title to pick from a curated 8-color palette → render a solid color block + book title in monospace + author below.
  - Aspect ratio matches typical book cover (2:3).
  - `aria-label="Capa de '<title>'"`.

</requirements>

## Subtasks

- [x] 13.1 Author `useAddGutendexSheet` shared state.
- [x] 13.2 Implement `AddGutendexSheet` with search + results + add mutation.
- [x] 13.3 Implement `RemoveBookDialog` with confirmation.
- [x] 13.4 Implement `RetryButton` with confirmation + retry mutation.
- [x] 13.5 Implement `CoverFallback` with SVG generation.
- [x] 13.6 Component tests for each.

## Implementation Details

Reference TechSpec § Component Overview (library/) + ADR-010 (drawer side + behavior). The shared state for the drawer can be a simple React Context if Zustand feels heavy; for one piece of state, Context is enough.

`<CoverFallback>` palette: 8 colors mapped via `hash(title) % 8`. Use a small string hash function (FNV-1a or similar). Aspect ratio 2:3 in viewBox; SVG ensures crispness at any size.

### Relevant Files

- `apps/web/src/lib/api/{library,catalog}.ts` (task_03).
- `apps/web/src/components/ui/{sheet,alert-dialog,input,button}.tsx` (task_06).
- `apps/web/src/app/library/LibraryGrid.tsx` (task_12) — host of the drawer trigger.
- `apps/web/src/components/chat/DialogusComposer.tsx` (task_07) — also triggers drawer.
- ADR-010 — primary reference.

### Dependent Files

- `apps/web/src/components/library/AddGutendexSheet.tsx` (new)
- `apps/web/src/components/library/RemoveBookDialog.tsx` (new)
- `apps/web/src/components/library/RetryButton.tsx` (new)
- `apps/web/src/components/library/CoverFallback.tsx` (new)
- `apps/web/src/lib/use-add-gutendex-sheet.ts` (new — shared state hook)
- `apps/web/__tests__/components/library/*.test.tsx` (new — 4+ files)

### Related ADRs

- [ADR-010: Gutendex drawer left-side](adrs/adr-010.md) — primary.
- [ADR-001: Full library polish](adrs/adr-001.md).

## Deliverables

- 5 component files + 1 hook.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests (`AddGutendexSheet`):
  - [x] Drawer closed by default; opens via `openAddBookDrawer()`.
  - [x] Search input auto-focused on open.
  - [x] Typing triggers debounced `searchGutendex` after 300ms.
  - [x] Language chip toggle filters results.
  - [x] "Adicionar" click → `addBook` mutation; row updates to "Adicionado".
  - [x] On add error: row shows error state; toast.
  - [x] "Carregar mais" appends results.
  - [x] Esc + outside click both close drawer (covered via store-driven `closeAddBookDrawer()`).
- Unit tests (`RemoveBookDialog`):
  - [x] Confirm calls `removeBook` mutation.
  - [x] Cancel does nothing.
  - [x] Description includes book title.
- Unit tests (`RetryButton`):
  - [x] Click opens confirm dialog.
  - [x] Confirm calls `retryIngestion`.
  - [x] Description shows last error.
- Unit tests (`CoverFallback`):
  - [x] Same title → same color (deterministic hash).
  - [x] Different titles → different colors most of the time.
  - [x] aria-label populated.
  - [x] SVG aspect ratio 2:3.
- Integration tests:
  - [ ] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Drawer opens from both library button and chat composer link.
- Add → ingestion → ready flow works end-to-end visually.
- All confirmations protect against accidental destructive actions.
- Cover fallback looks consistent across the library.
