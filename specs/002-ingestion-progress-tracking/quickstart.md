# Quickstart — Validating Ingestion Progress Tracking

Runnable scenarios that prove the feature end to end. These mirror the method used for the
[baseline audit](./baseline/baseline-audit.md) (which captured the *before* picture); after
implementation they should show the *after*.

## Prerequisites

- Postgres 18 + pgvector up: `docker compose up -d` (already healthy in dev).
- Migrations applied (includes `0011_ingestion_stage_progress`): `pnpm db:migrate`.
- A signed-in account (invite-only): `pnpm --filter @dialogus/api seed:owner -- --email
  you@example.com --password 'StrongPass123!'`.
- **Deterministic local modes** so the lifecycle runs without external-API nondeterminism:
  launch with `EMBEDDING_PROVIDER=mock SUMMARY_GENERATOR=mock` (shell env overrides `.env`).
- Stack: `pnpm dev` (web :3000, api :3001, worker, mastra). Sign in at `/sign-in`.

> Note from the baseline: the public Gutenberg mirror is slow/flaky from some environments, so
> the `download` stage dominates wall-clock. That is exactly the case this feature must make
> legible (visible bytes/attempts/heartbeat, never a frozen 0%).

## Scenario 1 — End-to-end progress is legible (P1 / FR-001,002,003,005)

1. `/library` → "Adicionar do Gutendex" → add a medium book (e.g. Frankenstein).
2. **Expect** the card to show a `StageStepper`: seven ordered stages, the current one active,
   earlier ones `done`/`cacheado`, "etapa N de 7 · P%", and an overall bar.
3. **Expect** the overall bar and stage states to advance on their own at the 2s cadence (no
   manual refresh), and **download to show bytes/attempt or a heartbeat — never a static 0% for
   more than a few seconds** (SC-002).
4. **Expect** instant/cached stages to be marked "cacheado," not to flicker/skip.
5. On completion: terminal toast + "Pronto"; "Detalhes" shows ingestion timing.

**Automated**: Playwright drives steps 1–5; asserts `data-slot` hooks for stepper, per-stage
state, overall %, and that the displayed progress value changes within a polling window.

## Scenario 2 — Failure is understandable and recoverable (P2 / FR-008,009,010,011)

1. Force a retryable failure at a known stage (integration: stub the embedding provider to throw;
   manual: temporarily set `ingestion_status='failed', ingestion_last_stage='embed',
   ingestion_error='ingestion-embed-failed: …'` as in the baseline).
2. **Expect** "Falhou" + a **friendly, localized** reason naming the stage ("Falha ao gerar os
   embeddings (etapa 6 de 7)…") — **no raw `ingestion-embed-failed:` slug anywhere** (regression).
3. **Expect** the retry button only for retryable stages; the confirm dialog states it **resumes
   from <stage>** and preserves completed work (regression for the "restart?" ambiguity).
4. Confirm retry → card re-enters the stepper at the resumed stage; **earlier `done` stages are
   not re-run** (verify via stage records / timings).
5. Non-retryable failure (e.g. `parse`): no primary retry; reason + guidance shown.

**Automated**: Playwright asserts (2)(3)(5); Testcontainers integration asserts (4) by checking
`ingestion_stages` after resume — only the failed-and-after stages get fresh `started_at`.

## Scenario 3 — Long stages show real sub-progress (P3 / FR-004,007)

1. Ingest a book large enough that `summarize`/`embed` run for more than a few seconds.
2. **Expect** the batch stage to show units ("12/87 capítulos", "256/412 trechos") that increase
   over time, plus elapsed and (when estimable) ETA.

**Automated**: integration drives a multi-chapter book with mock providers; asserts the stage
record's `units_done` strictly increases and the status payload reflects it within a poll.

## Scenario 4 — Queued vs running, and stall signal (FR-006, FR-016)

1. Saturate the worker (`INGESTION_USER_CONCURRENCY_LIMIT` / multiple adds) so a new ingest sits
   before pickup. **Expect** "na fila / aguardando" — distinct from "processando", not a frozen 0%.
2. Simulate a wedge (integration: stop ticking past the stall threshold). **Expect** a muted
   "sem progresso há Xs" hint after `INGESTION_STALL_THRESHOLD_MS`, not a silent frozen bar.

## Scenario 5 — Refresh & cross-surface consistency (FR-013, FR-014)

1. Mid-ingestion, hard-refresh `/library`. **Expect** the stepper reconstructs the exact current
   stage/sub-progress from persisted `ingestion_stages` (no loss).
2. **Expect** the library list card and the book card never show contradictory states.

## Scenario 6 — Access control preserved (FR-015 / SC-002)

- As a non-member, `GET /api/library/books/:id/ingestion` returns `404` (no status leak).
  **Automated**: existing membership integration test extended to assert the enriched payload is
  still gated.

## Quality gates (must pass before merge)

- `pnpm lint && pnpm typecheck && pnpm test` (pre-commit) green.
- Testcontainers integration (api/worker) green, incl. resume-preserves-prior-stages.
- Playwright E2E for Scenarios 1–3,5 green; `@axe-core/playwright` **zero violations** and
  Lighthouse a11y ≥ 0.9 on `/library`; keyboard nav through the stepper works.
