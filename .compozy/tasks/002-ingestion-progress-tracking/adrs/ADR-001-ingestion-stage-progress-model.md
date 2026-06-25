# ADR-001: Per-stage ingestion progress as a `jsonb` column

**Status**: Accepted · **Date**: 2026-06-23 · **Feature**: 002-ingestion-progress-tracking

## Context

The ingestion pipeline (`download → clean → parse → chunk → summarize → embed →
index`) needed richer observability: per-stage state, sub-progress units, cached
markers, per-stage timing, queued-vs-running, and an auditable resume. The
denormalized `books.ingestion_*` snapshot columns (status, progress, last_stage,
error) could not represent any of that.

Two persistence shapes were considered:

1. **A new `book_ingestion_stages` table** — one row per (book, stage).
2. **A typed `jsonb` column** on the existing `books` row — an ordered array of
   per-stage records.

## Decision

Adopt option 2: `books.ingestion_stages jsonb NOT NULL DEFAULT '[]'`, typed as
`IngestionStageProgress[]` (the same shape surfaced in the status DTO). The
worker writes records via read-modify-write helpers in
`packages/ingestion/.../stages/_common.ts`; the API derives `overall_progress`,
`stage_index`, `elapsed_ms`, `eta_ms`, `queued`, and `stalled` from it; the web
renders a `StageStepper`.

## Rationale

- **Single datastore (constitution)** — no second table/join; honors the spec's
  "extends the same persisted model rather than introducing a separate store."
- **Sequential pipeline** — exactly one stage runs per book at a time, so the
  read-modify-write of one row's jsonb never races.
- **Auditable resume** — `resetStagesFrom(stage)` re-pends the resumed-and-later
  records while preserving earlier `done`/`skipped` ones; the existing
  resume-from-failed-stage guarantee is made visible, not changed.
- **Cheap list path** — the library list reads only the snapshot columns (no
  jsonb parse); only the per-book status endpoint reads the array.
- **Graceful degradation** — rows ingested before this feature have `[]`; the API
  reconstructs an ordered breakdown from `status` + the static stage order
  (FR-013), so legacy books still render a sensible stepper.

## Consequences

- Each progress tick rewrites the (small, ≤ 7-element) array; acceptable at
  single-user/shared scale and throttled for the download heartbeat.
- No SQL-level query over per-stage history (e.g. "all books that failed at
  embed") — not a requirement; the snapshot `ingestion_status` covers list
  filtering.
- Overall progress is computed (equal-weighted stages + intra-stage fraction),
  not stored; a separate best-effort ETA covers the "download dominates" case.

## Alternatives rejected

- **Separate table**: more queryable history and trivially indexable, but adds a
  table + join for data only ever read per-book in fixed order, and reads as a
  second store against the spec assumption. Rejected as unnecessary complexity.
- **Derive everything from status alone**: free for "stage N of 7" and
  done/pending, but cannot represent cached/skipped, queued-vs-running, per-stage
  timing, sub-progress units, or attempt counts across a refresh.
