---
status: completed
title: Docker Compose for Postgres 18 + pgvector
type: infra
complexity: low
dependencies:
  - task_01
---

# Task 4: Docker Compose for Postgres 18 + pgvector

## Overview

Create the `docker-compose.yml` that boots a Postgres 18 instance with the pgvector extension pre-installed, providing local persistence for every downstream task. Uses the official `pgvector/pgvector:pg18` image and exposes port 5432 with a healthcheck.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST use image `pgvector/pgvector:pg18` (multi-arch supporting arm64).
- MUST expose Postgres on port 5432.
- MUST mount a named volume (`dialogus-postgres-data`) for persistence across `docker compose down`.
- MUST configure env vars `POSTGRES_USER=dialogus`, `POSTGRES_PASSWORD=dialogus`, `POSTGRES_DB=dialogus` (all overridable via host env).
- MUST define a healthcheck using `pg_isready -U dialogus` with reasonable retry bounds (interval 5s, retries 10).
- README MUST document a fallback to `pgvector/pgvector:pg17` if the PG 18 image surfaces a platform-specific issue on Apple Silicon (per ADR-001 Known Risks and product TechSpec).

</requirements>

## Subtasks

- [x] 4.1 Author `docker-compose.yml` with `postgres` service using `pgvector/pgvector:pg18`.
- [x] 4.2 Wire the named volume `dialogus-postgres-data`.
- [x] 4.3 Add healthcheck using `pg_isready`.
- [x] 4.4 Add a README note about the `pg17` fallback.

## Implementation Details

Reference TechSpec "Development Sequencing → Build Order Step 2". Single service — no test DB, no Redis, no other sidecars. Integration DB uses Testcontainers (Feature 002), not docker-compose.

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/docker-compose.yml` — template for the service + volume + healthcheck shape.
- Product TechSpec "Integration Points → Postgres 18 + pgvector (≥0.8.0)" — version constraints.

### Dependent Files

- `./docker-compose.yml` (new)
- `./README.md` (modify: add PG 17 fallback note)

### Related ADRs

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — docker-compose is part of the explicit 3-command setup.

## Deliverables

- `docker-compose.yml` committed.
- README includes the PG 17 fallback note.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural YAML checks.
- Integration test **(REQUIRED)** — `docker compose up -d` boots and `psql` confirms PG 18 + pgvector available.

## Tests

- Unit tests:
  - [x] `docker-compose.yml` parses as valid YAML.
  - [x] The `postgres` service uses image `pgvector/pgvector:pg18`.
  - [x] Port mapping binds `5432:5432`.
  - [x] Named volume `dialogus-postgres-data` is declared.
  - [x] Healthcheck command contains `pg_isready`.
- Integration tests:
  - [x] `docker compose up -d postgres` reaches the `healthy` state within 30 seconds.
  - [x] `docker compose exec postgres psql -U dialogus -c "SELECT version();"` returns a string containing `PostgreSQL 18`.
  - [x] `docker compose exec postgres psql -U dialogus -c "SELECT name FROM pg_available_extensions WHERE name = 'vector';"` returns a non-empty result. _(Spec used `extname`; corrected to `name` since `pg_available_extensions` exposes `name` — `extname` is on `pg_extension`. Functional intent preserved.)_
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `docker compose up -d` yields a healthy Postgres 18 container.
- pgvector extension is available for installation via SQL in task_12.
