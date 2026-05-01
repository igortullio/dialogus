---
status: completed
title: "assistant-ui glue layer (DialogusThread/Composer/Message)"
type: frontend
complexity: high
dependencies:
  - task_03
  - task_04
  - task_05
  - task_06
---

# Task 07: assistant-ui glue layer (DialogusThread/Composer/Message)

## Overview

Build the dIAlogus-owned glue layer that wraps assistant-ui's `<Thread>`, `<Composer>`, and `<Message>` primitives with project-specific styling and behavior: the citation parser plugs into message rendering; spoiler-cap state composes into composer requests; the book picker integrates with the composer; the cancel-stream button is wired. Per ADR-006, this layer is the only place outside `apps/web/src/components/chat/` that touches assistant-ui APIs — upstream changes are absorbed here.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/web/src/components/chat/DialogusThread.tsx` that wraps assistant-ui `<Thread>` (or equivalent at the pinned version):
  - Configures `useChat` from `@assistant-ui/react-ai-sdk` with: `api` = `${NEXT_PUBLIC_MASTRA_URL}/api/agents/dialogusAgent/stream`, custom body builder reading thread state (`thread_id`, `book_ids`, `spoiler_caps`).
  - Maps thread metadata + book scope to thread context (provided to children via React Context for `<DialogusComposer>` + `<DialogusMessage>` to consume).
  - Handles streaming errors → toast + inline error message.
- MUST create `apps/web/src/components/chat/DialogusMessage.tsx` that wraps assistant-ui's message renderer:
  - Pipes the text content through `parseStream` (task_04) progressively as deltas arrive.
  - Renders `text` tokens as plain text; `citation` tokens as `<CitationBadge>` (task_08, placeholder import here); `unresolved` tokens as raw text.
  - Maintains a per-message citation index counter (1, 2, 3...) and passes the counter to each badge.
  - Pre-fetches all `tool_outputs[*].chunks[*].chunk_id` via TanStack Query when the stream completes (uses `usePrefetchCitations` hook — author here as a small helper since it's tightly coupled to message rendering).
- MUST create `apps/web/src/components/chat/DialogusComposer.tsx` that wraps assistant-ui's composer:
  - Multi-select book picker (uses shadcn `<Popover>` + `<Command>` per shadcn AI patterns) reading `ready` books via TanStack Query (`useQuery({ queryKey: ['library', 'ready'] })`).
  - "Adicionar do Gutendex" link inside the picker dropdown opens the same drawer as task_13 via shared state.
  - Composer disabled during stream; cancel button visible; Cmd/Ctrl+Enter sends.
  - On send: assembles `book_ids` from picker, `spoiler_caps` via `readAllSpoilerCaps(threadId)` (task_05), `thread_id` from current thread context.
  - Soft limit at 3 books with tooltip "máximo 3 livros por conversa" (per TechSpec § Key Decisions #14).
- MUST NOT directly import from assistant-ui anywhere outside `apps/web/src/components/chat/` (or sibling glue). Other components consume only the dIAlogus wrappers.
- MUST integrate the parser state across deltas — the parser state is per-message, stored in component-local state (resets per new message).

</requirements>

## Subtasks

- [x] 7.1 Configure `useChat` against `apps/mastra` with custom body builder.
- [x] 7.2 Implement `DialogusThread` with thread context provider.
- [x] 7.3 Implement `DialogusMessage` with streaming-aware citation parsing.
- [x] 7.4 Implement `DialogusComposer` with book picker, spoiler-cap reader, soft-limit guard, send/cancel.
- [x] 7.5 Author `usePrefetchCitations` helper for post-stream chunk prefetch.
- [x] 7.6 Unit + component tests for each wrapper.

## Implementation Details

Reference TechSpec § System Architecture → Data flow (ask grounded question) for the full request lifecycle, ADR-006 for the glue-layer rationale, ADR-008 for parser integration semantics. assistant-ui's `<Thread>` API at the pinned version drives the actual implementation; document any divergences from official docs in inline comments.

The book picker's "Adicionar do Gutendex" link triggers the drawer state (task_13); use a small Zustand store or React Context to share the open/close state across the chat composer + library page.

### Relevant Files

- `apps/web/src/lib/api/library.ts` (task_03) — fetch ready books for picker.
- `apps/web/src/lib/api/threads.ts` (task_03) — list threads, used for thread context.
- `apps/web/src/lib/api/chunks.ts` (task_03) — used by `usePrefetchCitations`.
- `apps/web/src/lib/citation-parser.ts` (task_04) — parser plugged into `DialogusMessage`.
- `apps/web/src/lib/spoiler-cap.ts` (task_05) — `readAllSpoilerCaps` used at send.
- `apps/web/src/components/ui/{popover,command,tooltip}.tsx` (task_06).
- assistant-ui official docs for `<Thread>` + `<Composer>` + `useChat` integration at the pinned version.

### Dependent Files

- `apps/web/src/components/chat/DialogusThread.tsx` (new)
- `apps/web/src/components/chat/DialogusMessage.tsx` (new)
- `apps/web/src/components/chat/DialogusComposer.tsx` (new)
- `apps/web/src/components/chat/usePrefetchCitations.ts` (new)
- `apps/web/src/components/chat/__tests__/*.test.tsx` (new — 3+ files)

### Related ADRs

- [ADR-006: assistant-ui glue layer](adrs/adr-006.md) — primary rationale.
- [ADR-008: Streaming-aware citation parser](adrs/adr-008.md) — parser integrated here.
- [ADR-005: Book scope locked at thread creation](adrs/adr-005.md) — composer enables picker only on new threads.
- Feature 003 [ADR-006: per-request spoiler caps](../../003-rag-agent/adrs/adr-006.md) — body shape.

## Deliverables

- 4 component files in `chat/`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests:
  - [ ] `DialogusComposer` render: empty book picker, send button disabled (no books selected).
  - [ ] `DialogusComposer` book selection: select 1 book → send button enabled.
  - [ ] `DialogusComposer` soft limit: select 4 books → 4th rejected with tooltip.
  - [ ] `DialogusComposer` send: assembles `body = { message, book_ids, spoiler_caps, thread_id? }` with mocked `useChat`.
  - [ ] `DialogusComposer` Cmd+Enter triggers send.
  - [ ] `DialogusComposer` cancel button visible during stream; clears stream.
  - [ ] `DialogusMessage` renders text-only message (no citations) cleanly.
  - [ ] `DialogusMessage` parses streamed deltas with one citation marker → renders text + `<CitationBadge>` placeholder.
  - [ ] `DialogusMessage` indexes multiple citations 1, 2, 3 within the same message.
  - [ ] `DialogusMessage` resets parser state on new message id.
  - [ ] `usePrefetchCitations` calls `queryClient.prefetchQuery` once per unique chunk_id from `tool_outputs`.
  - [ ] `DialogusThread` provides thread context to children.
- Integration tests:
  - [ ] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- assistant-ui imports limited to `apps/web/src/components/chat/`.
- A new message containing `{{cite:<uuid>}}` markers renders with badges in real time as deltas arrive.
- Composer's spoiler-cap + book-id assembly matches the ChatStreamRequest schema (task_02).
