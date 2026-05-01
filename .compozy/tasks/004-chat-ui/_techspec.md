# Feature 004: Chat UI — Technical Specification

## Executive Summary

Feature 004 ships `apps/web` end-to-end against the four prior features (Foundation, Catalog, Ingestion, RAG Agent). Stack is Next.js 16 App Router on port 3000 with Tailwind v4 + shadcn primitives + assistant-ui chat-shell primitives + Vercel AI SDK `useChat` against `apps/mastra` + TanStack Query for catalog/library client state. Two top-level routes: `/` (chat) and `/library`. The agent's `{{cite:<chunk_id>}}` markers are parsed by a streaming-aware tokenizer (ADR-008) and rendered as superscript badges with hover tooltip + click-for-side-panel sheets (ADR-003). Spoiler caps live entirely in browser localStorage (PRD ADR-002); thread metadata (rename + pin) lives in Mastra Memory's `thread.metadata` field with a documented fallback to a `thread_metadata` Drizzle table if the pinned Mastra version's API is inadequate (ADR-007). The library page uses RSC for initial fetch + TanStack Query hydration on the client (ADR-009); the "Adicionar do Gutendex" flow opens as a left-side `<Sheet>` to preserve library-grid context while differentiating from the right-side citation panel (ADR-010).

Primary trade-off: **invest in a streaming-aware citation parser, a thin assistant-ui glue layer, and per-side `<Sheet>` discipline** in exchange for **a polished chat-first UX whose visible affordances (live badges, side panels, drawer) feel intentional and consistent rather than emergent**. The alternative — render markers as raw text during stream and replace at done — is simpler in code but visibly broken-looking during the most visible UI moment.

This feature does not introduce new packages, new API endpoints in `apps/api`, or new tables in `@dialogus/db`. The only conditional addition is a `thread_metadata` table + two endpoints if the primary Mastra-metadata path fails verification in task_01 (ADR-007 fallback).

## System Architecture

### Component Overview

