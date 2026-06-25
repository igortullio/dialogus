# Phase 1 Data Model — Ingestion Progress Tracking

Additive only. One new `jsonb` column on the existing `books` table; no new tables, no second
datastore. Authored as Drizzle migration `0011_ingestion_stage_progress` and applied with
`pnpm db:migrate`.

## Entities

### `IngestionStageProgress` (per-stage record — element of `books.ingestion_stages`)

One record per known stage in the static order
`download → clean → parse → chunk → summarize → embed → index`.

| Field | Type | Notes |
|---|---|---|
| `stage` | `IngestionStage` | one of the seven stage slugs |
| `state` | `IngestionStageState` | `pending` \| `queued` \| `running` \| `done` \| `failed` \| `skipped` |
| `units_done` | `int \| null` | work units completed (bytes / chapters / chunks); `null` when N/A |
| `units_total` | `int \| null` | total units; `null` when indeterminate (e.g. no `Content-Length`) |
| `unit` | `'bytes' \| 'chapters' \| 'chunks' \| null` | label for `units_*`; drives UI copy |
| `started_at` | `ISO datetime \| null` | set when the stage flips to `running` |
| `ended_at` | `ISO datetime \| null` | set on `done` / `failed` / `skipped` |
| `attempt` | `int` | ≥ 1; increments on each retry of this stage (download retries) |
| `cached` | `boolean` | `true` when `skipped` due to a cache hit |

Validation:
- `state` ∈ the 6-value enum; `stage` ∈ the 7 stage slugs.
- `units_done ≤ units_total` when both are non-null; both `≥ 0`.
- `started_at ≤ ended_at` when both present.
- `cached === true` ⇒ `state === 'skipped'`.
- At most one record may be `running` at a time (sequential pipeline invariant).

### State machine (per stage record)

```
pending ──enqueue──▶ queued ──handler start──▶ running ──┬─ done    (success → enqueue next)
                                                          ├─ failed  (status→failed; resume target)
                                                          └─ skipped (cache hit; cached=true → enqueue next)
        (cache hit may go queued ──▶ skipped directly without a long running phase)
```

On **retry from stage X** (`retryIngestBook`): records for `X` and every later stage are reset to
`pending`/`queued`; records for stages before `X` keep their `done`/`skipped` state and timings.
This is the auditable form of the existing resume-from-failed-stage guarantee.

## `books` table changes (migration `0011_ingestion_stage_progress`)

Add to `packages/db/src/schema/books.ts`:

```ts
ingestionStages: jsonb('ingestion_stages')
  .$type<IngestionStageProgress[]>()
  .notNull()
  .default(sql`'[]'::jsonb`),
// NOT adopted: overall progress is computed in the DTO/list (research D2); no
// denormalized `ingestion_overall_progress` column was added.
```

- Existing columns are unchanged in meaning: `ingestion_status`, `ingestion_progress`
  (**current-stage** percent, kept for back-compat + cheap list), `ingestion_last_stage`,
  `ingestion_error` (`"<slug>: <message>"`), `ingestion_started_at`, `indexed_at`, `updated_at`
  (bumped on every state write → used for stall detection).
- Migration backfills `[]` for existing rows (default). No data migration of historical runs is
  needed; the snapshot columns already carry their terminal state, and the stepper degrades
  gracefully to "derive from status + order" when `ingestion_stages` is empty (important for
  rows ingested before this feature, e.g. the existing Frankenstein/Monte Cristo rows).
- Constraint check `books_ingestion_progress_check` (0–100) and the status enum check are
  retained. No new DB-level check on the jsonb (validated in app layer via Zod).

## Shared schema additions (`packages/shared/src/schemas/ingestion.ts`)

```ts
export const ingestionStageStateEnum = z.enum([
  'pending', 'queued', 'running', 'done', 'failed', 'skipped',
])

export const ingestionStageProgressSchema = z.object({
  stage: ingestionStageEnum,
  state: ingestionStageStateEnum,
  units_done: z.number().int().nonnegative().nullable(),
  units_total: z.number().int().nonnegative().nullable(),
  unit: z.enum(['bytes', 'chapters', 'chunks']).nullable(),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  ended_at: z.iso.datetime({ offset: true }).nullable(),
  attempt: z.number().int().positive(),
  cached: z.boolean(),
})
```

`ingestionStatusDtoSchema` is **extended** (see [contracts/ingestion-status.md](./contracts/ingestion-status.md))
with `overall_progress`, `stage_index`, `total_stages`, `stages[]`, `elapsed_ms`, `eta_ms`,
`queued`, `stalled`, and the `error` object gains a `stage` field. All additive and nullable
where appropriate so existing consumers keep working.

## Derived (computed, not stored)

| Derived value | Source |
|---|---|
| `overall_progress` | `((stageIndex + ingestion_progress/100) / 7) * 100`, rounded (research D2) |
| `stage_index` / `total_stages` | index of current stage in the static order / `7` |
| `elapsed_ms` | `now - ingestion_started_at`; per-stage from record `started_at` |
| `eta_ms` | best-effort linear extrapolation of the current stage (research D7); else `null` |
| `queued` | current stage record `state === 'queued'` (research D5) |
| `stalled` | non-terminal **and** `now - updated_at > INGESTION_STALL_THRESHOLD_MS` (research D6) |
| failing `stage` (error) | `ingestion_last_stage` when `status === 'failed'` |

## Configuration (`@dialogus/shared` Zod env schema)

| Var | Default | Purpose |
|---|---|---|
| `INGESTION_STALL_THRESHOLD_MS` | `60000` | non-terminal idle window before `stalled` is surfaced |
| `INGESTION_DOWNLOAD_HEARTBEAT_MS` | `1000` | min interval between download progress/heartbeat writes |

## Units per stage (for `units_total` / `unit`)

| Stage | unit | total source |
|---|---|---|
| download | `bytes` | `Content-Length` (or `null` indeterminate) |
| clean | `null` | single file op (no unit count) |
| parse | `null` | single pass (chapters become known *after*) |
| chunk | `chunks` (optional) | chunks produced (or `null`) |
| summarize | `chapters` | `chapterRepo.countByBookId` (already computed) |
| embed | `chunks` | `chunkRepo.countByBookIdWithoutEmbedding` (already computed; batch of 100) |
| index | `null` | `VACUUM ANALYZE` (single op) |
