# Task Memory: task_07.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Ship the dIAlogus glue layer wrapping assistant-ui's chat primitives: `DialogusThread`, `DialogusComposer`, `DialogusMessage`, plus a `usePrefetchCitations` hook and a small store for the shared "Adicionar do Gutendex" drawer state. ADR-006 invariant: `@assistant-ui/*` + `@ai-sdk/react` imports must stay inside `apps/web/src/components/chat/`.

## Important Decisions

- **`useChatRuntime` + `AssistantChatTransport`** is the integration path at `@ai-sdk/react@3.0.170`. `useChat` no longer takes `api`/`body`; per-request body shaping uses `prepareSendMessagesRequest` on the transport. The transport reads `book_ids` / `thread_id` from a `useRef` so the closure stays fresh without re-instantiating the transport on every state change.
- **Spoiler caps are read at send time** (per ADR-002), inside `prepareSendMessagesRequest`, via `readAllSpoilerCaps(threadId)`. Body assembled there: `{ message, book_ids, spoiler_caps, thread_id? }` matches `chatStreamRequestSchema` (task_02).
- **`DialogusMessage` re-parses the full text every render** (the parser is pure + deterministic). This guarantees parser-state reset on a new `messageId` without explicit per-id state tracking. A dangling `marker_pending` at the end of the input is flushed as `unresolved { rawText: '{{' + buffer }`.
- **Citation index counter walks tokens in render order**: only `kind: 'citation'` increments the counter. `unresolved` tokens render their literal `rawText` (no badge, no index bump).
- **`CitationBadgePlaceholder.tsx` is a task_07 stub** carrying `data-slot="citation-badge-placeholder"` + `data-chunk-id` + `data-citation-index`; task_08 will replace the import target inside `DialogusMessage` with `@/components/citation/CitationBadge`.
- **Picker extracted as `BookPicker.tsx`** — testable in isolation (no assistant-ui runtime needed). Soft limit at 3 with `aria-disabled="true"` + shadcn Tooltip wrapper "máximo 3 livros por conversa" on the 4th row. Toggle behavior (re-click deselects) is supported.
- **Drawer state lives in a module-level singleton** (`add-book-drawer-store.ts`) using `useSyncExternalStore`. Avoided adding zustand; avoided React Context (would need a high-level provider wrapping both chat and library). `_resetAddBookDrawerForTests` is the test-only reset hook.
- **Composer uses `submitMode="ctrlEnter"`** per the task spec ("Cmd/Ctrl+Enter sends"). Plain Enter inserts a newline. The send button's `disabled` is `bookIds.length === 0 || isRunning` — passing `disabled` on the inner Button propagates through `<ComposerPrimitive.Send asChild>`. When no book is selected, the button is wrapped in a Tooltip explaining the gate.
- **Test runtime via `useLocalRuntime`** with a no-op `ChatModelAdapter` — sufficient for `<AssistantRuntimeProvider>` + `<ComposerPrimitive>` rendering and `useThread().isRunning` reads.

## Learnings

- `apps/web` does NOT have a direct `ai` dependency (`@assistant-ui/react-ai-sdk` brings it transitively); for explicit `UIMessage` typing import from `@ai-sdk/react` (which re-exports from `ai`) — keeps the dep graph clean.
- `@testing-library/user-event` is NOT installed in this repo; tests use `fireEvent` instead. Adding user-event would be scope creep.
- `@testing-library/react` has no auto-cleanup in this Vitest config — tests must call `cleanup()` in `afterEach` (this is the pattern in `__tests__/app/smoke.test.tsx`). Without it, multiple `render()` calls per file leak DOM nodes between tests and `getByTestId` finds duplicates.
- Biome's organize-imports auto-fix pulls module-level `afterEach(cleanup)` into the import block ordering; placing the hook AFTER all imports is mandatory.
- Pre-existing flake: `packages/ingestion/__tests__/infrastructure/external/GutendexDownloader.test.ts` rate-limit test sometimes misses the 1000ms threshold by a few ms. Reproduces independently of task_07 changes; not in scope.

## Files / Surfaces

- `apps/web/src/components/chat/DialogusThread.tsx` (new)
- `apps/web/src/components/chat/DialogusComposer.tsx` (new)
- `apps/web/src/components/chat/DialogusMessage.tsx` (new)
- `apps/web/src/components/chat/DialogusContext.tsx` (new — shared `MAX_BOOKS_PER_THREAD = 3`)
- `apps/web/src/components/chat/BookPicker.tsx` (new — testable sub-component)
- `apps/web/src/components/chat/CitationBadgePlaceholder.tsx` (new — stub for task_08)
- `apps/web/src/components/chat/usePrefetchCitations.ts` (new — exports `chunkQueryKey(id) = ['chunk', id]`)
- `apps/web/src/components/chat/add-book-drawer-store.ts` (new)
- `apps/web/__tests__/components/chat/{BookPicker,DialogusComposer,DialogusMessage,DialogusThread,usePrefetchCitations,add-book-drawer-store}.test.tsx` (new)
- `apps/web/__tests__/components/chat/_helpers.tsx` (new — `QueryWrapper`, `RuntimeWrapper`, `makeTestQueryClient`)

## Errors / Corrections

- Initial DialogusThread imported `UIMessage` from `'ai'` — failed typecheck because `ai` is not a direct dep. Switched to `@ai-sdk/react` re-export. Resolved.
- Initial composer test wrapped a disabled button in `<span tabIndex={0}>` for Tooltip-on-disabled. Biome's `noNoninteractiveTabindex` flagged it; removed the tabIndex. The Tooltip still works because Radix listens on the wrapping span via TooltipTrigger.
- Initial `<sup aria-label="...">` badge tripped Biome's `useAriaPropsSupportedByRole` (sup has no implicit role for which aria-label is valid). Replaced with a `<span class="sr-only">` child carrying the label text.
- First test run had multiple cumulative renders → `getByTestId` errored with "found N matching". Added `cleanup()` to all chat tests' `afterEach`.

## Ready for Next Run

- task_08 should swap the `<CitationBadgePlaceholder>` import inside `DialogusMessage` for the real `<CitationBadge>` from `apps/web/src/components/citation/`. The contract `{ chunkId: string, index: number }` is stable and matches the TechSpec interface (TechSpec adds `threadId` + `messageId` props — propagate them through `DialogusMessage` then).
- task_11 will plug `<DialogusMessage>` into assistant-ui's parts pipeline. The current `DialogusMessage` takes `{ messageId, text, status }` directly so it's testable; task_11 needs a thin adapter component that uses `useMessagePartText()` + reads message id/role from message context, then forwards to `<DialogusMessage>`.
- The `tool_outputs[*].chunks[*].chunk_id` extraction is intentionally NOT implemented yet — `usePrefetchCitations` accepts the chunk_ids parsed from the inline citations. Task_08/11 should extend with the message-metadata path if Mastra sends additional chunks not cited inline.
- `DialogusComposer` consumes `useDialogusThreadContext()`; any sibling that needs to mutate `bookIds` from outside the composer (e.g., post-add flow from the Gutendex drawer pre-fills the picker) can read the same context.