```
apps/web                                  Next.js 16 App Router, port 3000
  src/app/
    layout.tsx                            root: QueryClientProvider, ThemeProvider (system pref), font setup
    page.tsx                              chat-first landing (Server Component shell)
    library/
      page.tsx                            RSC: prefetch library + render LibraryGrid
      LibraryGrid.tsx                     Client: TanStack Query hydration, mutations, polling

  src/components/
    chat/                                 assistant-ui glue layer
      DialogusThread.tsx                  wraps assistant-ui <Thread>; injects styling
      DialogusComposer.tsx                wraps <Composer>; book-picker integration; spoiler-slider integration; cancel button
      DialogusMessage.tsx                 wraps <Message>; runs citation-parser; renders badges
      ThreadSidebar.tsx                   list + groups (Fixadas / Recentes) + new-thread CTA + library link
      ThreadRow.tsx                       three-dot menu, rename overlay, pin toggle, delete confirm
      EmptyStateCard.tsx                  "Primeiros passos" with 3 recommended titles
      ThreadHeader.tsx                    book chips, spoiler-cap chip, popover slider
    citation/
      CitationBadge.tsx                   superscript badge with index; runs hover/click handlers
      CitationTooltip.tsx                 shadcn <Tooltip> with chapter title + 200-char preview
      CitationSidePanel.tsx               shadcn <Sheet side="right"> with full chunk + chapter context
      UnresolvedCitationBadge.tsx         ⚠ glyph variant for chunk_ids not in tool_outputs
    library/
      BookCard.tsx                        cover + meta + status badge + actions
      StatusBadge.tsx                     per-status visual (with progress for in-progress states)
      AddGutendexSheet.tsx                shadcn <Sheet side="left">; search input, results, "Adicionar"
      RemoveBookDialog.tsx                shadcn <AlertDialog> for soft-delete confirmation
      RetryButton.tsx                     in-card retry action for failed books
      CoverFallback.tsx                   generated SVG when cover_url is null
    ui/
      (shadcn-generated components: button, dialog, sheet, tooltip, dropdown-menu, alert-dialog,
       slider, input, select, popover, separator, badge, card, tabs, skeleton, sonner)

  src/lib/
    api/
      library.ts                          fetchLibrary, addBook, retryIngestion, removeBook, restoreBook
      catalog.ts                          searchGutendex (with cursor pagination)
      chunks.ts                           fetchChunkById (citation excerpt)
      threads.ts                          listThreads, deleteThread, updateThreadMetadata (rename, pin)
    citation-parser.ts                    streaming-aware parser (state machine)
    spoiler-cap.ts                        useSpoilerCap hook + storage helpers
    thread-metadata.ts                    useThreadMetadata hook (Mastra primary, table fallback)
    query-client.tsx                      QueryClientProvider + Hydration helpers
    mastra-client.ts                      useChat config, base URL, error handling
    onboarding-titles.ts                  3 hardcoded Gutendex IDs (Monte Cristo, Brás Cubas, Crime e Castigo)

  src/hooks/
    useMediaQuery.ts                      breakpoints for mobile-vs-desktop sheet behavior
    usePrefetchCitations.ts               post-stream prefetch via TanStack
    useThreadCleanup.ts                   localStorage cleanup on thread delete

  __tests__/
    components/chat/*.test.tsx
    components/citation/*.test.tsx
    components/library/*.test.tsx
    lib/citation-parser.test.ts
    lib/spoiler-cap.test.ts
    integration/                          Playwright end-to-end (one happy path; PRD-mandated)
      happy-path.spec.ts

  next.config.ts
  tsconfig.json
  tailwind.config.ts                      Tailwind v4 inline-tokens setup
  components.json                         shadcn config
  package.json                            adds: next@16, @assistant-ui/*, @ai-sdk/react, @tanstack/react-query, shadcn deps, @dialogus/rag (for CITATION_MARKER_REGEX), @dialogus/shared

apps/api                                  (CONDITIONAL — only if ADR-007 fallback path)
  src/infrastructure/http/routes/threads.ts
    GET /api/library/threads/:id/metadata     fallback only
    PUT /api/library/threads/:id/metadata     fallback only

@dialogus/db                              (CONDITIONAL — only if ADR-007 fallback path)
  src/schema/thread_metadata.ts             fallback only
  drizzle/0005_thread_metadata.sql          fallback only

external services consumed:
  http://localhost:3001  apps/api  (catalog, library, chunks)
  http://localhost:3002  apps/mastra  (agent, threads, messages)
```

**Data flow — ask a grounded question end-to-end:**

1. User on `/` clicks "Nova conversa" → `<DialogusComposer>` opens with empty book picker. User selects 1-3 books from `/library`'s `ready` set.
2. User types message + presses Enter. `useChat` (Vercel AI SDK + `@assistant-ui/react-ai-sdk` adapter) reads localStorage spoiler caps for the thread + selected books; posts `{ message, book_ids, spoiler_caps, thread_id?: string }` to `apps/mastra` SSE endpoint.
3. SSE delta stream begins. Each `delta` event is fed to `parseStream(deltaText, state)` (citation-parser); state machine emits `text` and `citation` tokens.
4. `<DialogusMessage>` renderer maps tokens to React nodes — text nodes for prose, `<CitationBadge index={n} chunkId={...} />` for citations.
5. As tokens arrive, `<CitationBadge>` registers its `chunkId` with a per-message context provider that counts citations (1, 2, 3...). Each badge knows its index for display.
6. Stream `done` event fires. `usePrefetchCitations` reads `tool_outputs[*].chunks[*].chunk_id` and `queryClient.prefetchQuery(['chunk', id])` for each.
7. User hovers a badge → `<CitationTooltip>` reads the prefetched cache; renders chapter title + excerpt_preview.
8. User clicks the badge → `<CitationSidePanel>` opens (shadcn `<Sheet side="right">`); fetches `GET /api/library/chunks/<chunk_id>` from cache (instant); renders full chunk + chapter context.

**Data flow — library + add Gutendex:**

