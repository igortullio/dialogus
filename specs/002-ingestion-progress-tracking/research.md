# Phase 0 Research — Ingestion Progress Tracking & Observability

All decisions are grounded in the current code (read during planning) and the live baseline
audit ([baseline/baseline-audit.md](./baseline/baseline-audit.md)). There were no blocking
`NEEDS CLARIFICATION` markers in the spec; the open design questions are resolved below with
project-appropriate defaults from the constitution.

---

## D1 — Where to persist per-stage observability

**Decision**: Add one typed `ingestion_stages jsonb` column to the existing `books` table,
holding an ordered array of per-stage records (`{stage, state, units_done, units_total, unit,
started_at, ended_at, attempt, cached}`). Keep the existing denormalized columns
(`ingestion_status`, `ingestion_progress`, `ingestion_last_stage`, `ingestion_started_at`,
`indexed_at`, `updated_at`) as the cheap "current" snapshot for the library list.

**Rationale**:
- Honors the spec assumption "new sub-progress … extends this same persisted model rather than
  introducing a separate store," and the constitution's single-Postgres / justify-a-second-store
  bias.
- Stages run **strictly sequentially per book** (each handler enqueues the next via
  `pgboss.send`), so there is never a concurrent write to one book's `ingestion_stages` — the
  jsonb is safe to read-modify-write inside the stage transaction.
- Resume stays trivial: retry from stage `X` resets the records for `X` and everything after it;
  earlier `done`/`skipped` records are preserved, which is exactly the auditable resume the
  constitution wants.
- The list query never needs the jsonb (it reads the snapshot columns), so the common path adds
  zero cost; only the per-book status endpoint parses the array.

**Alternatives considered**:
- *Separate `book_ingestion_stages` table (one row per book×stage)*: more queryable history and
  trivially indexable, but introduces a join + table for data that is only ever read per-book in
  fixed order, and reads as a "second store" against the spec assumption. Rejected as
  unnecessary complexity for a per-book sequential pipeline.
- *Cram nothing new; derive everything from `status` + static order*: gets "stage N of 7" and
  done/pending for free, but cannot represent cached/skipped, queued-vs-running, per-stage
  timing, sub-progress units, or attempt counts across a refresh. Insufficient for FR-004/005/
  006/007.

---

## D2 — Computing overall pipeline progress

**Decision**: `overall_progress = round(((stageIndex + currentStageFraction) / 7) * 100)`, where
`stageIndex` is the position of the current stage in the static order
`download→clean→parse→chunk→summarize→embed→index` and `currentStageFraction =
ingestion_progress / 100`. `ready` ⇒ 100; `failed` ⇒ frozen at the failed stage's fraction;
`discovered` ⇒ 0. Computed by a pure helper in `apps/api` for the status endpoint. The library
list computes the same number cheaply from the snapshot columns (no jsonb) so cards can show an
overall bar without the heavy payload. A denormalized `ingestion_overall_progress smallint`
column is **optional** (adopt only if profiling shows the list-side recompute matters); default
is to compute on read.

**Rationale**: deterministic, needs no extra storage, and anchors the single on-screen number to
the whole job ("etapa 4 de 7 · 52%") — directly fixing baseline gap #2/#3.

**Alternatives considered**: weighting stages by historical duration (download dominates) — more
"accurate" but non-deterministic, surprising, and harder to test; rejected in favor of equal
weighting plus a separate best-effort ETA (D7).

---

## D3 — Killing the "Baixando 0%" freeze (download visibility)

**Decision**: The `download` stage streams to disk; emit progress from `bytesWritten /
Content-Length` when the header is present, writing `units_done`/`units_total` (`unit: 'bytes'`)
and ticking `ingestion_progress`, throttled to ~1 update/second. When `Content-Length` is
unknown, keep state `running` with `units_total: null` (indeterminate) but still **heartbeat**
`updated_at`/`units_done` every `INGESTION_DOWNLOAD_HEARTBEAT_MS` so the UI shows movement and
stall-detection (D6) does not false-fire. Record `attempt` (1..N) on each retry so the UI can
show "tentativa 2 de 3".

**Rationale**: download was ~88 of ~99s pinned at 0% while silently retrying 3× — the single
worst gap. Byte-progress + attempt + heartbeat turns it into visible, honest movement (SC-002).

