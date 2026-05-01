---
status: completed
title: "apps/mastra scaffold + mastra.config.ts wiring"
type: backend
complexity: medium
dependencies:
  - task_07
---

# Task 08: apps/mastra scaffold + mastra.config.ts wiring

## Overview

Scaffold the `apps/mastra` Mastra Dev Server process per product ADR-005 and TechSpec § System Architecture. Wire dependency injection in `mastra.config.ts`: instantiate `@mastra/pg` storage against `DATABASE_URL`, import Drizzle adapters from `@dialogus/ingestion` (per ADR-006), construct `OpenAIQueryEmbedder` (task 02), pass the resulting dep object to `createDialogusAgent()` (task 07), and expose the agent via a Mastra instance. Root `pnpm dev` orchestration gains `apps/mastra` as the fourth parallel process.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/mastra/` workspace app with:
  - `package.json` (`"type": "module"`, `scripts: { dev: "mastra dev", start: "mastra start", build: "mastra build", typecheck: "tsc --noEmit", test: "vitest run" }`) and deps on `@mastra/core`, `@mastra/pg`, `@dialogus/rag` (workspace), `@dialogus/ingestion` (workspace — for Drizzle adapters per ADR-006), `@dialogus/shared` (workspace), `@dialogus/db` (workspace — for `createDatabase`), `pino`, `pino-pretty`. Pin exact `@mastra/*` versions per product TechSpec § Known Risks.
  - `tsconfig.json` extending root.
- MUST create `apps/mastra/src/index.ts` as the thin entry point:
  - `loadConfig()` from `@dialogus/shared/config` → env validated at boot.
  - `createDatabase(DATABASE_URL)` from `@dialogus/db` → Drizzle client singleton.
  - Instantiate `OpenAIQueryEmbedder` (or `MockQueryEmbedder` when `NODE_ENV === 'test'`).
  - Instantiate three Drizzle adapters from `@dialogus/ingestion`: `DrizzleChunkRepository`, `DrizzleChapterRepository`, `DrizzleChapterSummaryRepository` — structurally satisfy the `ChunkReadRepository`, `ChapterReadRepository`, `ChapterSummaryReadRepository` ports.
  - Call `createDialogusAgent({ chunkRepo, chapterRepo, chapterSummaryRepo, queryEmbedder, logger, modelId })` where `modelId` is `'claude-haiku-4-5'` when `NODE_ENV !== 'production'`, `'claude-sonnet-4-6'` otherwise.
  - Construct the `Mastra` instance: `new Mastra({ storage: new PgStorage({ connectionString: DATABASE_URL }), agents: { dialogusAgent } })`.
- MUST create `apps/mastra/mastra.config.ts` exporting the `Mastra` instance (per Mastra 1.x's `mastra dev` CLI expectation; confirm exact entry-point contract at the pinned version and adjust if needed).
- MUST update `.env.example` at the repo root: add `MASTRA_PORT=3002`, `MASTRA_STUDIO_PORT=4111`, `NEXT_PUBLIC_MASTRA_URL=http://localhost:3002`. Extend `@dialogus/shared/src/config/index.ts` `envSchema` to validate these vars.
- MUST update the root `package.json` `dev` script to include `apps/mastra` in the parallel set. The existing `pnpm --parallel -r dev` already picks up any workspace that defines a `dev` script — verify this Just Works; otherwise document the extension.
- MUST add a smoke unit test: `apps/mastra/__tests__/boot.test.ts` that imports `mastra.config.ts`, asserts the export is a `Mastra` instance, and asserts the `dialogusAgent` is registered. No real DB or LLM calls.
- MUST NOT modify Feature 001 `apps/api` or Feature 002 `apps/worker` in this task. If the orchestration needs a concurrency tool beyond `pnpm -r --parallel`, document the migration as a follow-up; do not retrofit here.
- MUST extend `apps/api /health` (Foundation task_05, Feature 001 task_14) to include a `mastra` field — ping `http://localhost:${MASTRA_PORT}/api/health` or equivalent once per `/health` call, return `'up' | 'down'`. Update Foundation's Zod health schema as a minor retrofit. Failure-tolerant: Mastra down does not fail the `/health` probe overall; it reports `mastra: 'down'`.

</requirements>

## Subtasks

- [x] 8.1 Scaffold `apps/mastra/` (package.json, tsconfig.json, src/).
- [x] 8.2 Author `src/index.ts` wiring.
- [x] 8.3 Author `mastra.config.ts`.
- [x] 8.4 Update `.env.example` + extend `envSchema` in `@dialogus/shared/config`.
- [x] 8.5 Verify root `pnpm dev` parallelization picks up `apps/mastra`.
- [x] 8.6 Extend `/health` to include `mastra` field.
- [x] 8.7 Smoke boot test.

## Implementation Details

Reference TechSpec § System Architecture → Component Overview for the component tree; TechSpec § Core Interfaces for the `createDialogusAgent` signature; product ADRs 005 + 006 for the runtime contract. `@mastra/pg`'s `PgStorage` is what creates and evolves the `mastra_*` tables — the first `pnpm dev` run after this task ships will trigger the first migration of those tables. Document this in `apps/mastra/README.md` (authored in task_11).

The `DrizzleChapterSummaryRepository` constructor from Feature 002 task_21 likely needs a `Database` instance; import the same `createDatabase` used by other apps.

For the `/health` retrofit on `apps/api`: the cross-process probe can simply `fetch(\`${MASTRA_URL}/api/health\`)` with a 1-second timeout. If Mastra's health endpoint path differs at the pinned version, adjust accordingly. The goal is a single-glance status line in the landing page.

### Relevant Files

- `packages/rag/src/application/createDialogusAgent.ts` (task_07) — factory entry.
- `packages/ingestion/src/infrastructure/persistence/DrizzleChapterRepository.ts` (Feature 002 task_05) — adapter.
- `packages/ingestion/src/infrastructure/persistence/DrizzleChunkRepository.ts` (Feature 002 task_05) — adapter.
- `packages/ingestion/src/infrastructure/persistence/DrizzleChapterSummaryRepository.ts` (Feature 002 task_21) — adapter (amendment).
- `packages/db/src/client.ts` (Foundation task_04) — `createDatabase`.
- `packages/shared/src/config/index.ts` (Foundation task_03) — `envSchema` + `loadConfig`.
- `apps/api/src/index.ts` + `apps/api/src/infrastructure/http/routes/health.ts` — extension target.
- Product ADR-005: [Mastra Dev Server as separate process](../dialogus/adrs/adr-005.md).
- Product ADR-006: [Mastra Memory owns conversation persistence](../dialogus/adrs/adr-006.md).
- [ADR-006: @dialogus/rag depends on @dialogus/ingestion](adrs/adr-006.md).

### Dependent Files

- `apps/mastra/package.json` (new)
- `apps/mastra/tsconfig.json` (new)
- `apps/mastra/src/index.ts` (new)
- `apps/mastra/mastra.config.ts` (new)
- `apps/mastra/__tests__/boot.test.ts` (new)
- `.env.example` (modify)
- `packages/shared/src/config/index.ts` (modify: envSchema adds Mastra vars)
- `packages/shared/src/schemas/health.ts` (modify: adds `mastra: 'up' | 'down'`)
- `apps/api/src/infrastructure/http/routes/health.ts` (modify: adds Mastra probe)
- `apps/api/src/infrastructure/http/routes/__tests__/health.test.ts` (modify: new mastra mock)
- Root `package.json` (verify; modify only if `pnpm -r --parallel` needs augmentation)

### Related ADRs

- Product [ADR-005: Mastra Dev Server](../dialogus/adrs/adr-005.md).
- Product [ADR-006: Mastra Memory](../dialogus/adrs/adr-006.md).
- [ADR-006: Dep direction](adrs/adr-006.md).

## Deliverables

- `apps/mastra` app scaffolded + wired.
- Env schema + `.env.example` extended.
- `/health` extended to include Mastra.
- Root `pnpm dev` boots all four processes in parallel.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — deferred to task_09.

## Tests

- Unit tests:
  - [x] `apps/mastra/__tests__/boot.test.ts` — importing `mastra.config.ts` in a unit-test env (`MockQueryEmbedder`, no DB) produces a `Mastra` instance with `dialogusAgent` in the agents map.
  - [x] `@dialogus/shared/config` `envSchema` rejects malformed `MASTRA_PORT` values (the schema follows the existing `API_PORT`/`WEB_PORT` convention of accepting absence by defaulting to `3002`; "rejects requests missing `MASTRA_PORT`" was reinterpreted as "rejects malformed `MASTRA_PORT`").
  - [x] `@dialogus/shared/config` `envSchema` accepts `MASTRA_PORT=3002`.
  - [x] `/health` route test — all up → `{ api, db, pgboss, mastra } === { up, up, up, up }`.
  - [x] `/health` route test — Mastra unreachable (fetch rejects) → `mastra: 'down'`, other probes unchanged.
  - [x] `modelId` selection: `NODE_ENV = 'production'` → Sonnet 4.6; otherwise Haiku 4.5 (asserted via `pickModelId` exported from `mastra.config.ts`).
- Integration tests:
  - [ ] Deferred to task_09.
- Test coverage target: >=80% (apps/mastra unit tests cover boot wiring + chunk adapter not-implemented stubs + chapter / chapter-summary read paths)
- All tests must pass

## Success Criteria

- All tests passing
- `pnpm dev` boots `apps/mastra` on port 3002 alongside `apps/api`, `apps/worker`, `apps/web`.
- Mastra Studio reachable at `localhost:4111` with `dialogusAgent` visible in the agents panel.
- `/health` returns all four components' status; landing page (from Feature 000 / 001 / 002) still renders cleanly.
- `@mastra/pg` creates `mastra_*` tables on first boot; subsequent boots reuse them.