1. User clicks "Gerenciar acervo" in sidebar footer → navigates to `/library`.
2. RSC `page.tsx` server-fetches `/api/library/books?cursor&limit&include_deleted=false`; passes via `<HydrationBoundary>` to `<LibraryGrid>`.
3. `<LibraryGrid>` reads from hydrated TanStack cache; per-book `useQuery({ queryKey: ['ingestion', bookId], refetchInterval: 2000, enabled: isInProgress(book) })` polls live progress for `downloading | parsing | chunking | summarizing | embedding` books.
4. User clicks "Adicionar do Gutendex" → `<AddGutendexSheet>` opens (shadcn `<Sheet side="left">`).
5. User types "Tolstoy" → debounced `useQuery({ queryKey: ['gutendex-search', q, lang], ... })` against `/api/catalog/search`.
6. User clicks "Adicionar" on a result → `useMutation` posts `/api/library/books` with `Idempotency-Key`; on success, the `['library']` cache is invalidated; the new book card appears in the grid.

**Data flow — thread rename + pin:**

1. User hovers a thread row → three-dot menu becomes visible.
2. Click menu → `<DropdownMenu>` opens with "Renomear", "Fixar"/"Desafixar", "Excluir".
3. Click "Renomear" → row title becomes inline `<Input>` with current title; auto-focus + select-all.
4. User types new title → Enter or blur → `useThreadMetadata.mutateRename(threadId, newTitle)` → either Mastra metadata update (primary) or `PUT /api/library/threads/:id/metadata` (fallback).
5. Optimistic UI: title updates in sidebar immediately; on error, revert + toast.

**Data flow — thread delete:**

1. Click "Excluir" → `<AlertDialog>` confirms with thread title.
2. On confirm: `useMutation` calls Mastra delete-thread API; in `onMutate`, `useThreadCleanup` enumerates localStorage keys matching `dialogus:spoiler_cap:<thread_id>:*` and removes them.
3. Optimistic UI: thread removed from sidebar; if API errors, restore + error toast.

## Implementation Design

### Core Interfaces

```typescript
// apps/web/src/lib/citation-parser.ts — streaming-aware citation parser
export type ParserState = { kind: 'text' } | { kind: 'marker_pending'; buffer: string }

export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'citation'; chunkId: string }
  | { kind: 'unresolved'; rawText: string }

export function initialParserState(): ParserState { return { kind: 'text' } }

export function parseStream(
  deltaText: string,
  state: ParserState,
): { tokens: Token[]; nextState: ParserState }
// Pure function. Caller maintains `state` across calls. Buffer bailout at 60 chars.
```

```typescript
// apps/web/src/lib/spoiler-cap.ts — localStorage spoiler-cap hook
export interface UseSpoilerCapResult {
  readonly cap: number | null
  readonly isLoaded: boolean
  setCap(value: number | null): void
}

export function useSpoilerCap(threadId: string, bookId: string): UseSpoilerCapResult

export function readAllSpoilerCaps(threadId: string): Record<string, number>
export function clearSpoilerCapsForThread(threadId: string): void
```

```typescript
// apps/web/src/lib/thread-metadata.ts — Mastra-primary, table-fallback
export interface ThreadMetadata {
  customTitle: string | null
  pinned: boolean
}

export interface UseThreadMetadataResult {
  data: ThreadMetadata
  isLoading: boolean
  mutateRename(newTitle: string): Promise<void>
  mutatePin(pinned: boolean): Promise<void>
}

export function useThreadMetadata(threadId: string): UseThreadMetadataResult
// Internally chooses Mastra metadata API or fallback table API based on a build-time flag set in task_01.
```

```typescript
// apps/web/src/components/citation/CitationBadge.tsx — visible component contract
export interface CitationBadgeProps {
  readonly chunkId: string
  readonly index: number
  readonly threadId: string
  readonly messageId: string
}
export function CitationBadge(props: CitationBadgeProps): JSX.Element
// Internally: <sup><Tooltip content={...}><button onClick={openSheet}>...</button></Tooltip></sup>
```

### Data Models

**No new client-side persistent models beyond localStorage.** The `dialogus:spoiler_cap:<thread_id>:<book_id>` localStorage key holds an integer chapter ordinal (or absent for "no cap").

**Conditional `thread_metadata` table (only if ADR-007 fallback path):**

| Table | Columns |
|---|---|
| `thread_metadata` | `thread_id text pk`, `custom_title text`, `pinned boolean not null default false`, `updated_at timestamptz not null default now()` |

