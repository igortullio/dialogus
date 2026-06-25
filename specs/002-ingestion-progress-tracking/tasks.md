---

description: "Task list for Ingestion Progress Tracking & Observability"
---

# Tasks: Ingestion Progress Tracking & Observability

**Input**: Design documents from `specs/002-ingestion-progress-tracking/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: REQUIRED by Constitution Principle II. This change touches DB / pg-boss behavior and
fixes two user-visible bugs (raw-slug leak, "retry restarts?" ambiguity) — those get regression
tests at the right layer (Vitest unit, Testcontainers integration, Playwright + axe-core).

**Organization**: grouped by user story (US1 = P1, US2 = P2, US3 = P3) so each is independently
implementable, testable, and demoable. Story → requirement mapping is from [spec.md](./spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish carry no story label)

## Path Conventions

pnpm monorepo: `packages/shared`, `packages/db`, `packages/ingestion` (worker-side stage
handlers), `apps/api` (enqueue + read), `apps/web` (Next.js UI). Tests live under each package's
`__tests__/` (Vitest/Testcontainers) and `apps/web/__tests__/integration/` (Playwright).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: configuration plumbing the rest of the feature reads at boot.

- [x] T001 [P] Add `INGESTION_STALL_THRESHOLD_MS` (default 60000) and `INGESTION_DOWNLOAD_HEARTBEAT_MS` (default 1000) to the Zod env schema in `packages/shared/src/config/index.ts`
- [x] T002 [P] Document both new vars (with defaults + purpose) in `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the persisted per-stage record backbone + API aggregation that EVERY story reads.

**⚠️ CRITICAL**: no user story can deliver value until this phase is complete.

### Foundational implementation

- [x] T003 Add `ingestionStageStateEnum` + `ingestionStageProgressSchema`, and extend `ingestionStatusDtoSchema` with `overall_progress`, `stage_index`, `total_stages`, `stages[]`, `elapsed_ms`, `eta_ms` (nullable), `queued`, `stalled`, and `error.stage`, in `packages/shared/src/schemas/ingestion.ts` (per [data-model.md](./data-model.md) + [contracts/ingestion-status.md](./contracts/ingestion-status.md))
- [x] T004 Create additive Drizzle migration `packages/db/drizzle/0011_ingestion_stage_progress.sql` adding `books.ingestion_stages jsonb NOT NULL DEFAULT '[]'::jsonb`
- [x] T005 Add the `ingestionStages` column (`jsonb().$type<IngestionStageProgress[]>().notNull().default('[]')`) to `packages/db/src/schema/books.ts` and re-export the `IngestionStageProgress` type (depends on T003, T004)
- [x] T006 Implement stage-record helpers `markStageQueued / markStageRunning / markStageDone / markStageSkipped / markStageFailed` (read-modify-write the `ingestion_stages` jsonb, keep the denormalized snapshot in sync) plus `resetStagesFrom(stage)` for retry, in `packages/ingestion/src/application/stages/_common.ts` (depends on T005)
- [x] T007 [P] Wire `queued→running→done`/`failed` transitions (and enqueue the next stage as `queued`) into `download`, `clean`, `parse` handlers in `packages/ingestion/src/application/stages/{download,clean,parse}.ts` using the T006 helpers
- [x] T008 [P] Wire `queued→running→done`/`failed` transitions into `chunk`, `summarize`, `embed`, `index` handlers in `packages/ingestion/src/application/stages/{chunk,summarize,embed,index}.ts` using the T006 helpers
- [x] T009 Implement pure aggregation helpers `computeOverallProgress`, `deriveStageBreakdown` (incl. graceful degradation when `ingestion_stages` is empty — reconstruct from `status` + static order, FR-013), `deriveStalled`, `estimateEta`, `deriveErrorStage` in `apps/api/src/application/library/ingestionStatus.ts` (depends on T003)
- [x] T010 Update `getIngestionStatus` to read `ingestion_stages` + `updated_at` and return the enriched DTO (membership gate unchanged — FR-015) in `apps/api/src/application/library/getIngestionStatus.ts` (depends on T009)
- [x] T011 Apply the migration locally (`pnpm db:migrate`) and run `pnpm typecheck` across packages to confirm the new column + types compile (depends on T004, T005)

### Foundational tests (write alongside; pure-helper tests fail before T009)

