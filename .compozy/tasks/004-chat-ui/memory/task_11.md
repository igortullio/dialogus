# Task Memory: task_11.md

Keep only task-local execution context here.

## Objective Snapshot

Compose `/` chat-first landing per ADR-001/009: Server Component shell prefetching threads → `<DialogusLanding>` Client Component with sidebar / main / right-side citation panel; below 1024px sidebar collapses into a `<Sheet side="left">` drawer.

## Important Decisions

- DialogusLanding owns active-thread state via `useState<string|null>` (Phase 2 can swap to URL state without breaking contracts).
- DialogusThread re-mounts on thread switch using `key={activeThreadId ?? 'new'}` so per-thread book scope (context) resets cleanly.
- `<DialogusThread>` no longer wraps children in `<ThreadPrimitive.Viewport>` — task_11 owns the viewport composition (Header above, Viewport with Messages, Composer below). Existing context tests are unaffected.
- DialogusMessageAdapter selects `id`, `role`, `content`, and `status` via `useMessage((s) => …)`, then concatenates text parts and forwards to the propful `<DialogusMessage>` (matches handoff contract).

## Learnings

- Next 16 / Turbopack production build is stricter than Vitest:
  - `@dialogus/shared/schemas` index uses `.js` re-exports that fail to resolve under Turbopack — use subpath imports (`@dialogus/shared/schemas/<name>`) instead.
  - `@dialogus/rag` index pulls in `@mastra/memory` (Node-only `async_hooks`) — when importing only `CITATION_MARKER_REGEX`, use `@dialogus/rag/domain/constants/citation` to keep the chunk graph browser-safe.
- ThreadRow: the click target is the inner `[data-slot="thread-row-select"]` button, not the row wrapper that carries `data-thread-id`.
- HydrationBoundary works in tests by rendering the React tree directly; just inspect `tree.props.state` and `tree.props.children`.

## Files / Surfaces

- `apps/web/src/app/page.tsx` (rewrite — Server Component shell with QueryClient + dehydrate + HydrationBoundary).
- `apps/web/src/app/_components/DialogusLanding.tsx` (new — Client Component composition).
- `apps/web/src/components/chat/DialogusThread.tsx` (drop unconditional Viewport wrapper).
- `apps/web/src/lib/api/_schemas.ts` (switch to subpath imports).
- `apps/web/src/lib/citation-parser.ts` (switch to `@dialogus/rag/domain/constants/citation`).
- `apps/web/__tests__/app/page.test.tsx` (rewrite — Server Component shell).
- `apps/web/__tests__/app/_components/DialogusLanding.test.tsx` (new).

## Errors / Corrections

- First test pass failed because click handler is on the inner button, not the row wrapper — fixed by descending into `[data-slot="thread-row-select"]`.
- First production build failed in two places — fixed by collateral subpath imports (see Learnings).
- First mock for `fetchBookById` used author strings — fixed to `{ name, birth_year, death_year }` per `bookSchema`.

## Ready for Next Run

- Pipeline green: lint (0 errors), typecheck (all packages), tests (apps/web 285, api 88, mastra 41, worker 41), `apps/web` Next build (`/` static route prerendered).
- Citation panel mount confirmed via test (`useCitationPanel` open ↔ `[data-slot="citation-side-panel"]`).
- Open V1 gap (Phase 2): an existing thread's `book_ids` are not loaded when the user clicks a sidebar row — new conversations work end-to-end, existing threads land in the chat with no books in context. Documented as a follow-up; not in task_11 scope.
