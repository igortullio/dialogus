# Mastra cURL smoke scripts

Five bash scripts that drive `apps/mastra` end-to-end against a running local
stack. Together they verify the full path Feature 003 ships: catalog →
ingestion → semantic retrieval → grounded agent answer with `{{cite:<chunk_id>}}`
markers (ADR-007), spoiler-cap honour, and the empty-retrieval refusal +
reformulation contract (ADR-003). They double as portfolio-grade demo material;
the sequence below is the one referenced from `apps/mastra/README.md`.

The scripts are **manual smoke**, not unit/integration tests. The CI integration
job (Feature 003 task_09 / task_10) is the automated guard; these scripts
exercise the live HTTP surface in a way containerised tests can't.

## Prerequisites

- `apps/api` (port 3001), `apps/mastra` (port 3002), `apps/worker`, and the
  `pgvector/pgvector:pg18` Docker container running. From the repo root:
  ```sh
  docker compose up -d && pnpm db:migrate && pnpm dev
  ```
- `bash`, `curl`, `jq` on `PATH`. Install `jq` with `brew install jq` (macOS) or
  `apt install jq` (Debian/Ubuntu).
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` exported in the shell that runs
  `pnpm dev` (real keys, not the CI fixtures).
- `~10 minutes` of patience on the first run while ingestion downloads, parses,
  chunks, summarizes, and embeds the three reference books.

## Execution order

Run the scripts strictly in numeric order from this directory:

```sh
cd apps/mastra/src/scripts/curl
./01-add-books.sh       # adds Moby Dick, Dom Casmurro, Crime and Punishment; waits for `ready`
./02-create-thread.sh   # creates a Mastra thread scoped to Moby Dick; saves thread_id to ./tmp
./03-ask-question.sh    # asks a grounded question; verifies citation marker + chunk resolution
./04-spoiler-cap.sh     # spoiler cap @ chapter 10; refusal OR markers with ordinal ≤ 10
./05-empty-retrieval.sh # off-topic question on Dom Casmurro; refusal + ≥2 reformulation hints
```

Each script exits `0` on success and non-zero with a descriptive `ERROR:` line
on failure. Captured payloads, SSE responses, and ids land in `./tmp/`
(gitignored).

## Per-script contract

| # | Script | What it does | Pass criteria |
|---|---|---|---|
| 1 | `01-add-books.sh` | `POST /api/library/books` for each of 3 reference books, then `POST /api/library/books/:id/ingest`, then polls `/ingestion` until `ready`. | All 3 books reach `status='ready'` within `INGESTION_TIMEOUT_SECONDS` (default 600). Writes `./tmp/book_ids.env`. |
| 2 | `02-create-thread.sh` | `POST /api/memory/threads` with `resourceId=dialogus-owner`, `metadata.book_ids=[<moby_dick_id>]`. | Response carries a `thread.id` (or top-level `id`) UUID. Saved to `./tmp/thread_id`. |
| 3 | `03-ask-question.sh` | Streams `POST /api/agents/dialogusAgent/stream` with the message *"Where does Ishmael first meet Queequeg?"*. Captures SSE to `./tmp/03-ask-question.sse.txt`. | Response contains ≥1 `{{cite:<uuid>}}` marker; the first chunk_id resolves to a 200 from `GET /api/library/chunks/:id` (ADR-007 contract). |
| 4 | `04-spoiler-cap.sh` | New thread on Moby Dick with `metadata.spoiler_caps={<id>:10}`; asks *"how does Ahab die?"* with the same cap repeated in the user message and `requestContext`. | Either zero markers (refusal) **or** every marker resolves to a chunk with `chapter_ordinal ≤ 10`. |
| 5 | `05-empty-retrieval.sh` | New thread on Dom Casmurro; asks *"Qual o papel dos gnomos em Dom Casmurro?"*. | Zero `{{cite:<uuid>}}` markers **and** ≥2 lines starting with `- ` or `* ` (ADR-003 reformulation hints). |

## Environment knobs

All knobs have defaults aligned to a vanilla `pnpm dev` boot. Override them by
exporting before invoking the script.

| Variable | Default | Notes |
|---|---|---|
| `API_BASE_URL` | `http://localhost:3001` | Where `apps/api` listens. |
| `MASTRA_BASE_URL` | `http://localhost:3002` | Where `apps/mastra` listens. |
| `RESOURCE_ID` | `dialogus-owner` | Mastra `resourceId` used for every thread. |
| `GUTENDEX_ID_MOBY_DICK` | `2701` | Project Gutenberg id for Melville's *Moby Dick* (English). |
| `GUTENDEX_ID_DOM_CASMURRO` | `55752` | PT edition of Machado's *Dom Casmurro*. |
| `GUTENDEX_ID_CRIME_AND_PUNISHMENT` | `2554` | Constance Garnett translation, English. |
| `BOOK_TITLE_MOBY_DICK` | `Moby Dick` | Substring used to resolve the book id by title via `/api/library/books?limit=50`. |
| `BOOK_TITLE_DOM_CASMURRO` | `Dom Casmurro` | Same. |
| `BOOK_TITLE_CRIME_AND_PUNISHMENT` | `Crime and Punishment` | Same. |
| `INGESTION_TIMEOUT_SECONDS` | `600` | Max wait per book in `01-add-books.sh`. |
| `INGESTION_POLL_INTERVAL_SECONDS` | `5` | Poll cadence for `/ingestion`. |
| `SPOILER_CAP_ORDINAL` | `10` | Cap applied in `04-spoiler-cap.sh`. |