`thread_id` is a soft reference to Mastra-owned thread IDs; no FK. Migration `0005_thread_metadata.sql` generated by drizzle-kit.

**Indexes:** `thread_metadata(pinned, updated_at desc)` — supports the sidebar's "Fixadas" group + "Recentes" sort.

### API Endpoints

`apps/api` consumed by `apps/web`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/catalog/search` | Gutendex search for the add drawer |
| GET | `/api/catalog/books/:gutendex_id` | book preview before add |
| POST | `/api/library/books` | add book (Idempotency-Key) |
| GET | `/api/library/books` | library grid initial + refresh |
| GET | `/api/library/books/:id` | single-book detail (modal) |
| DELETE | `/api/library/books/:id` | soft delete |
| POST | `/api/library/books/:id/restore` | undo soft-delete |
| POST | `/api/library/books/:id/ingest` | start ingestion |
| GET | `/api/library/books/:id/ingestion` | poll progress (every 2s while in-progress) |
| POST | `/api/library/books/:id/ingest/retry` | retry failed |
| GET | `/api/library/chunks/:id` | citation excerpt resolution |

`apps/mastra` consumed by `apps/web`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/agents/dialogusAgent/stream` | SSE chat (via `useChat`) |
| GET | `/api/memory/threads` | list threads (sidebar) |
| GET | `/api/memory/threads/:id` | thread + metadata |
| PUT | `/api/memory/threads/:id` | update thread (metadata: rename, pin) |
| DELETE | `/api/memory/threads/:id` | delete thread |

Exact paths confirmed at the pinned `@mastra/core` version during task_01; differences are absorbed in the `thread-metadata.ts` and `mastra-client.ts` glue layers.

