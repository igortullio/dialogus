# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Streaming-aware citation parser shipped in `apps/web/src/lib/citation-parser.ts` per ADR-008 / TechSpec § Citation parser state machine.
- 48 unit tests in `apps/web/__tests__/lib/citation-parser.test.ts`; coverage 100% (statements/branches/functions/lines).

## Important Decisions

- Implemented the 2-state machine literally (`text` | `marker_pending`) — no extra "saw_one_brace" state. A `{{` split exactly between deltas (`{` ends one delta, `{` starts the next) is documented as an accepted limitation; the lone trailing `{` is emitted as text. ADR-008's risk section already accepts this; LLM token boundaries do not split between adjacent braces.
- Closing `}}` detection uses `buffer.endsWith('}}')` after each char append. This naturally handles the `}|}` split across deltas without a peek-ahead-across-boundary state.
- Validation derives an anchored, non-global regex from `CITATION_MARKER_REGEX.source` (`new RegExp('^' + source + '$')`) instead of mutating `lastIndex` on the shared global regex. Pure, side-effect-free, and still satisfies "do NOT redeclare the regex".
- Bailout fires strictly when `buffer.length > 60` (i.e., on the 61st char). Closing wins over bailout when both could fire on the same char (`}}` is checked before length).

## Learnings

- `@dialogus/rag` main-entry import (`import { CITATION_MARKER_REGEX } from '@dialogus/rag'`) works under both Vitest (Vite loader) and Next 16 / Turbopack `next build` from `apps/web` — no `transpilePackages` needed. `pnpm` workspace symlinks resolve the package's raw TS source via its `"main": "./src/index.ts"`.
- Biome's `noExcessiveCognitiveComplexity` rule caps at 15. The first cut of `parseStream` measured 24; refactoring the marker-pending branch into named helpers (`stepText`, `stepMarker`, `closeMarker`, `bailoutMarker`, `flushTextBuffer`) sharing a `MutableState` brought it under without losing clarity.
- `match[1]` from `RegExp.exec` is typed as `string | undefined` under strict TS — capture-group access needs an explicit narrowing (`const chunkId = match?.[1]; if (chunkId !== undefined)`).

## Files / Surfaces

- `apps/web/src/lib/citation-parser.ts` (new) — `ParserState`, `Token`, `MARKER_BUFFER_BAILOUT_LENGTH`, `initialParserState`, `parseStream`.
- `apps/web/__tests__/lib/citation-parser.test.ts` (new) — 48 tests.
- Verified: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (apps/web), `vitest run --coverage` (parser).

## Errors / Corrections

- Initial test data was wrong on two cases: (1) `closes a marker when buffer carries the prefix and }} arrives later` mis-split the UUID at index 4 producing a malformed UUID — fixed by splitting at index 8; (2) `bails out across delta boundaries` expected only the unresolved token but the parser correctly also emits trailing text after bailout — split into two tests covering both shapes.
- Initial fragments test split a marker between the two opening braces (`{` + `{c…`) which the 2-state machine cannot reassemble. Replaced with a fragment list that keeps `{{` in one chunk; added an explicit test that documents the split-`{{` limitation.

## Ready for Next Run

- Parser + test fixtures available for task_07 (assistant-ui glue) — wire `parseStream` into the message-renderer pipeline; carry `ParserState` per message; flush dangling `marker_pending` as unresolved on stream end / cancel.
- `Token.unresolved` shape is `{ kind: 'unresolved'; rawText: string }` where `rawText` always includes the leading `{{` (and `}}` when the close was found). The renderer can show `rawText` literally for unresolved tokens (per task_08 `<UnresolvedCitation>`).
