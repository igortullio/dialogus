# Workflow Memory

Cross-task durable context only. Anything obvious from repo, PRD, `_tasks.md`, or git history must NOT live here.

## Current State

- Tasks 01–14 complete; task_15 (smoke + closure) and task_16 (V1 gate) outstanding.
- Stack: Next 16.2.4 + React 19.2.5; Tailwind v4 CSS-first via `@theme inline` in `apps/web/src/app/globals.css` (no `tailwind.config.ts`); shadcn new-york + neutral. Tokens include `--scholarly`, `--status-{ready,failed,progress}`, `--space-thread-row: 56px`, `--radius-cite-badge: 4px`. Dark mode = `.dark` class + `prefers-color-scheme`.
- ADR-007 primary path active: thread metadata in Mastra `thread.metadata`; `MASTRA_THREAD_METADATA_AVAILABLE = true` in `apps/web/src/lib/feature-flags.ts`.

## Shared Decisions

- HTTP client `fetchEnvelope<TSchema>` in `apps/web/src/lib/api/_envelope.ts` returns `Envelope<z.infer<TSchema>>`. RFC 9457 errors → `ApiError { status, slug, title, detail, problem }`; Zod failures → `SchemaError`. Tests stub via `vi.stubGlobal('fetch', ...)` (no MSW).
- Citation marker validation reuses `CITATION_MARKER_REGEX` from `@dialogus/rag` via `new RegExp('^' + source + '$')` (anchored, non-global).
- assistant-ui via `useChatRuntime` + `AssistantChatTransport`; `useChat` no longer accepts `api`/`body` — per-request shaping uses `prepareSendMessagesRequest` reading dynamic state from a `useRef`. Default `submitMode="ctrlEnter"`. Imports confined to `apps/web/src/components/chat/` (ADR-006 invariant).
- `ChunkReadDto` has no `book_title`; consumers needing it issue secondary `useQuery(['book', book_id], () => fetchBookById(book_id))`. `excerpt_preview` derives from `chunk.text.slice(0, 200)`.
- Module-singleton `useSyncExternalStore` is the convention (`add-book-drawer-store.ts`, `citation-panel-state.ts`). `<CitationSidePanel />` mounts once at chat-page level.
- `useThreadMetadata` keeps snake_case (`custom_title`, `pinned`). Mutations resolve to `void`; rollback toasts handled inside the hook — callers do not try/catch. `ThreadMetadataUpdate = threadMetadataSchema.partial()` so `custom_title` stays nullable.
- Until Features 001/002 own canonical `bookSchema`/`gutendexBookSchema`, the local copy in `apps/web/src/lib/api/_schemas.ts` is source of truth. Local `bookSchema` carries optional `chapter_count?: number`.
- `/page.tsx` Server Component pattern: per-request `QueryClient` + `prefetchQuery` + `<HydrationBoundary state={dehydrate(client)}>` (ADR-009). Replicated for `/library`.
- API clients live in `apps/web/src/lib/api/{library,catalog,chunks,threads}.ts` plus `_envelope.ts`, `_error.ts`, `_schemas.ts`. `nextCursorFromLinks(links)` parses `?cursor=` from `links.next`.

## Shared Learnings

- Vitest config needs `css: { postcss: { plugins: [] } }` and `__tests__/vitest.setup.ts` polyfilling `window.matchMedia`. Radix-based shadcn primitives additionally need `ResizeObserver`, `DOMRect`, `Element.prototype.scrollIntoView`, `*PointerCapture`.
- `@testing-library/react` does NOT auto-cleanup; tests must call `cleanup()` in `afterEach`. `@testing-library/user-event` is not installed — use `fireEvent`.
- Component tests needing assistant-ui use `useLocalRuntime(adapter)` (no-op `ChatModelAdapter`) wrapped in `<AssistantRuntimeProvider runtime={runtime}>`. Helpers in `apps/web/__tests__/components/chat/_helpers.tsx` (`RuntimeWrapper`, `QueryWrapper`).
- Build-time const branches: tests need `vi.resetModules()` + `vi.doMock(...)` + `await import(...)`. After `resetModules()`, statically-loaded error classes become *different* references — `instanceof` checks must use the dynamically imported classes.
- Test QueryClient with no active observer for the read side: set `gcTime: 60_000` so cache mutations stick.
- Biome `noExcessiveCognitiveComplexity` caps at 15. `noLabelWithoutControl` fires when `<label>` wraps a Radix Switch — use `<div>` + `aria-label`.
- jsdom Radix specifics: `<DropdownMenu.Trigger>` does NOT open on `fireEvent.click` — use `fireEvent.keyDown(trigger, { key: 'Enter' })`. `<Popover.Trigger>` does open on click. Radix Tooltip portal renders TWO `role="tooltip"` elements — use `screen.queryAllByRole('tooltip')`.
- Next 16 / Turbopack production builds are stricter than Vitest: `@dialogus/shared/schemas` index re-exports fail; importing `@dialogus/rag` from any browser-bound module pulls in `@mastra/memory` Node-only deps. Always import via specific subpaths from `apps/web` — `@dialogus/shared/schemas/<name>` and `@dialogus/rag/domain/constants/citation`.
- Next 16 moved `experimental.typedRoutes` to top-level `typedRoutes`.
- `@mastra/client-js` `MemoryThread.update` issues `PATCH` (not PUT). Mastra default `apiPrefix = '/api'`.

