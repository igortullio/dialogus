---
status: completed
title: "Scaffold apps/web + tech-stack baseline + Mastra metadata verification"
type: frontend
complexity: high
dependencies: []
---

# Task 01: Scaffold apps/web + tech-stack baseline + Mastra metadata verification

## Overview

Promote the existing `apps/web` Foundation stub into a fully-equipped Next.js 16 app with Tailwind v4 + shadcn + assistant-ui + Vercel AI SDK + TanStack Query, set the root layout providers, and run a one-shot verification that the pinned `@mastra/core` version exposes per-thread metadata for rename + pin per ADR-007. The verification's outcome gates whether the conditional fallback path (`thread_metadata` table + endpoints) needs to be scheduled.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST install pinned versions of: `next@16.x.x`, `react@19.x.x`, `react-dom@19.x.x`, `@assistant-ui/react@<exact>`, `@assistant-ui/react-ai-sdk@<exact>`, `@ai-sdk/react@<exact>`, `@tanstack/react-query@<exact>`, `tailwindcss@4.x.x`, plus shadcn deps. Update `apps/web/package.json` with workspace deps on `@dialogus/shared`, `@dialogus/rag` (for `CITATION_MARKER_REGEX`).
- MUST configure Tailwind v4 with inline-tokens setup (`tailwind.config.ts` or CSS-first as TailwindV4 supports). Configure shadcn `init` with the project's design language (neutral palette, serif font for book titles/headlines).
- MUST add `<QueryClientProvider>` (with default `staleTime: 30_000`) + `<ThemeProvider>` (system preference; no toggle V1) to `apps/web/src/app/layout.tsx`.
- MUST initialize the shadcn registry via `npx shadcn add` for: button, card, badge, input, separator, skeleton, sonner. Other components install in later tasks (task_06 finalizes the full set).
- MUST update `.env.example` if missing `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_MASTRA_URL` (Foundation + 003 already set these; verify).
- MUST run a one-shot verification script (Vitest test or standalone): boot a Mastra client against a running `apps/mastra`; create a thread; attempt `update-thread` with `{ metadata: { custom_title: 'verification', pinned: true } }`; read it back; assert success.
- MUST commit the verification result as a build-time flag (e.g., `apps/web/src/lib/feature-flags.ts` with `MASTRA_THREAD_METADATA_AVAILABLE: true | false`). This flag is consumed by `useThreadMetadata` (task_05).
- If verification fails, MUST document the failure mode (error message, Mastra version), open follow-up tasks (task_16: `thread_metadata` table; task_17: API endpoints) and update task_15 deps to include them.
- MUST configure `apps/web/next.config.ts` with: `experimental.typedRoutes: true`, no `output: 'export'` (we want full Next 16 features), allowed image domains (Gutendex covers).
- MUST extend `apps/web/tsconfig.json` to extend root + add `"jsx": "preserve"` and Next-specific paths.

</requirements>

## Subtasks

- [x] 1.1 Install pinned deps + scaffold base directories (`src/app/`, `src/components/`, `src/lib/`, `src/hooks/`, `__tests__/`).
- [x] 1.2 Configure Tailwind v4 + shadcn `init` + base shadcn components (button, card, badge, input, separator, skeleton, sonner).
- [x] 1.3 Add `<QueryClientProvider>` + `<ThemeProvider>` to root `layout.tsx`.
- [x] 1.4 Author the Mastra metadata verification test/script.
- [x] 1.5 Run verification; record outcome in `feature-flags.ts`.
- [x] 1.6 If fallback needed, add task_16 + task_17 to `_tasks.md` and update task_15 deps. (Not needed — verification passed; `MASTRA_THREAD_METADATA_AVAILABLE = true`.)
- [x] 1.7 Verify `pnpm dev` boots `apps/web` cleanly on port 3000.

## Implementation Details

Reference TechSpec § Component Overview for the directory layout and § Build Order step 1 for the verification flow. Mastra's metadata API surface at the pinned version is documented in `@mastra/core` package — read those docs before authoring the verification script.

The Tailwind v4 + shadcn integration may require adjustments since shadcn's class string approach pre-dates v4's CSS-first tokens; document any divergence in `apps/web/README.md` (created in task_15). For unfamiliar setups, read shadcn's official Tailwind v4 migration notes.

The `feature-flags.ts` exporter is intentionally simple: a single TypeScript constant with a boolean. No environment variable, no runtime check — verification is a one-shot at task_01, and the flag drives task_05's hook implementation.

### Relevant Files

- `apps/web/` (Foundation stub from task_06 of Feature 000).
- `apps/api/src/index.ts` (Foundation) — port 3001 reference.
- `apps/mastra/src/index.ts` (Feature 003 task_08) — port 3002 reference; required to be running for verification.
- `packages/shared/src/config/index.ts` (Foundation task_03) — env schema.
- `packages/rag/src/domain/constants/citation.ts` (Feature 003 task_01) — re-exports `CITATION_MARKER_REGEX`; needed by task_04.

### Dependent Files

- `apps/web/package.json` (modify: add deps; pin versions)
- `apps/web/tsconfig.json` (modify)
- `apps/web/next.config.ts` (modify or create)
- `apps/web/tailwind.config.ts` (new or replace stub)
- `apps/web/components.json` (new — shadcn config)
- `apps/web/src/app/layout.tsx` (modify: providers)
- `apps/web/src/app/globals.css` (modify: Tailwind v4 directives)
- `apps/web/src/lib/feature-flags.ts` (new)
- `apps/web/src/lib/query-client.tsx` (new — QueryClientProvider wrapper)
- `apps/web/__tests__/setup/mastra-metadata-verification.test.ts` (new)
- `_tasks.md` (modify only if fallback needed)

### Related ADRs

- [ADR-006: assistant-ui chat shell + shadcn for everything else](adrs/adr-006.md) — sets up both libraries here.
- [ADR-007: Mastra metadata primary + fallback](adrs/adr-007.md) — verification gates the path.
- [ADR-009: RSC + TanStack Query hydration](adrs/adr-009.md) — `<QueryClientProvider>` set up here.
- Product [ADR-005: Mastra Dev Server separate process](../dialogus/adrs/adr-005.md).

## Deliverables

- `apps/web` scaffold with Tailwind v4 + shadcn + assistant-ui + AI SDK + TanStack Query installed.
- Root layout with providers.
- Mastra metadata verification recorded.
- `pnpm dev` boots cleanly.
- Unit tests with 80%+ coverage **(REQUIRED)** — verification + provider smoke.
- Integration tests **(REQUIRED)** — deferred to task_14.

## Tests

- Unit tests:
  - [x] `apps/web/__tests__/setup/providers.test.tsx` — root layout renders QueryClientProvider + ThemeProvider; children mount.
  - [x] `apps/web/__tests__/setup/mastra-metadata-verification.test.ts` — runs the verification script against a mocked Mastra client; asserts metadata round-trip works (or fails with a documented error).
  - [x] `feature-flags.ts` exports `MASTRA_THREAD_METADATA_AVAILABLE` as a boolean.
  - [x] `pnpm --filter @dialogus/web typecheck` passes.
  - [x] `apps/web/__tests__/setup/tailwind-smoke.test.tsx` — Button + shadcn primitives render with Tailwind utility classes.
- Integration tests:
  - [ ] Deferred to task_14.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm dev` boots all four processes (api, mastra, worker, web) including `apps/web` on port 3000.
- Tailwind v4 styles render correctly on a smoke `<Button>` element.
- Mastra metadata verification produces a definitive `true | false` flag.
