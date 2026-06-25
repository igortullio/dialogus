# Implementation Plan: Ingestion Progress Tracking & Observability

**Branch**: `002-ingestion-progress-tracking` | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-ingestion-progress-tracking/spec.md`

## Summary

Make the book-ingestion pipeline **observable end to end** so a user can always tell what is
happening, how far along it is, and what to do when it breaks. The live baseline audit
([baseline/baseline-audit.md](./baseline/baseline-audit.md)) proved the problem: ingesting
Frankenstein, the **download stage held "Baixando 0%" for ~88 of ~99 seconds** (silently
retrying 3×) while the other six stages **flashed past in <2s each, invisible** under the 2s/4s
poll; failures leak a **raw error slug** (`ingestion-embed-failed: …`) and the retry dialog
never says it **resumes** rather than restarts.

**Technical approach**: the pipeline already computes everything we need and throws most of it
away. Stage handlers already compute per-stage sub-progress (summarize: `completed/totalChapters`,
embed: `batchesDone/expectedBatches`) but collapse it into a single `ingestion_progress` int
that resets to 0 each stage; `retryIngestBook` already resumes from `ingestion_last_stage`. So
this is **mostly a surfacing problem, not a re-architecture**:

1. **Persist** a typed per-stage progress record on the existing `books` row — one new
   `ingestion_stages jsonb` column (no second datastore), holding `{stage, state, units_done,
   units_total, unit, started_at, ended_at, attempt, cached}` for each of the seven stages.
   Stage handlers write their own record as they run (queued → running → done/failed/skipped),
   keeping the denormalized `ingestion_status`/`ingestion_progress` snapshot for the cheap list
   query. The `download` stage gains byte-progress + a heartbeat so it stops looking frozen.
2. **Aggregate** in the API: `getIngestionStatus` derives `overall_progress`, `stage_index`/
   `total_stages`, an ordered `stages[]` breakdown, `elapsed_ms`, best-effort `eta_ms`,
   `queued`, and `stalled` (from `updated_at`) — extending the existing Zod `IngestionStatusDto`
   envelope. No new endpoints; membership gating (FR-015) is unchanged.
3. **Surface** in the web app: a new `StageStepper` (seven ordered stages with per-stage state,
   sub-progress, cached markers, "etapa N de 7", overall bar, elapsed/ETA), a slug→localized
   friendly-message map (so the raw slug is never shown and the failing stage is named in plain
   language), retryable-only retry whose confirm dialog states it **resumes from the failed
   stage**, and a "queued"/"stalled" treatment. Polling stays at 2s/4s.

New work is authored as a Drizzle migration `0011_ingestion_stage_progress`, a typed schema in
`@dialogus/db` + `@dialogus/shared`, worker-side stage-record writes, API aggregation, and web
components — covered by Vitest unit, Testcontainers integration, and Playwright + axe E2E.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict`), Node ≥ 22.13, pnpm ≥ 9.15 (Corepack).

**Primary Dependencies**: Next.js 16 (App Router), Hono 4, Drizzle ORM, pg-boss, Zod 4,
TanStack Query, shadcn/ui (new-york) + Tailwind v4, lucide-react, sonner. Worker: `@dialogus/
ingestion` stage handlers. No new runtime dependencies.

**Storage**: single Postgres 18 + pgvector via Drizzle. One additive migration
`0011_ingestion_stage_progress` adds `books.ingestion_stages jsonb NOT NULL DEFAULT '[]'`
(and, if adopted, a denormalized `books.ingestion_overall_progress` smallint — see research D2).
No new tables, no second datastore.

**Testing**: Vitest 4 (unit), Testcontainers (integration over real Postgres/pgvector/pg-boss),
Playwright + `@axe-core/playwright` + Lighthouse (web E2E + a11y).

**Target Platform**: containerized Linux server behind a single-origin reverse proxy; modern
browsers. Invite-only multi-user deployment (feature 001).

**Project Type**: web — pnpm monorepo (`apps/web`, `apps/api`, `apps/mastra`, `apps/worker` +
`packages/*`).

