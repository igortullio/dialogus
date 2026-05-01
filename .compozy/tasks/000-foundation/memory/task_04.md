# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Done. Docker Compose service for Postgres 18 + pgvector authored, README fallback note added, structural unit tests + live integration tests passing.

## Important Decisions

- Volume mount path is `/var/lib/postgresql` (NOT `/var/lib/postgresql/data`). The PG 18 official image refuses to start when the data subdir is mounted directly — it puts version-specific subdirectories under `/var/lib/postgresql` so `pg_upgrade --link` can cross major versions without mount-boundary issues. See docker-library/postgres PR #1259.
- Env defaults use `${POSTGRES_USER:-dialogus}` form so host env can override without editing the file. Healthcheck still uses literal `-U dialogus` per task spec; if a user overrides the username, the healthcheck must also be overridden — acceptable since overrides are an unusual local-dev case.
- Integration test uses `describe.skipIf(!dockerAvailable)` so CI environments without Docker (current Foundation `ci.yml` is unit-only) don't fail.

## Learnings

- Task spec SQL `SELECT extname FROM pg_available_extensions WHERE extname='vector'` has a column name typo — `pg_available_extensions` exposes `name`, not `extname` (the latter is on `pg_extension`). Integration test uses the correct column.
- `docker compose ps --format json` output shape varies across versions; using `docker inspect --format '{{.State.Health.Status}}' <id>` is more portable for polling health.

## Files / Surfaces

- `docker-compose.yml` (new)
- `README.md` (added "Postgres 18 / Apple Silicon fallback" subsection between Quickstart and Architecture)
- `__tests__/docker-compose.test.ts` (new, 12 unit tests)
- `__tests__/docker-compose.integration.test.ts` (new, 2 integration tests behind Docker-availability gate)

## Errors / Corrections

- First attempt mounted volume at `/var/lib/postgresql/data` → container reported `unhealthy` with PG 18 layout error; corrected mount target.
- First integration query used spec-literal `extname` column → corrected to `name`.
- Biome auto-fix collapsed multi-line array in integration test; left as-is (template-literal warnings on fixture strings are intentional — they assert literal `${VAR:-default}` text inside the YAML).

## Ready for Next Run

- Task_12 (initial SQL migration) can rely on the running container; volume mount at `/var/lib/postgresql` is the correct pattern. `CREATE EXTENSION vector` will work.
- Task_21 fresh-clone smoke must verify `docker compose up -d` reaches healthy on the target machine; if the PG 18 image misbehaves on Apple Silicon the README fallback path (`pg17`) is the documented remedy.