**Alternatives considered**: faking a time-based fake percentage — rejected (dishonest, and the
constitution values trustworthy UI). Indeterminate spinner with elapsed time is the fallback
when Content-Length is genuinely absent.

---

## D4 — Marking cached / skipped (instant) stages

**Decision**: When a stage detects a cache hit (raw file already on disk for `download`, clean
file for `clean`, chapters already parsed for `parse`, chunks already present for `chunk`,
summaries/embeddings already complete), it records `state: 'skipped', cached: true` with
`started_at ≈ ended_at` and units fast-forwarded, then hands off to the next stage as usual.

**Rationale**: FR-005 / SC-006 — instant transitions currently read as glitches; an explicit
"cacheado" marker makes them legible and explains why a stage took ~0s.

**Alternatives considered**: inferring "cached" from a near-zero duration at read time — fragile
(a genuinely fast stage looks cached) and not preserved across refresh; rejected.

---

## D5 — Distinguishing "queued / waiting" from "processing"

**Decision**: At enqueue time (the API for the first stage / retry, or the previous handler's
`pgboss.send` for a hand-off) write the **target** stage record as `state: 'queued'` with
`started_at: null`. The handler flips it to `state: 'running'`, `started_at: now()` at the top of
the stage. The window between is "na fila / aguardando worker." The API exposes a top-level
`queued: boolean` (true when the current stage record is `queued`).

**Rationale**: FR-006 — separates "the worker hasn't picked this up yet" (e.g. worker busy/down)
from "actively working," without reaching into pg-boss internals.

**Alternatives considered**: querying pg-boss job state (`created` vs `active`) — couples the API
to queue internals and the `pgboss` schema; rejected in favor of stage records the pipeline
already owns.

---

## D6 — Stall detection

**Decision**: Derive `stalled` at read time in the API: `status` is non-terminal **and**
`now - updated_at > INGESTION_STALL_THRESHOLD_MS` (config; default ~60s, since the slow Gutenberg
mirror makes long-but-alive downloads normal). Because every progress tick and the download
heartbeat (D3) bump `updated_at`, a healthy run never trips it; a wedged worker does. The UI
shows a muted "sem progresso há Xs" hint rather than declaring failure.

**Rationale**: FR-016 — reuses the existing `updated_at` column (no new writes) to replace the
"indefinitely frozen bar" with an honest signal.

**Alternatives considered**: a dedicated watchdog job — over-engineered for a single-user-scale
deployment; rejected. Threshold is env-tunable to avoid false positives on slow upstreams.

---

## D7 — Elapsed time and ETA

