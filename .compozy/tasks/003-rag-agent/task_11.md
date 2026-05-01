---
status: completed
title: "cURL smoke scripts + apps/mastra README"
type: docs
complexity: low
dependencies:
  - task_08
---

# Task 11: cURL smoke scripts + apps/mastra README

## Overview

Ship the 5 cURL smoke scripts defined in TechSpec § Testing Approach → Manual Smoke under `apps/mastra/src/scripts/curl/`. These scripts verify the full end-to-end path from Mastra Dev Server → agent → tools → Postgres during Feature 003 closure (task_12 + task_13), and double as portfolio-grade demo material referenced from the repo README. Also author `apps/mastra/README.md` documenting the app's purpose, boot sequence, env, and the smoke-script workflow.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create the 5 cURL scripts per TechSpec § Testing Approach → Manual Smoke:
  - `apps/mastra/src/scripts/curl/01-add-books.sh` — adds 3 books (Moby Dick EN, Dom Casmurro PT, Crime and Punishment EN) via Feature 001 `/api/library/books`; polls `/api/library/books/:id/ingestion` until `ready`; exits non-zero if any book fails to reach `ready` within 10 minutes.
  - `apps/mastra/src/scripts/curl/02-create-thread.sh` — creates a Mastra thread scoped to Moby Dick via `POST /api/memory/threads` (or equivalent at the pinned Mastra version); captures `thread_id` into `./tmp/thread_id`.
  - `apps/mastra/src/scripts/curl/03-ask-question.sh` — sends "where does Ishmael first meet Queequeg?" to the thread via `POST /api/agents/dialogusAgent/stream`; captures SSE response; asserts at least one `{{cite:<uuid>}}` marker; verifies the marker's UUID exists in the book's chunks via `GET /api/library/chunks/:id` (200 response).
  - `apps/mastra/src/scripts/curl/04-spoiler-cap.sh` — creates a new thread on Moby Dick; asks "how does Ahab die?" with `spoiler_caps: { <moby_id>: 10 }` (chapter 10 — Ahab's fate is in the back half); captures response; asserts the response either (a) contains no `{{cite:...}}` marker (refusal) OR (b) contains markers only pointing at chunks with `chapter_ordinal <= 10`.
  - `apps/mastra/src/scripts/curl/05-empty-retrieval.sh` — creates a thread on Dom Casmurro; asks a deliberately off-topic question ("qual o papel dos gnomos em Dom Casmurro?"); asserts the response contains no `{{cite:...}}` marker AND contains at least 2 lines starting with `- ` or `* ` (reformulation hints per ADR-003).
- MUST create `apps/mastra/src/scripts/curl/README.md` documenting: purpose of each script, execution order, env requirements, expected outcomes, failure diagnosis (what to check in Mastra Studio when a script fails).
- MUST create `apps/mastra/src/scripts/curl/.gitignore` that ignores any `./tmp/` state written by scripts (thread IDs, captured SSE output).
- MUST create `apps/mastra/README.md` covering:
  - Purpose of `apps/mastra` (runtime for `dialogusAgent`).
  - Boot sequence: `pnpm dev` from repo root OR `pnpm --filter @dialogus/mastra dev` in isolation.
  - Env vars: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MASTRA_PORT=3002`, `MASTRA_STUDIO_PORT=4111`, `NEXT_PUBLIC_MASTRA_URL`.
  - Mastra Studio: how to open, what to look at during prompt tuning, where thread history lives.
  - Running smoke scripts: `cd apps/mastra/src/scripts/curl && ./01-add-books.sh && ...`.
  - Running integration tests: `pnpm --filter @dialogus/mastra test:integration`.
- All cURL scripts MUST be bash (shebang `#!/usr/bin/env bash`), `set -euo pipefail`, and use `jq` for JSON parsing. Document `jq` as a local dep in the README.
- Scripts MUST NOT hardcode book UUIDs — resolve them via `GET /api/library/books?limit=50` after the add-books script runs.
- Scripts MUST NOT commit secrets; the user runs them locally with their own env.

</requirements>

## Subtasks

- [x] 11.1 Author the 5 cURL scripts.
- [x] 11.2 Author `scripts/curl/README.md`.
- [x] 11.3 Author `scripts/curl/.gitignore`.
- [x] 11.4 Author `apps/mastra/README.md`.
- [x] 11.5 Smoke-run all 5 scripts locally end-to-end once to verify. _(handed off to task_12 — owner-driven manual gate that requires live API keys and Docker)_

## Implementation Details

Reference TechSpec § Testing Approach → Manual Smoke for the exact sequence + acceptance criteria per script. The scripts are both verification artifacts (for the task_12 validation round and task_13 closure) and demo material (the README's cURL sequence doubles as portfolio content).

For SSE parsing in bash: Mastra's stream endpoint emits SSE events per the AI SDK convention; the scripts can either (a) parse the raw response with `grep '^data:'` + `jq` on each line, or (b) tee the full stream to a tmp file and do post-processing. Option (b) is simpler and more diagnosable.

### Relevant Files

- TechSpec § Testing Approach → Manual Smoke (the script contract).
- Feature 001 `README.md` "Catalog (feature 001)" section — template for cURL demo style.
- Feature 002 `README.md` "Ingestion (feature 002)" section (task_18) — template.
- `apps/mastra/src/index.ts` (task_08) — the server under smoke-test.
- ADRs 002, 003, 007 — criteria for the assertions each script verifies.

### Dependent Files

- `apps/mastra/src/scripts/curl/01-add-books.sh` (new)
- `apps/mastra/src/scripts/curl/02-create-thread.sh` (new)
- `apps/mastra/src/scripts/curl/03-ask-question.sh` (new)
- `apps/mastra/src/scripts/curl/04-spoiler-cap.sh` (new)
- `apps/mastra/src/scripts/curl/05-empty-retrieval.sh` (new)
- `apps/mastra/src/scripts/curl/README.md` (new)
- `apps/mastra/src/scripts/curl/.gitignore` (new)
- `apps/mastra/README.md` (new)

### Related ADRs

- [ADR-003: Refusal + reformulation](adrs/adr-003.md) — verified in `05-empty-retrieval.sh`.
- [ADR-007: Citation marker](adrs/adr-007.md) — verified in `03-ask-question.sh`.
- Product [ADR-005: Mastra Dev Server](../dialogus/adrs/adr-005.md) — README describes runtime.

## Deliverables

- 5 cURL scripts + README + .gitignore in `scripts/curl/`.
- `apps/mastra/README.md`.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural READMEs / scripts.
- Integration tests **(REQUIRED)** — the smoke-script run is manual; covered as manual-smoke per task_12 and task_13.

## Tests

- Unit tests:
  - [x] `apps/mastra/README.md` exists and contains sections: "Purpose", "Boot", "Env", "Smoke Scripts", "Integration Tests".
  - [x] `scripts/curl/README.md` exists and documents all 5 scripts by name.
  - [x] Each of the 5 scripts is executable (`chmod +x`) and has a bash shebang.
  - [x] Each script uses `set -euo pipefail`.
- Integration tests:
  - [ ] Manual: author runs all 5 scripts locally; each exits 0. Captured in task_12 validation log.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- All 5 scripts exit 0 on a fresh local environment with the 3 reference books ingested.
- `apps/mastra/README.md` is the single-source-of-truth onboarding doc for running the Mastra process.
