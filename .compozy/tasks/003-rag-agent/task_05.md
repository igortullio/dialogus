---
status: completed
title: "find_character_mentions tool"
type: backend
complexity: medium
dependencies:
  - task_01
---

# Task 05: find_character_mentions tool

## Overview

Implement the `find_character_mentions` Mastra tool — a substring-search (case-insensitive, diacritics-insensitive) across a book's chunks for a given name or alias list. Returns earliest chapters first. This tool intentionally does NOT use embeddings; it's a grep-style lookup for navigation questions ("when does the carpenter first appear?") that embeddings answer indirectly.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/rag/src/application/tools/findCharacterMentions.ts` exporting a factory `findCharacterMentionsTool(deps: { chunkRepo: ChunkReadRepository; logger: Logger }): Tool`:
  - `id: 'find_character_mentions'`; `description`: "Find substring mentions of a character name (or its aliases) across one or more books. Returns earliest chapters first. Use for navigation questions like 'when does X first appear?'."
  - Input Zod: `{ book_ids: array(uuid).min(1), aliases: array(string.min(1)).min(1), spoiler_caps: record(uuid, int.min(0)).optional(), limit: int.min(1).max(50).default(20) }`.
  - Output Zod: `{ mentions: array(chunkWithContextSchema) }` — reuses `chunkWithContextSchema` from task_03 (same snake-case shape).
  - Invokes `chunkRepo.findCharacterMentions({ bookIds, aliases, spoilerCaps, limit })`; the repository SQL-level filter lives in Feature 002's `DrizzleChunkRepository` per ADR-006.
- MUST pass aliases verbatim to the repository; case/diacritics normalization is a DB concern (per TechSpec § Technical Considerations, the repo implementation uses `ILIKE` + unaccent extension or equivalent). The tool does not normalize inputs.
- Ordering: results sorted by `chapter_ordinal` ascending (earliest first) then by `chunks.ordinal` ascending as a tiebreaker. The repository SQL is authoritative; tool simply exposes what the repo returns.
- MUST log structured event per TechSpec § Monitoring: `{ event: 'tool_call', tool: 'find_character_mentions', thread_id?, book_ids, alias_count, returned_count, duration_ms }`.
- MUST export the factory from the package barrel.
- System-prompt instruction (authored in task_06) tells the agent to derive alias lists from the question's language + the book's languages (e.g., "carpinteiro"/"carpenter"). This tool does not enforce alias breadth; the agent constructs the list.

</requirements>

## Subtasks

- [x] 5.1 Author Zod input + output schemas.
- [x] 5.2 Implement the tool factory.
- [x] 5.3 Extend package barrel.
- [x] 5.4 Unit tests with in-memory `ChunkReadRepository` mock.

## Implementation Details

Reference `task_03.md`'s `semanticSearch.ts` for the factory shape. The repository method `findCharacterMentions` must exist in `ChunkReadRepository.port.ts` (declared in task_01); this tool is a thin wrapper.

Case/diacritics handling — SQL side: the `DrizzleChunkRepository` (Feature 002 task_05, consumed here via ADR-006) needs to support `ILIKE` with `unaccent` or `lower` + a pre-normalized column. If Feature 002 hasn't implemented normalization-insensitive search, this task MUST add a follow-up note to 002's retrofit items. Verify by checking the `DrizzleChunkRepository.findCharacterMentions` signature before starting the tool implementation; if absent, flag as a blocker.

### Relevant Files

- `packages/rag/src/application/tools/semanticSearch.ts` (task_03) — template.
- `packages/rag/src/domain/ports/ChunkReadRepository.port.ts` (task_01) — contract.
- `packages/ingestion/src/infrastructure/persistence/DrizzleChunkRepository.ts` (Feature 002 task_05) — adapter that implements the character-search SQL.

### Dependent Files

- `packages/rag/src/application/tools/findCharacterMentions.ts` (new)
- `packages/rag/src/index.ts` (modify: barrel)
- `packages/rag/__tests__/application/tools/findCharacterMentions.test.ts` (new)

### Related ADRs

- [ADR-006: @dialogus/rag depends on @dialogus/ingestion](adrs/adr-006.md) — repository adapter reuse.
- [ADR-003: Refusal + reformulation](adrs/adr-003.md) — tool output feeds reformulation hints when semantic search is empty but navigation questions remain answerable.

## Deliverables

- `findCharacterMentions.ts` tool file.
- Barrel extended.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_09 (`find-character-mentions.integration.test.ts` exercises the full SQL path).

## Tests

- Unit tests:
  - [x] Happy path: `execute({ book_ids: ['b1'], aliases: ['Ishmael'], limit: 20 })` → repo called with expected args; output `mentions.length === mocked return length`; sorted by chapter_ordinal ascending.
  - [x] Multi-alias: `aliases: ['Ishmael', 'narrator']` → repo receives both strings.
  - [x] Multi-book: `book_ids: ['b1', 'b2']` → repo receives both.
  - [x] Spoiler caps passed through: `spoiler_caps: { b1: 5 }` → repo receives same.
  - [x] Default limit: no `limit` in input → repo called with `limit: 20`.
  - [x] Zod validation: empty `aliases` array → rejected.
  - [x] Zod validation: `limit: 51` → rejected.
  - [x] Zod validation: non-UUID in `book_ids` → rejected.
  - [x] Empty result: repo returns `[]` → output `mentions: []`, no throw.
  - [x] Logging: emits `alias_count: 2` when two aliases provided.
- Integration tests:
  - [ ] Deferred to task_09.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Tool signature matches the port; factory composes with the other three tools uniformly in task_07
- Zero normalization logic in the tool file (pushed to the SQL layer per ADR-006 alignment)
