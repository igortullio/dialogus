# Contract — Ingestion Status (enriched)

## `GET /api/library/books/:id/ingestion`

Unchanged: auth-session gated, **membership-gated** (non-member ⇒ `404` not-found, preserving
SC-002), `200` with `envelope(ingestionStatusDtoSchema.parse(result))`. Polled by the book card
at the 2s cadence while in progress (Constitution IV — no tighter).

### Enriched `IngestionStatusDto` (additive)

Existing fields (`book_id`, `status`, `stage`, `progress`, `started_at`, `indexed_at`,
`last_stage`, `error`) are retained. `progress` remains the **current-stage** percent.

```jsonc
{
  "book_id": "uuid",
  "status": "embedding",            // unchanged enum
  "stage": "embed",                 // current stage (or failing stage when status=failed)
  "progress": 62,                   // current-stage percent (unchanged)

  // --- added: whole-pipeline framing ---
  "overall_progress": 80,           // 0..100 across all 7 stages (research D2)
  "stage_index": 5,                 // 0-based index of current stage in the static order
  "total_stages": 7,
  "stages": [                       // ordered breakdown (from books.ingestion_stages)
    { "stage": "download",  "state": "done",    "units_done": 448885, "units_total": 448885,
      "unit": "bytes",    "started_at": "…", "ended_at": "…", "attempt": 3, "cached": false },
    { "stage": "clean",     "state": "skipped", "units_done": null, "units_total": null,
      "unit": null,       "started_at": "…", "ended_at": "…", "attempt": 1, "cached": true },
    { "stage": "parse",     "state": "done",    "…": "…" },
    { "stage": "chunk",     "state": "done",    "units_done": 412, "units_total": 412, "unit": "chunks", "…": "…" },
    { "stage": "summarize", "state": "done",    "units_done": 87,  "units_total": 87,  "unit": "chapters", "…": "…" },
    { "stage": "embed",     "state": "running", "units_done": 256, "units_total": 412, "unit": "chunks",
      "started_at": "…", "ended_at": null, "attempt": 1, "cached": false },
    { "stage": "index",     "state": "pending", "units_done": null, "units_total": null,
      "unit": null, "started_at": null, "ended_at": null, "attempt": 1, "cached": false }
  ],

  // --- added: timing & health ---
  "elapsed_ms": 41000,              // now - started_at
  "eta_ms": 9000,                   // best-effort; null when not reliably estimable (research D7)
  "queued": false,                  // current stage record is 'queued' (worker not yet started) — research D5
  "stalled": false,                 // non-terminal AND now-updated_at > threshold — research D6

  // --- error gains the failing stage ---
  "started_at": "…",
  "indexed_at": null,
  "last_stage": "embed",
  "error": null                     // when failed: { slug, message, retryable, stage }
}
```

Failure example (`status: "failed"`):

```jsonc
"error": {
  "slug": "ingestion-embed-failed",
  "message": "Embedding request failed after 3 attempt(s)",   // technical; NOT shown raw to users
  "retryable": true,                                          // download | embed | summarize
  "stage": "embed"                                            // added: failing stage
}
```

### Rules

- `stages[]` is always length `total_stages` (7), in canonical order; rows ingested **before**
  this feature (empty `ingestion_stages`) are reconstructed from `status` + static order with
  `units_*`/timing as `null` (graceful degradation — FR-013).
- `overall_progress`, `stage_index`, `elapsed_ms`, `eta_ms`, `queued`, `stalled` are **derived**
  (not stored); see [../data-model.md](../data-model.md).
- `eta_ms` and per-stage `units_total` MAY be `null`; consumers MUST treat `null` as "unknown,"
  not zero.

## Library list DTO (`GET /api/library/books`)

`toBookDto` adds `ingestion_overall_progress` (0..100, computed cheaply from snapshot columns) so
cards render an overall bar without fetching the heavy per-book payload. `ingestion_status` and
`ingestion_error` remain, **but the web app MUST stop rendering `ingestion_error` raw** (see
[README.md](./README.md)). Cursor pagination + envelope unchanged.