**Performance Goals**: in-flight progress polling stays at the 2s (book card) / 4s (library
list) cadence — no tighter (Constitution IV). The status payload stays small (≤ ~2 KB: seven
stage records). The download stage emits progress/heartbeat at most ~once/second so it never
flat-lines for more than a few seconds (SC-002). Status reads add no N+1 queries — the stage
breakdown is one jsonb column on the row already fetched.

**Constraints**: no new real-time transport (polling only); resume-from-failed-stage idempotency
preserved and made auditable; spoiler-cap/citation/refusal/language correctness contracts
untouched; RFC 9457 problem+json for any error path; DDD layering; `apps/api` enqueues only /
`apps/worker` consumes only; schema via Drizzle migration; new config via `@dialogus/shared` Zod
env schema; Lighthouse a11y ≥ 0.9 with zero axe violations on `/library`; cognitive complexity ≤ 15.

**Scale/Scope**: personal/shared invite-only deployment (owner + ~10s of users); a handful of
concurrent ingestions; books up to ~thousands of chunks. Not a high-throughput service.

## Constitution Check

*GATE: re-checked after Phase 1 design — PASS, no unjustified deviations (Complexity Tracking empty).*

- [x] **I. Code Quality & Maintainability** — Stage-record writes live in `@dialogus/ingestion`
  application/infrastructure (worker side); API only reads + enqueues; web only renders — the
  `apps/api` (enqueue) vs `apps/worker` (consume) split is unchanged. Aggregation, the
  stage-record reducer, ETA, stall, and slug→message map are split into small pure helpers
  (≤ 15 cognitive complexity), unit-tested. The persistence-model choice (per-stage `jsonb` vs
  a second table) and the overall-progress derivation are slated for an ADR under
  `.compozy/tasks/002-ingestion-progress-tracking/adrs/`.
- [x] **II. Testing Standards** — Tests specified at the right layer (see [quickstart.md](./quickstart.md)):
  Vitest unit (overall-progress math, ETA, stall, reducer, slug map), Testcontainers integration
  over real pg-boss/Postgres (stage records written across the real chain; resume-from-failed
  preserves completed stage records and re-runs only the failed-and-after; cached-stage marking;
  download byte-progress ticks; membership gating still hides status — FR-015), Playwright + axe
  for the lifecycle journeys. The raw-slug leak and the "retry restarts" ambiguity each get a
  regression test. No correctness contract (citation/spoiler/refusal/language) is touched.
- [x] **III. User Experience Consistency** — The status payload stays a Zod-typed envelope; the
  list endpoint keeps cursor pagination + envelope. **No new endpoints and no new error slugs**
  are required (status/retry reuse existing routes); existing `urn:dialogus:problems:*` slugs
  (e.g. not-found, book-already-ready, book-not-in-retryable-state) are reused. UI is built from
  shadcn/Tailwind tokens (incl. the `--status-*` tokens already defined), responds in PT/EN
  (slug→message map is localized; source quotes unaffected), keeps `/library` at Lighthouse a11y
  ≥ 0.9 with zero axe violations, and the stepper is keyboard-navigable with `role`/`aria` state.
- [x] **IV. Performance Requirements** — Ingestion stays the idempotent, resume-from-failed-stage
  pg-boss chain — stage records make the resume **auditable**, they do not change it. Polling
  cadence is unchanged (2s/4s). Spoiler filtering stays in SQL on the HNSW index; chat streaming
  and Gutendex LRU + prompt caching are untouched. The download stage's added writes are
  throttled (~1/s) so progress ticks without hammering the row.
- [x] **Tech & workflow constraints** — Single Postgres preserved (a `jsonb` column, not a new
  store); all schema via Drizzle migration `0011_ingestion_stage_progress` applied with
  `pnpm db:migrate`; new config (stall threshold, download heartbeat interval) added to the
  `@dialogus/shared` Zod env schema; pre-commit (`lint && typecheck && test`) and the CI matrix
  must stay green.

## Project Structure

### Documentation (this feature)

