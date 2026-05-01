---
status: completed
title: "Streaming-aware citation parser + tests"
type: frontend
complexity: medium
dependencies:
  - task_01
---

# Task 04: Streaming-aware citation parser + tests

## Overview

Implement the streaming-aware parser per ADR-008 that converts SSE delta text into a token stream of `text` + `citation` + `unresolved` tokens. The parser is a pure stateful function: input = (delta text, prior state); output = (tokens emitted, next state). A 60-character buffer-bailout heuristic prevents runaway state on malformed markers. Comprehensive unit tests cover all state transitions.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/web/src/lib/citation-parser.ts` exporting:
  - Type `ParserState = { kind: 'text' } | { kind: 'marker_pending'; buffer: string }`.
  - Type `Token = { kind: 'text'; text: string } | { kind: 'citation'; chunkId: string } | { kind: 'unresolved'; rawText: string }`.
  - Function `initialParserState(): ParserState` returning `{ kind: 'text' }`.
  - Function `parseStream(deltaText: string, state: ParserState): { tokens: Token[]; nextState: ParserState }`. Pure (no side effects).
- Parser MUST follow the state machine in TechSpec § Citation parser state machine and ADR-008:
  - `text` → on `{{`: enter `marker_pending(buffer="")`.
  - `marker_pending` → accumulate chars; on `}}`: extract buffer, validate, emit `citation` (if matches `cite:<UUIDv4>`) or `unresolved` (otherwise), return to `text`.
  - 60-char buffer cap → emit `unresolved` with `{{` + buffer, return to `text`.
- MUST reuse `CITATION_MARKER_REGEX` exported from `@dialogus/rag` for the validation step. Do NOT redeclare the regex.
- Parser MUST handle: split markers across delta boundaries, multiple markers per delta, malformed markers (e.g., `{{not-cite:...}}`), markers near stream end (final delta finishes inside `marker_pending`), empty delta strings.
- Parser MUST NOT throw — every input maps to a token sequence + next state.

</requirements>

## Subtasks

- [x] 4.1 Author `citation-parser.ts` with the state machine.
- [x] 4.2 Author exhaustive unit tests covering all transitions.
- [x] 4.3 Verify regex import from `@dialogus/rag` works under Next 16's bundler.

## Implementation Details

Reference TechSpec § Citation parser state machine (ASCII diagram) and ADR-008 (rationale + alternatives). The function is intentionally simple — a 50-100 line state machine with no async. Test coverage is the primary deliverable; the parser itself is unremarkable code, but its correctness gates every chat message render.

The 60-char bailout handles "the LLM emitted `{{cite:` but never `}}`" cases — e.g., truncation at the model's token limit. Beyond 60 chars, the parser bails and emits the buffered text as an unresolved literal so the user sees something rather than the parser hanging in `marker_pending` forever.

### Relevant Files

- `packages/rag/src/domain/constants/citation.ts` (Feature 003 task_01) — `CITATION_MARKER_REGEX`.
- TechSpec § Citation parser state machine — full state diagram.
- ADR-008 — rationale + buffer bailout + edge cases.

### Dependent Files

- `apps/web/src/lib/citation-parser.ts` (new)
- `apps/web/__tests__/lib/citation-parser.test.ts` (new)

### Related ADRs

- [ADR-008: Streaming-aware citation marker parser](adrs/adr-008.md) — primary reference.
- Feature 003 [ADR-007: Citation marker format](../003-rag-agent/adrs/adr-007.md) — marker contract.

## Deliverables

- `citation-parser.ts` pure function.
- Comprehensive unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_14 (full chat flow exercises the parser).

## Tests

- Unit tests:
  - [x] `parseStream('hello', initialState)` → tokens=`[{kind:'text', text:'hello'}]`, nextState=`{kind:'text'}`.
  - [x] `parseStream('hello {{', initialState)` → tokens=`[{kind:'text', text:'hello '}]`, nextState=`{kind:'marker_pending', buffer:''}`.
  - [x] `parseStream('cite:abc', {kind:'marker_pending', buffer:''})` → no tokens, buffer='cite:abc'.
  - [x] `parseStream('-123-...-...-...-...-..}}', {kind:'marker_pending', buffer:'cite:abc'})` (full UUID complete) → emit citation token with chunkId.
  - [x] Full sequence: `parseStream('hello {{cite:01234567-89ab-cdef-0123-456789abcdef}}!', initialState)` → 3 tokens (text 'hello ', citation, text '!').
  - [x] Multiple markers: `parseStream('a{{cite:<uuid1>}}b{{cite:<uuid2>}}c', initialState)` → 5 tokens.
  - [x] Malformed marker: `parseStream('{{notcite:abc}}', initialState)` → emit unresolved with raw '{{notcite:abc}}'; return to text state.
  - [x] Bailout: `parseStream('{{this is way more than sixty characters of buffer content...}}', initialState)` (> 60 chars before `}}`) → emit unresolved with `{{` + buffer; return to text.
  - [x] Empty delta: `parseStream('', state)` → no tokens, state unchanged.
  - [x] End-of-stream in marker_pending: parser-end caller sees `nextState.kind === 'marker_pending'` and can flush as unresolved (no special handling in parser; flush is caller's choice).
  - [x] Single open brace: `parseStream('a{b', initialState)` → emit text 'a{b' (single brace not a marker).
  - [x] Marker with single trailing brace: `parseStream('{{cite:<uuid>}', initialState)` → no emission yet, state in marker_pending with buffer 'cite:<uuid>}'.
- Integration tests:
  - [ ] Deferred to task_14 (Playwright happy path exercises real LLM stream parsing).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage 100% (preferred for this critical pure function).
- Parser is 100% pure: no `Date.now()`, no `Math.random()`, no I/O.
- Parser handles every valid Mastra SSE delta sequence without throwing.
