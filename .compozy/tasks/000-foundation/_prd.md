# Feature 000: Foundation — Product Requirements Document

## Overview

Foundation is the scaffolding feature for dIAlogus V1 — a monorepo baseline that establishes tools, conventions, database persistence, and end-to-end wiring before any product feature lands. It produces a dogfoodable developer experience where `pnpm install && docker compose up -d && pnpm db:migrate && pnpm dev` yields a running `apps/api` and `apps/web` where the web renders "dIAlogus — api: up / db: up", proving the full stack works.

**Problem.** Starting without a shared baseline invites spec drift and ad-hoc decisions that compound. The old `dialogus-2` attempt over-specified Foundation (50 tasks, 8 principles) and still shipped a partially-integrated outcome. This Foundation feature is the reset — tight, trimmed, Day-1-ready.

**Target users.** Primary: the project owner as the daily developer. Secondary: future features 001-004 that depend on a stable baseline; portfolio reviewers who clone the repo expecting a ≤ 15-minute path to a running app.

**Value.** For the owner, a baseline that every subsequent feature can extend without touching existing structure; fast iteration feedback (pre-commit ≤ 30s, CI ≤ 5 min). For reviewers, a first commit that reads as portfolio-grade: quickstart, LICENSE, architecture summary, env example, Day-1-ready signals.

## Goals

1. **One-command install to visible dev round-trip in ≤ 15 minutes** on a fresh clone with only Docker Desktop + Node 22 preinstalled.
2. **Stable extension points** — every downstream feature (001-004) adds files to known slots without modifying Foundation structure.
3. **Portfolio-viewable first commit** — README + LICENSE + env example + architecture summary all present.
4. **Green CI on day 1** across 3 jobs (lint+typecheck, test, build).
5. **Fast pre-commit feedback** — lint + typecheck + unit tests run in ≤ 30 seconds on a typical change.

## User Stories

### Primary persona — project owner (daily developer)

- As a developer, I want `pnpm install && docker compose up -d && pnpm db:migrate && pnpm dev` to produce a running api + web without extra setup, so I can start iterating within minutes.
- As a developer, I want the web landing page to show api + db health status, so I know the stack is wired correctly end-to-end before I touch any feature code.
- As a developer, I want env validation to fail fast at startup with a clear grouped error if config is wrong, so I never debug silent misconfig.
- As a developer, I want a pre-commit hook that runs lint + typecheck + unit tests in under 30 seconds, so I get fast feedback without integration-test slowness.
- As a developer, I want CI on every push to enforce lint + typecheck + test + build, so regressions never reach `main`.
- As a developer, I want the monorepo layout established upfront (apps/ + packages/), so each feature 001-004 simply adds files to known slots.
- As a developer, I want a clean README with 5-line quickstart + architecture summary + next-steps pointer, so I (or a reviewer) can orient in minutes.

### Secondary persona — portfolio reviewer

- As a reviewer, I want to clone the repo, run the quickstart, and see "dIAlogus — api: up / db: up" within 15 minutes, so I can verify the project runs without debugging it.
- As a reviewer, I want LICENSE and Conventional Commits guidance visible, so I know the project follows open-source norms.

## Core Features

### 1. Monorepo scaffold

pnpm workspace with `apps/` + `packages/` roots. Strict TypeScript 6 (fallback ~5.9 if a peer refuses). Biome for lint + format. `.githooks/pre-commit` enforcing lint + typecheck + unit tests. Root `tsconfig.json` with `strict` + `noUncheckedIndexedAccess`.

### 2. Database persistence with pgvector

PostgreSQL 18 via docker-compose with pgvector ≥ 0.8.0 and uuid-ossp extensions. First Drizzle migration creates these extensions, a `system_health` canary row, and initializes the pg-boss schema. Single Postgres instance planned to serve future domain tables, pg-boss jobs, and Mastra Memory.

### 3. HTTP API with health endpoint

`apps/api` as a Hono 4 server on port 3001. `/health` returns JSON `{ api: 'up', db: 'up' | 'down', pgboss: 'up' | 'down' }` after a trivial DB query and a pg-boss schema presence check. No other routes in Foundation.