- [x] T012 [P] Unit tests for `computeOverallProgress`, `estimateEta`, `deriveStalled`, `deriveErrorStage`, and empty-`stages[]` degradation in `apps/api/__tests__/application/library/ingestionStatus.test.ts`
- [x] T013 [P] Unit tests for the stage-record helpers + `resetStagesFrom` (queued→running→done/failed/skipped, resume reset preserves earlier records) in `packages/ingestion/__tests__/application/stages/_common.test.ts`

**Checkpoint**: stage records persist across the real chain and the status endpoint returns the
enriched payload — stories can now begin.

---

## Phase 3: User Story 1 — See clear end-to-end progress (Priority: P1) 🎯 MVP

**Goal**: a legible 7-stage stepper with overall position, auto-updating progress, a download
that never looks frozen, and cached-stage markers. (FR-001, FR-002, FR-003, FR-005, FR-013, FR-014)

**Independent Test**: add a book; the card shows ordered stages with states + "etapa N de 7 · P%",
advances on its own at the 2s cadence, download shows bytes/attempt/heartbeat (never static 0%),
cached stages are marked, and a mid-ingest refresh reconstructs the exact state.

### Tests for User Story 1 ⚠️

- [x] T014 [P] [US1] Testcontainers integration: the real chain writes correct ordered stage records and `overall_progress` advances; a second ingest of the same book marks `download`/`clean`/`parse` as `skipped`+`cached`; the (stubbed) downloader emits byte-progress ticks — in `apps/api/__tests__/integration/ingestion-progress.integration.test.ts`
- [x] T015 [P] [US1] Playwright + axe E2E: stepper visible with per-stage states and overall bar, progress value changes within a poll window, cached marker shown, hard-refresh reconstructs progress, library-list and book-card never contradict, zero axe violations on `/library` — in `apps/web/__tests__/integration/ingestion-progress.spec.ts`

### Implementation for User Story 1

- [x] T016 [US1] Add byte-progress (`bytesWritten / Content-Length` → `units_done/units_total`, `unit:'bytes'`), per-attempt `attempt` increment, and an indeterminate + `INGESTION_DOWNLOAD_HEARTBEAT_MS` heartbeat path, to `packages/ingestion/src/application/stages/download.ts` (kills the frozen "Baixando 0%", SC-002)
- [x] T017 [P] [US1] Add cache-hit detection → `markStageSkipped({cached:true})` in `packages/ingestion/src/application/stages/{clean,parse,chunk}.ts` (download cache-hit handled in T016) (FR-005)
- [x] T018 [US1] Add `ingestion_overall_progress` to the list DTO (`toBookDto`) computed from snapshot columns, in `apps/api/src/infrastructure/http/routes/library.ts` (cheap overall bar without the heavy payload)
- [x] T019 [P] [US1] Mirror the enriched status + list shapes into the web client types in `apps/web/src/lib/api/_schemas.ts` and `apps/web/src/lib/api/library.ts`
- [x] T020 [US1] Create the `StageStepper` component (7 ordered stages as `role="list"`, per-stage state icons + `aria`, overall bar with "etapa N de 7 · P%", current-stage emphasis, cached markers) using shadcn/Tailwind `--status-*` tokens, in `apps/web/src/components/library/StageStepper.tsx`
- [x] T021 [US1] Render `StageStepper` while in-progress and consume the enriched DTO in `apps/web/src/components/library/BookCard.tsx` (keep the 2s poll cadence)
- [x] T022 [US1] Extend `StatusBadge` with `cached` presentation (and accept the new states without breaking the compact list badge) in `apps/web/src/components/library/StatusBadge.tsx`

**Checkpoint**: MVP — a user can follow ingestion end to end and nothing looks frozen or glitchy.

---

## Phase 4: User Story 2 — Understand and recover from failures (Priority: P2)

**Goal**: failures name the stage in plain, localized language (no raw slug), offer retry only
when recoverable, and make clear that retry **resumes** (preserving completed work). (FR-008,
FR-009, FR-010, FR-011, FR-015)

**Independent Test**: force a retryable failure; the card shows a friendly reason naming the stage
with no `ingestion-*-failed:` slug, offers retry, the confirm dialog says it resumes from the
failed stage, and retry re-runs only the failed-and-after stages.

