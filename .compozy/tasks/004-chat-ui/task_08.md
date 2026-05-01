---
status: completed
title: "Citation components (Badge/Tooltip/SidePanel/Unresolved)"
type: frontend
complexity: medium
dependencies:
  - task_06
  - task_07
---

# Task 08: Citation components (Badge/Tooltip/SidePanel/Unresolved)

## Overview

Implement the four citation rendering components per ADR-003: `<CitationBadge>` (superscript numbered badge), `<CitationTooltip>` (300 ms hover preview), `<CitationSidePanel>` (right-side `<Sheet>` with full chunk + chapter context), and `<UnresolvedCitationBadge>` (warning glyph for unknown chunk IDs). These plug into `<DialogusMessage>` from task_07.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/web/src/components/citation/CitationBadge.tsx`:
  - Props: `{ chunkId: string, index: number, threadId: string, messageId: string }`.
  - Renders a `<sup>` with the index number (1, 2, 3...) inside a small badge styled per design tokens.
  - Wrapped in a shadcn `<Tooltip>` with 300 ms `delayDuration`; tooltip content is `<CitationTooltip chunkId={chunkId} />`.
  - Click opens `<CitationSidePanel chunkId={chunkId} />` via shared state (Zustand or context); only one side panel open at a time.
  - `aria-label` populated as `"Citação ${index}: capítulo ${chapter_ordinal} de ${book_title}"` — pulled from prefetched cache via `useQuery({ queryKey: ['chunk', chunkId] })`.
  - Visual: 16px tall, neutral background, subtle border, hover state.
- MUST create `apps/web/src/components/citation/CitationTooltip.tsx`:
  - Props: `{ chunkId: string }`.
  - Reads from `useQuery({ queryKey: ['chunk', chunkId] })` — should be cache-hit thanks to task_07's `usePrefetchCitations`.
  - Renders: book title (italic) → chapter ordinal + title → `excerpt_preview` (≤ 200 chars).
  - Loading state: small skeleton.
  - Error state: "Erro ao carregar citação" + retry icon.
- MUST create `apps/web/src/components/citation/CitationSidePanel.tsx`:
  - Right-side `<Sheet>` (shadcn `side="right"`); width 480px on desktop; bottom sheet on `<1024px` (use `useMediaQuery`).
  - Reads chunk via `useQuery({ queryKey: ['chunk', chunkId] })`; full text + chapter metadata + book title.
  - Surrounding context: optional fetch of `chunk_id - 1` and `chunk_id + 1` via separate queries to show 1-2 surrounding chunks (deferred to Phase 2 if API doesn't easily support; document if not implemented).
  - Close: `<SheetClose>` button + Esc key (default Radix behavior); does NOT close on outside click (per ADR-003).
  - Smooth scroll preserved while panel is open.
  - `aria-label` describes the open panel.
- MUST create `apps/web/src/components/citation/UnresolvedCitationBadge.tsx`:
  - Renders ⚠ glyph in a similar superscript shape; tooltip explains "citação não-resolvida"; click opens an explanatory panel ("Esta citação faz referência a um trecho que não foi encontrado nos resultados desta resposta.").
  - Distinct visual color (red or amber).
- MUST create a small Zustand store or React Context: `apps/web/src/components/citation/citation-panel-state.ts` exporting `useCitationPanel(): { openChunkId, open(id), close() }`. Only one panel open at a time.

</requirements>

## Subtasks

- [x] 8.1 Implement `CitationBadge` with shadcn `<Tooltip>` + click handler.
- [x] 8.2 Implement `CitationTooltip` reading from React Query.
- [x] 8.3 Implement `CitationSidePanel` with shadcn `<Sheet side="right">`.
- [x] 8.4 Implement `UnresolvedCitationBadge`.
- [x] 8.5 Implement `citation-panel-state.ts` shared state.
- [x] 8.6 Unit + component tests for each.

## Implementation Details

Reference TechSpec § Component Overview (citation/) for the file layout, ADR-003 (citation UX), ADR-009 (TanStack Query is the cache).

The `<CitationBadge>` is the single most-rendered component on the page; keep its render path short. The tooltip + side panel are children but should not always mount — use shadcn's lazy-mount pattern (default for `<Sheet>`).

For the surrounding-context fetch in `<CitationSidePanel>`, check Feature 002's `GET /chunks/:id` response shape — it may already include neighboring chunk IDs in metadata. If not, defer to Phase 2.

### Relevant Files

- `apps/web/src/components/ui/{tooltip,sheet}.tsx` (task_06).
- `apps/web/src/lib/api/chunks.ts` (task_03) — `fetchChunkById`.
- `apps/web/src/components/chat/usePrefetchCitations.ts` (task_07) — pre-warms cache.
- `apps/web/src/hooks/useMediaQuery.ts` (TBD here or task_07; verify) — breakpoint detection.
- ADR-003 — full UX spec.

### Dependent Files

- `apps/web/src/components/citation/CitationBadge.tsx` (new)
- `apps/web/src/components/citation/CitationTooltip.tsx` (new)
- `apps/web/src/components/citation/CitationSidePanel.tsx` (new)
- `apps/web/src/components/citation/UnresolvedCitationBadge.tsx` (new)
- `apps/web/src/components/citation/citation-panel-state.ts` (new)
- `apps/web/src/hooks/useMediaQuery.ts` (new if not authored already)
- `apps/web/__tests__/components/citation/*.test.tsx` (new — 4+ files)

### Related ADRs

- [ADR-003: Citation UX](adrs/adr-003.md) — primary reference.
- [ADR-006: shadcn for non-chat UI](adrs/adr-006.md) — `<Sheet>` + `<Tooltip>` from shadcn.

## Deliverables

- 5 files in `citation/` + 1 hook.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests:
  - [x] `CitationBadge` renders `<sup>` with index number.
  - [x] `CitationBadge` hover triggers tooltip after 300 ms. (delay constant verified; Radix Tooltip provider receives `delayDuration={300}`; live hover-timing covered by Playwright in task_14)
  - [x] `CitationBadge` click sets `useCitationPanel.openChunkId === chunkId`.
  - [x] `CitationBadge` `aria-label` is populated from prefetched cache.
  - [x] `CitationTooltip` shows skeleton when query is loading; renders book/chapter/excerpt when settled.
  - [x] `CitationSidePanel` opens with shadcn `<Sheet>` semantics; renders full text from cache.
  - [x] `CitationSidePanel` does NOT close on outside click; closes on Esc + close button. (close on Esc is Radix default + verified open via state; outside-click suppression verified via preventDefault)
  - [x] `UnresolvedCitationBadge` renders the ⚠ glyph + explanatory tooltip.
  - [x] `useCitationPanel` allows only one open at a time (open another → previous closes).
  - [x] Mobile breakpoint: at < 1024px, `CitationSidePanel` renders as bottom sheet (verify via mocked `useMediaQuery`).
- Integration tests:
  - [ ] Deferred to task_14 (Playwright clicks a real badge in a real response).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- A `<CitationBadge>` placed in a real `<DialogusMessage>` renders, hovers, clicks correctly.
- Side panel preserves scroll position of the message column behind it.
- Lighthouse a11y on a smoke page with citation badges ≥ 90.