### 4. Web placeholder with E2E wiring

`apps/web` as a Next.js 16 App Router app on port 3000. Landing route (`/`) is a Server Component that fetches `/health` from `apps/api` at render time and displays either "dIAlogus — api: up / db: up" or the fail state. Tailwind v4 / shadcn are NOT installed — deferred to Feature 004.

### 5. Shared environment validation

`@dialogus/shared` exports a Zod schema and a `loadConfig()` function that parses `process.env` once on startup. Throws a grouped error listing every missing or malformed variable. Every app (api, web) calls it at its entry point.

### 6. CI + pre-commit gates

GitHub Actions `ci.yml` with 3 jobs (lint-and-typecheck, test, build) parallelized where possible. Pre-commit hook blocks commits that fail any of the three. Integration tests are explicitly excluded from both pre-commit and the default `test` job (they ship with Feature 002).

### 7. Day-1 polish

README with 5-line quickstart + 3-paragraph architecture summary + "Next steps" section. LICENSE (MIT). `.env.example` listing every planned env var across all features (with comments per variable). `.nvmrc` pinning Node 22.13. `packageManager` field pinning pnpm 9.15. Conventional Commits guidance in README.

## User Experience

### Primary flow — first-time clone

1. Clone repo; open README.
2. Ensure Docker Desktop is running; Node 22+ via `.nvmrc`; run `corepack enable`.
3. `cp .env.example .env` and fill in (defaults work for local Postgres).
4. `pnpm install`.
5. `docker compose up -d` — Postgres + pgvector boots on 5432.
6. `pnpm db:migrate` — applies first migration (extensions + canary + pg-boss).
7. `pnpm dev` — api on 3001, web on 3000, both live-reload.
8. Open http://localhost:3000 — see "dIAlogus — api: up / db: up".
9. Optionally hit http://localhost:3001/health for the JSON status.

### Secondary flow — daily iteration

1. `docker compose up -d` (if containers stopped overnight).
2. `pnpm dev`; edit code; save; servers live-reload.
3. `git commit` triggers pre-commit hook (lint + typecheck + unit).

### Secondary flow — CI on push

1. Push to branch or open PR.
2. GitHub Actions runs 3 jobs in parallel where applicable.
3. Red build blocks merge.

### UI/UX considerations

- Web landing is intentionally minimal — `dIAlogus` heading + status line. No brand typography or layout; that belongs to Feature 004.
- Error states visible: if `/health` fails or returns a down status, web shows the relevant line (`api: down` or `db: down`) rather than a cryptic 500.
- Language: UI strings in Portuguese where user-facing; status indicators default to English technical terms (`up`/`down`) for dev legibility. Feature 004 may refine.
- No authentication, no cookies, no CSRF — single-user local.

## High-Level Technical Constraints

- Node 22.13+ via `.nvmrc` + Corepack-activated pnpm 9.15+.
- Docker Desktop ≥ 4.30 running locally.
- Postgres 18 + pgvector ≥ 0.8.0 via docker-compose (pinned image tag `pgvector/pgvector:pg18`).
- Single Postgres instance hosts domain tables + pg-boss + (future) Mastra Memory.
- Env variables validated at every app's startup via `@dialogus/shared`.
- No external APM or error tracker in Foundation (pino structured logs only).

## Non-Goals (Out of Scope)

- Book catalog — Feature 001.
- Ingestion pipeline (download / parse / chunk / embed / index) — Feature 002.
- RAG agent (Mastra, tools, system prompt) — Feature 003.
- Chat UI (sidebar, composer, citations, spoiler slider, Tailwind v4 + shadcn) — Feature 004.
- `apps/worker` — added with Feature 002.
- `apps/mastra` — added with Feature 003.
- Testcontainers integration tests — added with Feature 002 when integration coverage first matters.
- Playwright E2E — added with Feature 004.
- Renovate / Dependabot — Phase 2.
- commitlint enforcement (Conventional Commits stay as README guidance in V1) — Phase 2.
- Bundle-size budgets in CI — added with Feature 004.
- Prod Docker images / deploy configs — Phase 2.

## Phased Rollout Plan

### Phase 1 — Foundation V1 (this PRD) — target ~1 week