**Decision**: `elapsed_ms` = `now - ingestion_started_at` (overall) and per-stage from each
record's `started_at`. ETA is **best-effort**: current-stage ETA = `stageElapsed / fraction *
(1 - fraction)` when `fraction ∈ (0,1)`; `eta_ms` is omitted (`null`) when no reliable fraction
exists (indeterminate download, sub-second stages). The UI shows ETA only when present.

**Rationale**: FR-007 explicitly hedges "where a reliable estimate is possible." Linear
extrapolation within a stage is cheap, transparent, and good enough; over-promising a precise
ETA would erode trust.

**Alternatives considered**: cross-book historical averages per stage — more sophisticated but
needs a history store and cold-start handling; deferred (not needed for the spec's success
criteria).

---

## D8 — Human-readable, localized failure messages (stop leaking the slug)

**Decision**: The API keeps returning a structured `error {slug, message, retryable}` and adds
the failing `stage`. The **web** owns presentation: a `slug → {pt, en}` friendly-message map plus
stage display names, so the UI renders e.g. "Falha ao gerar embeddings (etapa 6 de 7). Tente
novamente." and **never** renders the raw `<slug>: <message>`. Concretely, fix `BookCard`'s
fallback that currently shows the raw `book.ingestion_error` field when the live poll is disabled
on a terminal state (the confirmed source of the leak in the baseline).

**Rationale**: FR-008 + baseline gaps #5/#6. Localization is a web concern (Constitution III:
respond in the user's language); the API stays slug-based and stable. The original technical
`message` remains available for a "detalhes técnicos" disclosure but is not the default.

**Alternatives considered**: localizing on the server via `Accept-Language` — spreads i18n across
the stack and complicates the API contract; rejected.

---

## D9 — Retry: resume-not-restart wording and retryable-only affordance

**Decision**: `retryIngestBook` already resumes from `ingestion_last_stage` — keep it. Surface
that truth: the retry confirm dialog names the resume stage and states completed stages are
preserved ("Retoma da etapa <X>; as etapas concluídas não são refeitas."). The retry **button**
is offered **only** when `error.retryable` is true (download/embed/summarize per the existing
`RETRYABLE_SLUGS`), per FR-009 ("MUST NOT offer retry for non-recoverable failures"). For
non-retryable failures the UI shows the friendly reason + a "não é recuperável automaticamente"
note and **no** retry affordance.

> Revision: an earlier draft offered a de-emphasized "tentar mesmo assim" for non-retryable
> failures (server resume is idempotent). It was removed to comply with FR-009 after the
> `/speckit-analyze` cross-check (finding F7).

**Rationale**: FR-009/010/011 + baseline gaps #7/#8. The guarantee exists; the work is to
communicate it and gate the primary affordance on recoverability.

**Alternatives considered**: removing retry entirely for non-retryable stages — loses a safe,
idempotent recovery path that helps after a fix lands; rejected in favor of demotion.

---

## D10 — Transport & cadence

**Decision**: Keep polling. The book card polls the per-book status endpoint at 2s while
in-progress; the library list polls at 4s (30s idle). Enrich the payloads rather than change the
transport. The status endpoint returns the full stepper; the list endpoint returns
`overall_progress` + `status` for cheap card rendering.

**Rationale**: Constitution IV mandates in-flight ingestion polling stay at the 2s cadence — no
tighter — and the spec explicitly excludes a new real-time transport. Payloads are tiny (seven
records), so polling is sufficient.

**Alternatives considered**: SSE/WebSocket streaming of progress — real-time but adds transport,
auth, and reconnection complexity against an explicit constraint; rejected.

---

## D11 — Stepper UI shape & accessibility

**Decision**: A `StageStepper` renders the seven stages as an ordered `role="list"`, each item
exposing its state via icon + text + `aria` (done ✓, running spinner, pending ○, failed ⚠,
skipped/cached ⤼), with the current stage emphasized, sub-progress ("12/87 capítulos") for batch
stages, an overall bar with "etapa N de 7 · P%", elapsed and (when present) ETA. The compact
`StatusBadge` stays for dense contexts and gains queued/stalled/cached states. Built from
shadcn/Tailwind `--status-*` tokens; keyboard-navigable; `/library` holds Lighthouse a11y ≥ 0.9
and zero axe violations.

**Rationale**: FR-001/002/004 — makes the pipeline legible at a glance while meeting the
constitution's a11y baseline. The existing `data-slot` test hooks pattern is extended for E2E.

**Alternatives considered**: a single richer progress bar with a tooltip — lower information
density and poor a11y/keyboard story; rejected for the stepper.

---

## D12 — Testing strategy (layered)

**Decision**:
- **Vitest unit**: `computeOverallProgress`, `estimateEta`, `deriveStalled`, the stage-record
  reducer (queued→running→done/failed/skipped, resume reset), the `slug→message`/stage-name map,
  and jsonb (de)serialization.
- **Testcontainers integration** (real Postgres/pgvector/pg-boss): the real chain writes correct
  stage records end to end; **resume from a forced failure re-runs only the failed-and-after
  stages** (prior `done` records preserved); cached-stage marking on a second ingest; download
  byte-progress ticks; membership gating still returns not-found for non-members (SC-002).
- **Playwright + axe E2E**: in-progress stepper visible with advancing sub-progress; failure
  names the stage + friendly reason + resume wording; retryable-only retry; cached marker shown;
  **no raw slug anywhere**; page-refresh reconstructs progress; zero axe violations + keyboard
  nav on `/library`.

**Rationale**: Constitution II — lowest sufficient layer, real infra for DB/queue guarantees, and
the two headline regressions (raw-slug leak, resume ambiguity) each get a dedicated test.

**Deterministic doubles**: `EMBEDDING_PROVIDER=mock`, `SUMMARY_GENERATOR=mock` for E2E so the
lifecycle runs without external-API nondeterminism (as used in the baseline audit). The slow
real download is out of scope for CI; integration tests stub the downloader to exercise
byte-progress and cache-hit paths deterministically.