```text
specs/002-ingestion-progress-tracking/
├── plan.md              # This file
├── spec.md              # Feature spec (/speckit-specify)
├── research.md          # Phase 0 — decisions + rationale + alternatives
├── data-model.md        # Phase 1 — IngestionStageProgress, jsonb column, migration 0011
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/           # Phase 1 — enriched status DTO, list DTO, retry messaging, slug map
│   ├── README.md
│   ├── ingestion-status.md
│   └── ingestion-retry.md
├── baseline/            # Live Playwright baseline audit (before-picture)
│   ├── baseline-audit.md
│   ├── baseline-01..07-*.png
│   └── frankenstein-stage-timeline.tsv
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
packages/
├── db/
│   ├── src/schema/books.ts        # + ingestion_stages jsonb ($type<IngestionStageProgress[]>),
│   │                              #   (overall progress is computed in the DTO; no extra column)
│   └── drizzle/0011_ingestion_stage_progress.sql   # NEW additive migration
├── shared/
│   └── src/
│       ├── schemas/ingestion.ts   # + ingestionStageProgressSchema, ingestionStageStateEnum;
│       │                          #   extend ingestionStatusDtoSchema (overall_progress,
│       │                          #   stage_index, total_stages, stages[], elapsed_ms, eta_ms,
│       │                          #   queued, stalled; error gains `stage`)
│       └── config/index.ts        # + INGESTION_STALL_THRESHOLD_MS, INGESTION_DOWNLOAD_HEARTBEAT_MS
└── ingestion/
    └── src/application/stages/
        ├── _common.ts             # stage-record helpers: markStageQueued/Running/Done/Skipped/Failed
        │                          #   (write into ingestion_stages jsonb); keep updateBookState snapshot
        ├── download.ts            # byte-progress (Content-Length) + per-attempt record + heartbeat
        ├── clean.ts, parse.ts, chunk.ts, index.ts   # write stage records; mark cached/skipped on cache hits
        ├── summarize.ts           # persist units_done/units_total (chapters) into the stage record
        └── embed.ts               # persist units_done/units_total (chunks/batches) into the stage record

apps/
├── api/
│   └── src/application/library/
│       ├── ingestionStatus.ts     # + computeOverallProgress, deriveStageBreakdown, deriveStalled,
│       │                          #   estimateEta (pure, unit-tested); error gains failing `stage`
│       ├── getIngestionStatus.ts  # read ingestion_stages + updatedAt; build enriched DTO
│       └── (routes unchanged)     # GET /books/:id/ingestion, POST /books/:id/ingest/retry reused
└── web/
    └── src/
        ├── components/library/
        │   ├── StageStepper.tsx        # NEW: 7 ordered stages, per-stage state, sub-progress,
        │   │                           #   cached markers, "etapa N de 7", overall bar, elapsed/ETA
        │   ├── StatusBadge.tsx         # add 'queued'/'stalled'/'cached' presentation; keep compact
        │   ├── BookCard.tsx            # render StageStepper while in-progress; STOP showing raw
        │   │                           #   ingestion_error — use localized slug map; queued/stalled UI
        │   ├── RetryButton.tsx         # confirm copy: "retoma da etapa <X>", retryable-only
        │   └── IngestionMonitor.tsx    # unchanged cadence; toast copy reuses friendly messages
        └── lib/
            ├── api/library.ts          # status fetch returns enriched DTO (types only)
            └── ingestion/messages.ts   # NEW: slug→{pt,en} friendly message + stage display names
```

**Structure Decision**: existing web monorepo; the feature is additive and surfacing-focused.
No new app or package. Persistence is one `jsonb` column on the existing `books` table; the
only cross-process changes are worker stage-handlers writing richer records and the web app
rendering them. The `apps/api` (enqueue) / `apps/worker` (consume) boundary and the polling
transport are unchanged.

## Complexity Tracking

> No constitution violations to justify. The persistence choice (a per-stage `jsonb` column on
> the existing row rather than a new `book_ingestion_stages` table) was made specifically to
> avoid a second store and honor the spec's "no separate store" assumption; the rejected
> alternative is recorded in [research.md](./research.md) (D1), not here, because it is the
> simpler option, not a deviation.