Included surfaces: monorepo scaffold · docker-compose + pgvector · `@dialogus/shared` (Zod env, errors, shared types) · `@dialogus/db` (Drizzle + first migration + pg-boss init) · `apps/api` with `/health` · `apps/web` with Server Component health fetch · `ci.yml` (3 jobs) · pre-commit hook · README, LICENSE, `.env.example`, `.nvmrc`, `packageManager` pin.

Exit criteria:

- `pnpm install && docker compose up -d && pnpm db:migrate && pnpm dev` succeeds on a fresh clone.
- Browser at `localhost:3000` shows "dIAlogus — api: up / db: up".
- Pre-commit blocks a deliberately broken commit (e.g., an intentional lint error).
- CI is green on `main`.
- README's 5-line quickstart works verbatim.

### Phase 2 — foundation extension bundled into later features

- `apps/worker` scaffolds with Feature 002 (ingestion).
- `apps/mastra` scaffolds with Feature 003 (rag).
- Tailwind v4 + shadcn arrive with Feature 004 (chat UI).
- Testcontainers integration harness arrives with Feature 002.
- Playwright E2E arrives with Feature 004.

### Phase 3 — post-V1 polish (no commitment)

- commitlint + Renovate / Dependabot if dogfooding extends.
- Prod Docker images + deploy configs if Phase 2 public deploy green-lights.

## Success Metrics

### Primary (Foundation completion gate)

- **Fresh-clone setup**: ≤ 15 minutes from `git clone` to "dIAlogus — api: up / db: up" on `localhost:3000`.
- **Pre-commit runtime**: ≤ 30 seconds on a typical ~50-file change.
- **CI runtime on `main`**: ≤ 5 minutes total across all 3 jobs.
- **First-commit portfolio readiness**: README (quickstart + architecture + next-steps) + LICENSE + `.env.example` + Conventional Commits guidance all present and correct.

### Secondary

- **Zero duplication** of env handling, error classes, and Zod schemas across apps — all via `@dialogus/shared`.
- **Reproducibility**: `pnpm db:reset && pnpm db:migrate && pnpm dev` three times in a row produces identical state.
- **Failure legibility**: killing Postgres mid-run shows "api: up / db: down" in the landing, not a cryptic 500.

## Risks and Mitigations

### Adoption risks (self-as-adopter)

- **Risk**: Foundation feels "just scaffolding" and gets rushed, shipping latent bugs in env validation or migrations that surface in Feature 001.
  **Mitigation**: exit criteria are dogfoodable and visible (the running landing proves wiring); no hand-waving.
- **Risk**: README drifts from actual commands over time as features add setup steps.
  **Mitigation**: each subsequent feature must update the README if it adds a required step; quickstart is tested verbatim before V1 ship.

### Timeline / resource risks

- **Risk**: TypeScript 6 peer incompat with Mastra / Drizzle peers, discovered during Feature 003.
  **Mitigation**: product ADR-008 already flags; Foundation pins root TS to ~5.9 if any peer rejects 6 during Feature 003 validation.
- **Risk**: Postgres 18 + pgvector 0.8.x on Apple Silicon has an unknown edge case.
  **Mitigation**: use `pgvector/pgvector:pg18` multi-arch image; README documents fallback to PG 17 if a blocker surfaces (mirrors product TechSpec Known Risks).

### Dependency risks

- **Risk**: Docker Desktop not installed or not running on reviewer's machine.
  **Mitigation**: README first line requires Docker Desktop ≥ 4.30 with a one-line install command for macOS; a hosted demo URL is Phase 2 nice-to-have.
- **Risk**: Corepack / pnpm drift causes install failures.
  **Mitigation**: `packageManager` field in root `package.json` pins the exact pnpm version; README includes `corepack enable` step.

## Architecture Decision Records

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — README walks three visible steps; web Server Component fetches `/health` to prove the stack; first commit ships README + LICENSE + env example + Node/pnpm pins.

## Open Questions