## Open Risks

- Retrofit owed (task_10): `apps/api` `GET /library/books/:id` still missing `chapter_count`; canonical `bookSchema` in `@dialogus/shared` lacks it too. `ThreadHeader` slider falls back to "Capítulos disponíveis em breve".
- V1 gap (task_11 follow-up): selecting an existing thread from sidebar does NOT load that thread's `book_ids` into `<DialogusThread>` context. Phase 2: persist book scope and rehydrate on selection.
- Unresolved-badge branch (ADR-003) NOT wired — `UnresolvedCitationBadge` exists but only invoked once tool_outputs surface to `<DialogusMessage>`. Phase 2.

## Handoffs

- E2E mocking (task_14): set `EMBEDDING_PROVIDER=mock` + `SUMMARY_GENERATOR=mock` (worker-side) and `E2E_MOCK_LLM=1` (apps/mastra side) to run the full stack with zero outbound LLM calls. The mastra MSW shim lives at `apps/mastra/src/test-mocks/anthropic-msw.ts`; msw is a runtime dep of `@dialogus/mastra` because the Mastra build bundles imports even when guarded by env. Playwright config is at `apps/web/playwright.config.ts`; CI exposes two jobs (`integration-web`, `a11y`) under `.github/workflows/ci.yml`. Local-run docs: `apps/web/README.md`.
- `<AddGutendexSheet />` mounts globally in `apps/web/src/app/layout.tsx` (inside `<QueryClientProvider>`). Open state = module-singleton in `apps/web/src/components/chat/add-book-drawer-store.ts`. `<LibraryGrid>`, its empty-state CTA, and the `BookPicker` "Adicionar do Gutendex" link all call `openAddBookDrawer()`. No provider/context wrapping needed.
- Library query keys: `LIBRARY_QUERY_KEY = ['library'] as const` from `apps/web/src/app/library/LibraryGrid.tsx`. Per-card ingestion polling key: `['ingestion', book.id]`. RSC `page.tsx` prefetches and passes cached value as `initialData`.
- Reusable surfaces grep cheatsheet: `apps/web/src/components/{chat,citation}/`, `apps/web/src/lib/{citation-parser,spoiler-cap,thread-metadata,onboarding-titles,feature-flags}.ts`, `apps/web/src/hooks/{useMediaQuery,useThreadCleanup}.ts`, `apps/web/src/app/_components/DialogusLanding.tsx`. `THREADS_QUERY_KEY = ['threads'] as const` in `useThreadCleanup.ts`. `bookQueryKey(bookId) = ['book', bookId]` from `CitationTooltip.tsx`. `MAX_BOOKS_PER_THREAD = 3` from `DialogusContext`.
- Playwright/`data-slot` selectors available from prior tasks:
  - landing/sidebar (task_11): `dialogus-landing`, `dialogus-desktop-sidebar`, `dialogus-mobile-sidebar`, `dialogus-mobile-trigger`, `empty-chat-main`. Mobile breakpoint is CSS-driven (`lg:flex` / `lg:hidden`).
  - drawer/book/dialog (task_13): `add-gutendex-sheet`, `add-gutendex-search`, `add-gutendex-filter-chip[data-language]`, `add-gutendex-row[data-state]`, `add-gutendex-row-add`, `add-gutendex-load-more`, `remove-book-dialog{,-confirm,-cancel}`, `retry-button-dialog{,-confirm,-cancel}`, `cover-fallback`.
