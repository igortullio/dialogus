# Chat UI — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Scaffold apps/web + tech-stack baseline + Mastra metadata verification | completed | high | — |
| 02 | @dialogus/shared/schemas/{chat,thread} Zod contracts | completed | low | task_01 |
| 03 | API clients (lib/api/library, catalog, chunks, threads) | completed | medium | task_02 |
| 04 | Streaming-aware citation parser + tests | completed | medium | task_01 |
| 05 | useSpoilerCap + useThreadMetadata hooks | completed | medium | task_02 |
| 06 | shadcn primitives + Tailwind v4 tokens setup | completed | low | task_01 |
| 07 | assistant-ui glue layer (DialogusThread/Composer/Message) | completed | high | task_03, task_04, task_05, task_06 |
| 08 | Citation components (Badge/Tooltip/SidePanel/Unresolved) | completed | medium | task_06, task_07 |
| 09 | Sidebar (ThreadSidebar/ThreadRow/EmptyStateCard) | completed | medium | task_05, task_06 |
| 10 | ThreadHeader (book chips + spoiler-cap chip + popover) | completed | low | task_05, task_06, task_07 |
| 11 | Chat-first landing /page.tsx (composição) | completed | medium | task_07, task_08, task_09, task_10 |
| 12 | Library page (/library + LibraryGrid + BookCard + StatusBadge) | completed | high | task_03, task_06 |
| 13 | Gutendex drawer + Remove dialog + Retry button + CoverFallback | completed | high | task_12 |
| 14 | Playwright integration + Lighthouse a11y + CI extension | completed | medium | task_11, task_12, task_13 |
| 15 | Manual smoke + README + screencast + Feature 004 closure | pending | medium | task_14 |
| 16 | V1 cross-feature manual validation gate | pending | medium | task_15 |

**External prerequisite:** Feature 003 task_13 (RAG agent closure) must be merged before task_01 starts.

**V1 dogfooding gate:** task_16 is the cross-feature integration validation that declares V1 production-ready. It exercises Features 000 → 004 as a single system via Playwright MCP + cURL + output assertions. Passing task_16 closes the V1 specification + implementation cycle.

**Conditional follow-up:** if task_01's Mastra metadata verification fails, two additional tasks (task_16: `thread_metadata` table + migration; task_17: `apps/api` `/api/library/threads/:id/metadata` endpoints) are added per ADR-007 fallback path.

**Retrofit follow-up (task_10 → Features 001/002):** the canonical `bookSchema` in `@dialogus/shared` and `apps/api`'s `GET /library/books/:id` envelope must include `chapter_count: number`. The local `apps/web/src/lib/api/_schemas.ts` already declares `chapter_count?: number` (optional) and `ThreadHeader` falls back to "Capítulos disponíveis em breve" when absent, but the slider only becomes useful once the field flows through the wire. Implementation outline: (a) extend `bookSchema` in `@dialogus/shared`, (b) compute `chapter_count` from a Drizzle `count(chapters)` join in the apps/api `getBookById` handler. Estimated effort: ~2 lines per side.