- **Seed beyond canary row** — whether Foundation's migration inserts anything else (e.g., placeholder book metadata so Feature 003 can test agent behavior without depending on Feature 002). Deferred to Feature 002 TechSpec.
- **Root `pnpm dev` orchestration** — `pnpm --parallel -r dev` works for 2 apps; revisit when Feature 002 adds worker and Feature 003 adds mastra (4 processes), possibly swapping to Turborepo.
- **Drizzle migration policy** — `drizzle-kit push` allowed in dev, `drizzle-kit generate` + checked-in SQL for everything else. Confirm in Foundation TechSpec.
- **`.env.example` completeness** — leaning toward listing every planned env var across all features with per-var comments, not only Foundation's. Resolve in Foundation TechSpec.
- **Status-line language** — proposal stands (English `up`/`down` for dev legibility); Feature 004 may override if needed.

## Exit Criteria Verification

**Closed at:** 2026-04-25T04:25:00Z (task_21 manual smoke + closure)

### Measurements

- **Fresh-clone setup time (clone → visible landing):** ~39 seconds end-to-end on macOS 25.3 / Apple Silicon, warm pnpm store (cold-store would be larger but bounded by network; pnpm install alone was 2.4s of the 39s). **Target ≤ 15 minutes — met with >20× headroom.**
- **Pre-commit runtime (`pnpm lint && pnpm typecheck && pnpm test`):** 4.59 seconds wall-clock on the current 8-package working tree. **Target ≤ 30 seconds — met with >6× headroom.**
- **Local CI-job parity:** all three CI jobs (`lint-and-typecheck`, `test`, `build`) execute clean against `HEAD` using the exact commands in `.github/workflows/ci.yml`. `pnpm build` completed in 3.6s.

### Per-criterion evidence

| PRD exit criterion | Status | Evidence |
|---|---|---|
| `pnpm install && docker compose up -d && pnpm db:migrate && pnpm dev` succeeds on a fresh clone | ✅ | Verified verbatim from a re-clone at `/tmp/dialogus-smoke-fresh`. Migration log shows `stage: drizzle → pgboss → done`. |
| Browser at `localhost:3000` shows "dIAlogus — api: up / db: up" | ✅ | Playwright snapshot rendered `paragraph "api: up / db: up / pgboss: up"`. Screenshot at `.playwright-mcp/smoke-up.png`. |
| Pre-commit blocks a deliberately broken commit | ✅ | Staged `__tests__/_smoke_bad_lint.ts` with `var` + double-quoted string; `git commit` failed at `pnpm lint` (Biome `format` + `noVar`); HEAD unchanged. |
| CI is green on `main` | ⚠️ Local-only | No GitHub remote configured yet; verified by running each CI job's exact command locally — all green. Will be authoritative once `git remote add origin <url> && git push -u origin main`. |
| README's 5-line quickstart works verbatim | ✅ (after fix) | See "Defect found and resolved" below. |

### Defect found and resolved during smoke

Verbatim README quickstart initially failed at `pnpm db:migrate` with `DATABASE_URL: undefined`: copying `.env.example → .env` is not enough on its own because `tsx`/Node do not auto-load `.env`, and `pnpm` does not either. Fixed by introducing `loadEnvFromRoot()` in `@dialogus/shared/config` (uses Node 22's `process.loadEnvFile()`, walks up from cwd to find the repository `.env`), invoked at the two CLI entry points (`packages/db/src/migrate.ts`, `apps/api/src/index.ts`). `apps/web` did not need it — the only env var it reads (`NEXT_PUBLIC_API_URL`) has a default. After the fix the verbatim quickstart succeeded; smoke was re-run end-to-end against a fresh clone at `/tmp/dialogus-smoke-fresh`.

### Failure-legibility check

Stopped Postgres mid-run (`docker compose stop postgres`) and refreshed the landing — page rendered `api: up / db: down / pgboss: down` (no 500). Screenshot at `.playwright-mcp/smoke-db-down.png`. Restarted Postgres and re-ran `pnpm db:reset && pnpm db:migrate`: idempotent (Drizzle journal short-circuits, pg-boss `start()` is a no-op when schema exists), canary row count remains 1, both `vector` and `uuid-ossp` extensions present.

### Foundation V1 status

**Phase 1 closed.** Feature 001 (catalog) planning is now unblocked.