### Tests for User Story 2 ⚠️

- [x] T023 [P] [US2] Unit tests for the `slug → {pt,en}` message map + stage display names (every slug mapped; fallback covered) in `apps/web/__tests__/unit/ingestion-messages.test.ts`
- [x] T024 [P] [US2] Testcontainers integration: retry from a forced failure re-runs only the failed-and-after stages (earlier `done` records preserved); enriched status stays membership-gated for non-members (FR-015) — extend `apps/api/__tests__/integration/ingestion-retry.integration.test.ts`
- [x] T025 [P] [US2] Playwright E2E: failed card names the stage + friendly reason with **no raw slug** (regression), retry shown only for retryable, confirm dialog states "retoma da etapa X" (regression), and the card re-enters the stepper at the resumed stage — in `apps/web/__tests__/integration/ingestion-failure.spec.ts`

### Implementation for User Story 2

- [x] T026 [US2] Populate `error.stage` (failing stage) in the status DTO via `deriveErrorStage` in `apps/api/src/application/library/getIngestionStatus.ts` / `ingestionStatus.ts`
- [x] T027 [P] [US2] Create the `slug → {pt,en}` friendly-message map + stage display names (per [contracts/ingestion-retry.md](./contracts/ingestion-retry.md)) in `apps/web/src/lib/ingestion/messages.ts`
- [x] T028 [US2] Stop rendering the raw `book.ingestion_error`; render the localized message + failing-stage label from the map in `apps/web/src/components/library/BookCard.tsx` (fixes the leak root cause: the terminal-state fallback)
- [x] T029 [US2] Update `RetryButton` confirm copy to name the resume stage and state completed work is preserved, and render the retry affordance **only** for `error.retryable` failures (non-retryable shows a "não é recuperável" note, no retry — FR-009), in `apps/web/src/components/library/{RetryButton,BookCard}.tsx`
- [x] T030 [US2] On retry success, re-enter the in-progress stepper at the resumed stage (toast "Retomando a partir de <stage>") in `apps/web/src/components/library/BookCard.tsx` (coordinate with T028 — same file, sequential)

**Checkpoint**: failures are legible and recovery is trustworthy; US1 + US2 both work.

---

## Phase 5: User Story 3 — Work-level sub-progress for long stages (Priority: P3)

**Goal**: long batch stages show real units done/total plus elapsed and best-effort ETA, so they
never look frozen. (FR-004, FR-007)

**Independent Test**: ingest a multi-chapter book; `summarize`/`embed` show advancing units
("12/87 capítulos", "256/412 trechos") with elapsed and (when estimable) ETA.

### Tests for User Story 3 ⚠️

- [x] T031 [P] [US3] Testcontainers integration: `summarize`/`embed` stage records' `units_done` strictly increases toward `units_total` and the status payload reflects it — extend `apps/api/__tests__/integration/summarize.integration.test.ts` and add an embed counterpart
- [x] T032 [P] [US3] Playwright E2E: a batch stage shows a unit count that increases over time, plus elapsed and (when present) ETA — in `apps/web/__tests__/integration/ingestion-subprogress.spec.ts`

### Implementation for User Story 3

- [x] T033 [P] [US3] Persist `units_done`/`units_total` (`unit:'chapters'`) into the stage record as chapters complete in `packages/ingestion/src/application/stages/summarize.ts` (reuse the existing `completed/totalChapters` it already computes)
- [x] T034 [P] [US3] Persist `units_done`/`units_total` (`unit:'chunks'`) into the stage record as batches complete in `packages/ingestion/src/application/stages/embed.ts` (reuse the existing `batchesDone/expectedBatches`)
- [x] T035 [US3] Render per-stage unit counts ("12/87 capítulos"), overall elapsed, and ETA (when `eta_ms` present) in `apps/web/src/components/library/StageStepper.tsx` (depends on T020)
- [x] T036 [P] [US3] Surface ingestion timing (started/finished, per-stage durations) in the details view `apps/web/src/components/library/BookDetailsDialog.tsx` (also replaces the raw untranslated `Status: ready`)

**Checkpoint**: all three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: the remaining edge cases, accessibility, decisions record, and validation.