`apps/api` conditional (fallback only):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/library/threads/:id/metadata` | thread metadata read |
| PUT | `/api/library/threads/:id/metadata` | thread metadata write |

### Citation parser state machine (ADR-008 contract)

State transitions:

```
text ──{──> [peek next]
              ├─ "{" ──{{──> marker_pending(buffer="")
              └─ other ──> emit text, stay in text

marker_pending(buf) ──char──> 
  ├─ "}" ──[peek next]──>
  │     ├─ "}" ──> match buf as "cite:<UUID>" → emit citation OR emit unresolved + go to text
  │     └─ other ──> append "}" to buf, continue marker_pending
  └─ other ──> append to buf
              └─ if buf.length > 60 → emit unresolved("{{" + buf), go to text
```

UUID v4 regex: `^cite:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (re-uses `CITATION_MARKER_REGEX` exported from `@dialogus/rag`).

## Integration Points

| Service | Purpose | Auth | Error / retry |
|---|---|---|---|
| `apps/api` (port 3001) | Catalog search, library CRUD, chunks resolution | none in V1 | TanStack Query default retry (1×); on persistent error, toast + inline error states; envelopes parsed via Zod |
| `apps/mastra` (port 3002) | Chat streaming, thread CRUD, thread metadata (primary) | none in V1 | `useChat` exposes `error`; UI shows inline error + retry button on the failed message; SSE reconnects automatically per assistant-ui defaults |
| Browser localStorage | Spoiler caps; preferences | n/a | Synchronous; no retry; quota check on write (negligible at expected volume) |

## Impact Analysis

| Component | Impact | Description / Risk | Required Action |
|---|---|---|---|
| `apps/web` | new | First substantial UI; ~30 components + 5 hooks + 4 API clients. Medium-high risk (visual regression surface) | Steps 1–14 of Build Order |
| `apps/api` `threads/metadata` routes | conditional | Only if ADR-007 fallback fires. Low risk (2 endpoints) | Step 1 verifies; conditional steps 1.5 + 2 if needed |
| `@dialogus/db` `thread_metadata` schema | conditional | Only if fallback. Low risk (single small table) | Conditional step 1.5 |
| `apps/mastra` | unchanged | Consumed via `useChat`; no code changes | none |
| `apps/worker` | unchanged | none | none |
| `@dialogus/shared/schemas` | extended | Adds `thread.ts` + `chat.ts` schemas for client-server contracts | Step 1 |
| `@dialogus/rag` | unchanged | Consumed for `CITATION_MARKER_REGEX` only | none |
| Root README | extended | Adds "Chat UI (feature 004)" section + screenshots | Step 14 |
| `.env.example` | extended | `NEXT_PUBLIC_API_URL=http://localhost:3001`, `NEXT_PUBLIC_MASTRA_URL=http://localhost:3002` (already present from Foundation + 003) | none if already set |

## Testing Approach

### Unit Tests

- **Components — chat shell**: `<DialogusComposer>` book-picker selection state, spoiler-slider hydration from localStorage, send-on-Enter / Cmd-Enter behavior, disabled state during stream.
- **Components — citation**: `<CitationBadge>` renders correct index + tooltip + sheet; `<CitationTooltip>` 300ms delay; `<CitationSidePanel>` fetches from cache + falls back to network.
- **Components — library**: `<BookCard>` per-status rendering; `<StatusBadge>` progress bar visible only for in-progress states; `<AddGutendexSheet>` debounced search + result rendering + per-result mutation.
- **Hooks**: `useSpoilerCap` hydration + cleanup cycle; `useThreadMetadata` Mastra-vs-fallback path selection; `usePrefetchCitations` triggers `prefetchQuery` per chunk; `useThreadCleanup` removes the right localStorage keys.
- **Citation parser** (`citation-parser.test.ts`): split-marker across deltas, multiple markers in one delta, malformed marker, bailout at 60 chars, leading whitespace inside braces (rejected), empty stream, marker at end-of-stream.
- **API clients** (`lib/api/*.test.ts`): each client function with MSW-mocked endpoints; assert request shapes + envelope unwrapping + Zod validation.

Vitest 4 for unit tests; React Testing Library for component tests; MSW 2 for API mocking. Target: ≥ 80 % coverage on `apps/web/src/lib/` and `apps/web/src/components/`.

### Integration Tests

`apps/web/__tests__/integration/happy-path.spec.ts` (Playwright):

- Owner adds Brás Cubas via the empty-state card; waits for `ready`.
- Opens chat; selects Brás Cubas in the picker; asks "Quem é o narrador?"; waits for stream completion.
- Asserts: at least one `<sup>` badge with `aria-label` matching `/Citação \d+/`; click opens a sheet; sheet contains chapter context.
- Sets a spoiler cap to chapter 3; sends another message ("o que acontece no capítulo 5?"); asserts response either has no citation or all citations reference chapters ≤ 3.
- Renames the thread; refreshes browser; verifies new title persists.
- Pins the thread; refreshes; verifies pin persists.
- Deletes the thread via three-dot menu + confirm; verifies thread removed from sidebar.

The integration suite runs against a live dev environment (docker-compose Postgres + the four Node apps) with seeded fixtures; uses Playwright's `page.route()` to mock external APIs (Anthropic, OpenAI) but real Mastra + apps/api + apps/worker. Runs in CI as a dedicated job; budget ≤ 5 min.

### Accessibility Tests

`apps/web/__tests__/a11y/lighthouse.test.ts` (Playwright + Lighthouse):

- Opens `/`; runs Lighthouse a11y audit; asserts score ≥ 90.
- Opens `/library`; runs audit; asserts score ≥ 90.

`@axe-core/playwright` integrated into the happy-path test for inline a11y assertions on key components (citation badge, three-dot menu, modal, drawer).

### Manual Smoke (before closing Feature 004)

1. `docker compose up -d && pnpm db:migrate && pnpm dev`.
2. Open `localhost:3000`. Empty sidebar shows "Primeiros passos" card with 3 books.
3. Click "Adicionar e ingerir" on Brás Cubas; observe progress through stages; reach `ready`.
4. Click "Nova conversa"; pick Brás Cubas; ask 2 PT questions; verify badges + side panel + spoiler slider.
5. Switch to `/library`; verify grid; add a book via Gutendex drawer; observe progress.
6. Return to `/`; rename one thread to "Memorias deep dive"; pin it; refresh browser; verify persistence.
7. Delete a test thread; verify localStorage cleaned (DevTools → Application → Local Storage → no `dialogus:spoiler_cap:<deleted_thread_id>:*` keys).
8. Run Lighthouse on `/` + `/library`; record scores in PRD Exit Criteria Verification.
9. Record 3-minute screencast covering search → ingest → ask → spoiler-safe read.
10. CI green on all 5 jobs (lint-and-typecheck, test, integration, a11y, build).

## Development Sequencing

### Build Order

1. **Scaffold + tech-stack baseline + verification** — depends on Feature 003 closure
   - `apps/web/` is a stub from Foundation; install Next 16 + Tailwind v4 + shadcn `init` + assistant-ui pinned versions + Vercel AI SDK + TanStack Query.
   - Configure `tailwind.config.ts` with Tailwind v4 inline tokens; configure `components.json` with shadcn defaults.
   - `<QueryClientProvider>` + `<ThemeProvider>` (system pref) at root layout.
   - **Verify Mastra metadata API at the pinned version**: read docs, write a smoke script that creates a thread, sets metadata, reads it back. If success, primary path (ADR-007). If failure, schedule fallback (step 1.5).
   - `apps/web/__tests__/setup/mastra-metadata-verification.test.ts` records the verification result for downstream tasks.

1.5 **(Conditional) Fallback `thread_metadata` table + endpoints** — depends on 1
   - Only if step 1's verification fails.
   - `@dialogus/db/src/schema/thread_metadata.ts` + migration `0005_thread_metadata.sql`.
   - `apps/api/src/infrastructure/http/routes/threads.ts` with GET + PUT.
   - Adds 2 tasks to the build order; otherwise skipped.

2. **`@dialogus/shared/schemas/{chat,thread}` + Zod contracts** — depends on 1
   - Request/response shapes for `useChat` payload, thread metadata, library list, chunk read. Re-export from `@dialogus/shared`.

3. **`apps/web/src/lib/api/*.ts`** — depends on 2
   - `library.ts`, `catalog.ts`, `chunks.ts`, `threads.ts`. Each function typed against `@dialogus/shared/schemas`. Unit-tested with MSW.

4. **`citation-parser.ts` + tests** — depends on 1 (consumes `CITATION_MARKER_REGEX` from `@dialogus/rag`)
   - State machine per ADR-008. Pure function. Comprehensive unit tests.

5. **`spoiler-cap.ts` + `thread-metadata.ts` hooks** — depends on 1, 2
   - `useSpoilerCap`, `readAllSpoilerCaps`, `clearSpoilerCapsForThread`.
   - `useThreadMetadata` (chooses Mastra path vs fallback path based on the verification flag).

6. **shadcn primitives + Tailwind tokens** — depends on 1
   - `npx shadcn add` for: button, dialog, sheet, tooltip, dropdown-menu, alert-dialog, slider, input, select, popover, separator, badge, card, tabs, skeleton, sonner. Theme tokens follow the project's design language (neutral palette + serif for book titles).

7. **assistant-ui glue: `DialogusThread`, `DialogusComposer`, `DialogusMessage`** — depends on 4, 5, 6
   - Wraps assistant-ui primitives; integrates citation parser + spoiler caps + book picker.
   - `useChat` configured with `apps/mastra` base URL + custom body builder for `{ message, book_ids, spoiler_caps, thread_id }`.

8. **Citation components: `CitationBadge`, `CitationTooltip`, `CitationSidePanel`, `UnresolvedCitationBadge`** — depends on 6, 7
   - shadcn `<Tooltip>` + `<Sheet side="right">`.
   - `usePrefetchCitations` hook fires on stream done.

9. **Sidebar: `ThreadSidebar`, `ThreadRow`, `EmptyStateCard`** — depends on 5, 6
   - Pin/recent grouping, three-dot menu, rename overlay, delete confirm.
   - Empty-state card with 3 hardcoded titles from `onboarding-titles.ts`.

10. **Thread header: `ThreadHeader`** — depends on 5, 6, 7
    - Read-only book chips + spoiler-cap chip + popover slider per book.

11. **Chat-first landing `/page.tsx`** — depends on 7, 8, 9, 10
    - Server Component shell + Client Component composition.

12. **Library page: `/library/page.tsx` + `LibraryGrid` + `BookCard` + `StatusBadge`** — depends on 3, 6
    - RSC + TanStack Query hydration per ADR-009.
    - Per-card progress polling.

13. **Add Gutendex drawer: `AddGutendexSheet` + `RemoveBookDialog` + `RetryButton` + `CoverFallback`** — depends on 12
    - shadcn `<Sheet side="left">` per ADR-010.
    - Debounced search + cursor pagination.

14. **Tests: integration (Playwright), a11y (Lighthouse), screencast** — depends on 11, 12, 13
    - Happy-path E2E + Lighthouse audits on `/` + `/library`.
    - 3-minute screencast covering all four user journeys.
    - Extend `ci.yml` with `integration` (Playwright) + `a11y` (Lighthouse) jobs.

15. **Manual smoke + Feature 004 closure** — depends on 14
    - Full smoke sequence; PRD Exit Criteria Verification appended.
    - README "Chat UI (feature 004)" section with screenshots.
    - Closure commit `chore(repo): close feature 004-chat-ui`.

### Technical Dependencies

- **Pinned versions**: `next@16.x.x`, `@assistant-ui/react@<exact>`, `@assistant-ui/react-ai-sdk@<exact>`, `@ai-sdk/react@<exact>`, `@tanstack/react-query@<exact>`, `tailwindcss@4.x.x`. shadcn components generated locally; pinned via `components.json`.
- **Mastra metadata verification** (step 1) gates whether the conditional fallback (step 1.5) is needed.
- Feature 003 closure is a hard prerequisite — `apps/mastra` must be running and serving the `dialogusAgent` before chat-shell development can be smoke-tested.
- Foundation `pnpm dev` orchestration already includes `apps/web`; this feature populates it with real content.

## Monitoring and Observability

- **Browser console**: structured logs from `apps/web` for noteworthy events (citation prefetch fired, thread cleanup, mutation errors). Disabled in production builds.
- **Network panel**: every `/api/library/*` and `/api/catalog/*` request visible; deliberately no request batching (per-resource queries help debugging).
- **TanStack Query DevTools**: enabled in dev (`<ReactQueryDevtools />` in root layout); shows query state, cache contents, mutation history.
- **Mastra Studio (`localhost:4111`)**: thread + tool-output inspection; same lens as during Feature 003 development.
- **No external APM** (per product TechSpec scope).
- **Lighthouse a11y score** captured during integration test; trend tracked in PRD Exit Criteria Verification on closure.

## Technical Considerations

### Key Decisions

1. **assistant-ui chat-shell only; shadcn for everything else** (ADR-006) — clean library boundaries; glue layer absorbs upstream churn.
2. **Mastra metadata for thread state, with documented fallback** (ADR-007) — single source of truth on primary path; `thread_metadata` table only if Mastra API inadequate.
3. **Streaming-aware citation parser** (ADR-008) — badges appear in real time; no visible raw markers.
4. **RSC + TanStack Query hydration for library** (ADR-009) — fast TTFB + optimistic mutations + bounded polling.
5. **Left-side `<Sheet>` for Gutendex add; right-side `<Sheet>` for citations** (ADR-010) — visual differentiation for two different sheet purposes.
6. **localStorage spoiler caps** (PRD ADR-002) — zero backend code; cross-device sync deferred to Phase 2.
7. **Citation badge counts re-numbered per response** (PRD ADR-003) — first cite is `¹`, second `²`, regardless of chunk_id; stable scholarly UX.
8. **Thread book scope locked at creation** (PRD ADR-005) — book chips read-only after first message; new scope = new thread.
9. **Cover-image fallback**: generated SVG with title in monospace + hash-based color block. PRD Open Question resolved here. Implementation in `<CoverFallback>` component using a small hash function over the title string to pick from a curated 8-color palette.
10. **Mobile breakpoint at 1024 px**: below this width, sidebar becomes a `<Sheet side="left">` drawer; citation panel becomes a bottom sheet. PRD Open Question resolved here.
11. **Side panel width 480 px on desktop**: shadcn `<Sheet>` default with override; PRD Open Question resolved.
12. **First-cap-set toast deferred**: PRD Open Question — for V1, no toast on first localStorage spoiler-cap write; rely on README's "Known V1 Limitations" section. Revisit if dogfooding reveals confusion.
13. **Three recommended onboarding titles**: hardcoded Gutendex IDs in `onboarding-titles.ts`. The PRD names the books; TechSpec freezes the IDs (verified once during task_01 by hitting Gutendex search): The Count of Monte Cristo (gutendex_id `1184`), Memórias Póstumas de Brás Cubas (`54829`), Crime and Punishment (`2554`). IDs are committed; if they shift upstream (very rare), the constant updates in a follow-up.
14. **Composer max-books soft limit at 3**: client-side guidance; no API enforcement (Feature 003 ADR-004 documents the global top-k decision; per-book quota deferred). Composer disables further book selection at 3 with a tooltip "máximo 3 livros por conversa".

### Known Risks

- **assistant-ui at pre-1.x maturity**: minor versions may break SSE reconnect, scroll behavior, or composer state. Mitigation: pinned versions; glue layer `apps/web/src/components/chat/` absorbs the surface.
- **Tailwind v4 + shadcn alignment**: shadcn's class-string-based components may need adjustments under Tailwind v4's CSS-first tokens. Mitigation: test shadcn `init` against the actual Tailwind v4 setup before scaffolding components; document any divergence.
- **Citation parser edge cases**: split markers near SSE chunk boundaries are a genuine source of bugs. Mitigation: comprehensive unit tests; bailout heuristic (60-char buffer) prevents runaway state.
- **Mastra streaming event shape**: `useChat` adapter for Mastra may differ from the Vercel default at the pinned version. Mitigation: glue layer in `mastra-client.ts`; verified during step 7's smoke.
- **localStorage quota in extreme dogfooding**: 1000 threads × 5 books × ~100 bytes = ~500 KB. Well under quota. Documented as Phase 2 monitoring concern.
- **Mastra metadata API rate limits**: rename + pin operations are infrequent; not a V1 concern.
- **Lighthouse a11y at 90 not 100**: chosen target. Some shadcn primitives may not pass 100 out of the box (e.g., color-contrast on hover states); 90 is realistic. Phase 2 raises bar if needed.
- **Mobile experience**: PRD calls mobile "supported but not optimized." Some interactions (long-press citation badge, drawer focus traps) may degrade on touch; Phase 2 mobile-first refinement absorbs this.
- **Optimistic UI rollback**: rename + pin + delete all use optimistic updates. If the API fails, the UI must restore. Sonner toast informs the user; documented as a Phase 2 telemetry concern (capture failure rate).

## Architecture Decision Records

- [ADR-001: Full chat-first V1 with polished library page](adrs/adr-001.md) — Approach A; library polish in V1, not Phase 2.
- [ADR-002: Spoiler cap persists in browser localStorage only](adrs/adr-002.md) — No backend; cross-device sync deferred.
- [ADR-003: Citation UX — superscript badge + hover preview + click-for-side-panel](adrs/adr-003.md) — NotebookLM/Perplexity-style.
- [ADR-004: Thread management — full CRUD + pin in V1](adrs/adr-004.md) — Create + switch + delete + rename + pin.
- [ADR-005: Thread book scope is fixed at thread creation](adrs/adr-005.md) — No mid-thread add/remove.
- [ADR-006: assistant-ui owns the chat shell; shadcn/ui owns everything else](adrs/adr-006.md) — Chat-domain vs UI-domain library split.
- [ADR-007: Thread metadata lives in Mastra Memory with documented fallback](adrs/adr-007.md) — Primary Mastra; fallback `thread_metadata` table if API inadequate.
- [ADR-008: Streaming-aware citation marker parser](adrs/adr-008.md) — Real-time badge rendering; 60-char bailout.
- [ADR-009: Library page uses RSC + TanStack Query hydration](adrs/adr-009.md) — Fast TTFB + optimistic mutations + bounded polling.
- [ADR-010: Gutendex add flow uses a left-side `<Sheet>`](adrs/adr-010.md) — Differentiated from right-side citation panel.