Book ids are **never hardcoded**; scripts 02–05 resolve them by title substring
via `GET /api/library/books?limit=50` so re-running script 01 against a
freshly migrated database keeps everything wired up automatically.

## Failure diagnosis

When a script fails, work outward from the captured artefacts under `./tmp/`:

- **`01-add-books.sh` exits non-zero**: hit `GET /api/library/books/<id>/ingestion`
  manually and read `data.status` + `data.error`. Common causes: Gutendex
  upstream 5xx (retry), `ANTHROPIC_API_KEY` missing in the worker env (summarize
  stage fails), `OPENAI_API_KEY` missing (embed stage fails). Pre-existing book
  in `discovered`/`failed` state? `POST /api/library/books/:id/ingest/retry`.
- **`02-create-thread.sh` exits non-zero**: confirm `apps/mastra` is up (`curl
  http://localhost:3002/api/memory/threads -X POST -H 'content-type: application/json' -d '{"resourceId":"x"}'`
  should return 200). If `@mastra/pg` failed to provision its tables, the
  Mastra logs in `pnpm dev` will show the migration error.
- **`03-ask-question.sh` exits non-zero**: open Mastra Studio at
  `http://localhost:4111` and select the most recent thread. Inspect the
  `semantic_search` tool call:
  - Empty `chunks[]` → ingestion didn't run (loop back to 01) or the query is
    genuinely off-topic for the book (unexpected for Ishmael/Queequeg).
  - `chunks[]` populated but no marker emitted → prompt drift; review
    `packages/rag/src/prompts/system.md`.
  - Marker emitted but unknown chunk_id → the agent fabricated an id (high-
    severity prompt regression; capture the SSE file and file an issue).
- **`04-spoiler-cap.sh` reports a violation**: the agent ignored the cap. Check
  Studio for the `semantic_search` invocation — the `spoiler_caps` arg should
  match the `requestContext`. If it's missing, the system prompt's § 6 needs
  reinforcement (ADR-003 / ADR-007 boundary).
- **`05-empty-retrieval.sh` reports unexpected citations**: the agent answered
  a no-evidence question. Inspect Studio: was retrieval truly empty? If yes,
  the prompt's refusal contract regressed; if no, retrieval surfaced a
  spurious match and tightening the score floor (Phase 2) becomes relevant.

## Why this lives under `apps/mastra`

The scripts are demo-grade material the README points at, and they exercise
`apps/mastra` specifically. Keeping them inside the app's source tree (under
`src/scripts/curl/` per TechSpec § Build Order step 9) keeps them discoverable
alongside the runtime they probe; the `.gitignore` here ensures the captured
state never lands in commits.