- [x] T037 [P] Add queued/waiting + stalled treatment in `apps/web/src/components/library/StageStepper.tsx` / `StatusBadge.tsx` (consume `queued`/`stalled` from the DTO — FR-006, FR-016)
- [x] T038 [P] Verify degenerate-structure books (0 chapters/chunks) resolve to a terminal state with sane progress; add a guard/test in `packages/ingestion/__tests__/application/stages/summarize.test.ts` (FR-017)
- [x] T039 [P] Reuse the friendly-message map in `IngestionMonitor` terminal toasts in `apps/web/src/components/library/IngestionMonitor.tsx` (consistent wording; keep once-only de-dup — FR-012)
- [x] T040 Write ADR for the persistence model (per-stage `jsonb` vs second table) and the overall-progress derivation in `.compozy/tasks/002-ingestion-progress-tracking/adrs/`
- [x] T041 [P] Confirm Lighthouse a11y ≥ 0.9 and zero `@axe-core/playwright` violations on `/library`, and full keyboard nav through the stepper
- [x] T042 Run the [quickstart.md](./quickstart.md) Scenarios 1–6 with `EMBEDDING_PROVIDER=mock SUMMARY_GENERATOR=mock`; capture after-screenshots to compare against `baseline/`
- [x] T043 Run `pnpm lint && pnpm typecheck && pnpm test` and the Testcontainers integration matrix; ensure all green before merge

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **blocks all stories**. Within it: T003 → T004/T005 → T006 → T007/T008; T003 → T009 → T010; T011 after T004/T005; tests T012/T013 alongside.
- **US1 (Phase 3)**, **US2 (Phase 4)**, **US3 (Phase 5)**: each depends only on Foundational; independently testable. Recommended order P1 → P2 → P3.
- **Polish (Phase 6)**: depends on the stories it touches (T035/T037 need T020; T039 needs T027).

### Story independence

- **US1** stands alone (stepper + overall progress + cached + download fix).
- **US2** reads the same stage records but its UI (messages, retry copy) is independent of US1's stepper; the `error.stage` field is additive.
- **US3** only enriches stage records with units + the stepper's unit display; US1/US2 work without it.

### Within each story

- Tests written alongside implementation; the two regressions (raw-slug leak T025, resume wording T025; helper tests T012/T013) must fail before their fix and pass after.
- Worker stage-handler changes (packages/ingestion) before API aggregation surfaces them; API before web consumes.

---

## Parallel Opportunities

- **Setup**: T001, T002 in parallel.
- **Foundational**: T007 ∥ T008 (different handler files); T012 ∥ T013 (different test files).
- **US1**: T014 ∥ T015 (tests); T017 ∥ T019 (different files) while T016 proceeds; T020 then T021/T022.
- **US2**: T023 ∥ T024 ∥ T025 (tests); T027 ∥ T026 (different files).
- **US3**: T031 ∥ T032 (tests); T033 ∥ T034 ∥ T036 (different files).
- **Cross-story**: with capacity, US1/US2/US3 can be staffed in parallel once Foundational lands.

### Parallel example: Foundational handler wiring

```bash
Task T007: "Wire stage records into download/clean/parse handlers"
Task T008: "Wire stage records into chunk/summarize/embed/index handlers"
# then, after both:
Task T012: "Unit-test the API aggregation helpers"
Task T013: "Unit-test the stage-record helpers + resume reset"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (CRITICAL) → 3. Phase 3 US1 → **STOP & VALIDATE**
   against quickstart Scenario 1 + the baseline screenshots → demo. This alone resolves the core
   complaint ("não está bom o acompanhamento") and the frozen-download gap.

### Incremental delivery

1. Foundation ready → 2. US1 (legible progress, MVP) → 3. US2 (failure & recovery) → 4. US3
   (sub-progress + ETA) → 5. Polish (queued/stall/a11y/ADR/validation). Each increment is shippable
   and does not break the previous.

---

## Notes

- `[P]` = different files, no incomplete dependency. Tasks on the same file (e.g. T021/T028/T030
  on `BookCard.tsx`; T020/T035/T037 on `StageStepper.tsx`) are sequential.
- Persistence stays single-Postgres (one `jsonb` column); no second datastore, no new endpoints,
  no new problem slugs (Constitution III/IV preserved).
- The resume-from-failed-stage guarantee is preserved and made auditable — never weakened.
- Commit after each task or logical group; keep each commit lint/typecheck/test green.
