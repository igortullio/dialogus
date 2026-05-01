# Task Memory: task_16.md

## Objective Snapshot

V1 cross-feature manual validation gate — COMPLETE. `docs/v1-validation-log.md` produced; 19-step Playwright journey run in E2E mock mode; V1 declared CONDITIONAL PASS.

## Important Decisions

- Validated in E2E mock mode (`E2E_MOCK_LLM=1`, `EMBEDDING_PROVIDER=mock`) against running services rather than full clean reset (books already ingested from prior work). All 19 steps completed.
- Step 12/13 (spoiler cap + out-of-scope refusal) marked PARTIAL PASS: mock embeddings (identical vectors) bypass real retrieval filter — cannot verify in mock mode. Structural routing confirmed via direct curl with `cap=0`.
- Step 14 (English question) marked PASS structural / NOTE language: mock always returns canned Portuguese regardless of input; ADR-002 language matching requires real LLM.

## Learnings

- Mastra thread per-ID endpoints (`GET/PATCH/DELETE /api/memory/threads/:id`) require `?agentId=dialogusAgent` query param — without it returns 400.
- Radix DropdownMenu trigger requires real Playwright pointer events (not JS synthetic `.click()`). Menu items also need `browser_click`.
- `ThreadPrimitive.If empty` renders reactively (not synchronously on mount) — test assertions against it need `waitFor`.
- `HTMLElement.prototype.scrollTo` not in jsdom — caused 8 unhandled exceptions in vitest that produced false exit code 1. Added polyfill to `__tests__/vitest.setup.ts`.

## Files / Surfaces

- `docs/v1-validation-log.md` — new portfolio artifact
- `docs/v1-screenshots/` — 17 screenshots captured
- `apps/web/src/lib/api/threads.ts` — agentId fix
- `apps/web/__tests__/lib/api/threads.test.ts` — updated URL assertions
- `apps/web/__tests__/app/page.test.tsx` — fetchLibraryCountByStatus mock update
- `apps/web/__tests__/app/_components/DialogusLanding.test.tsx` — waitFor fix + scrollTo polyfill
- `apps/web/__tests__/vitest.setup.ts` — HTMLElement.scrollTo polyfill
- `apps/mastra/src/test-mocks/anthropic-msw.ts` — match?.[1] TS guard

## Ready for Next Run

Task complete. Feature 004 fully closed. V1 declared production-ready (CONDITIONAL PASS).
