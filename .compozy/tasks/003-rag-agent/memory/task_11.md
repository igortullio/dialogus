# Task Memory: task_11.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Ship 5 cURL smoke scripts under `apps/mastra/src/scripts/curl/` covering catalog → ingestion → grounded agent → spoiler cap → empty retrieval, plus per-feature READMEs.
- Extend `apps/mastra/README.md` with Purpose / Boot / Env / Smoke Scripts / Integration Tests.
- Subtask 11.5 (manual end-to-end smoke run) is the owner's gate — handed off to task_12's validation log.

## Status

Task completed. All deliverables committed in `0aa892a` (2026-04-27). Task file and _tasks.md status updated to `completed` in this session.

## Important Decisions

- **All five scripts share `_lib.sh`** (env defaults, `require_jq`, `resolve_book_id_by_title`, `stream_agent_response`, `extract_citation_uuids`, `fetch_chunk_chapter_ordinal`).
- **Book ids are resolved by title substring** via `GET /api/library/books?limit=50` per requirement; Gutendex IDs are env-overridable defaults.
- **`tmp/` lives next to the scripts** (`apps/mastra/src/scripts/curl/tmp/`) and is the only gitignored path.
- **Spoiler-cap propagation** uses both natural-language instruction in the user message AND `requestContext.spoiler_caps` for forward-compatibility.
- **SSE parsing is regex-only**: capture full stream to tmp file, `grep -oE '\{\{cite:[0-9a-f-]{36}\}\}'`.
- **`apps/mastra/__tests__/smoke-scripts.test.ts`** validates structural contract (27 assertions, unit tier).

## Files / Surfaces

- `apps/mastra/src/scripts/curl/_lib.sh` (shared helpers)
- `apps/mastra/src/scripts/curl/01-add-books.sh` ... `05-empty-retrieval.sh` (executable)
- `apps/mastra/src/scripts/curl/README.md`
- `apps/mastra/src/scripts/curl/.gitignore` (`tmp/`)
- `apps/mastra/README.md`
- `apps/mastra/__tests__/smoke-scripts.test.ts` (27 assertions)

## Ready for Next Run

- task_12 inherits subtask 11.5: run 5 scripts in order, log per-script outcomes against the validation matrix.
- If `apps/api` `POST /api/library/books` is still unmounted in production at task_12 start, surface that as the first blocker.
