<!--
SYNC IMPACT REPORT
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: Initial ratification. The previous file was the raw, unfilled
constitution template; this is the first concrete adoption, so it starts at 1.0.0.

Modified principles: N/A (initial ratification)
  Placeholder slots resolved into:
    I.   Code Quality & Maintainability   (was [PRINCIPLE_1_NAME])
    II.  Testing Standards                (was [PRINCIPLE_2_NAME])
    III. User Experience Consistency      (was [PRINCIPLE_3_NAME])
    IV.  Performance Requirements         (was [PRINCIPLE_4_NAME])
  [PRINCIPLE_5_*] slot intentionally dropped — the user requested four focus
  areas and the template permits fewer principles than the five slots shown.

Added sections:
  - Technology & Quality Constraints   (was [SECTION_2_NAME])
  - Development Workflow & Quality Gates (was [SECTION_3_NAME])
  - Governance                         (filled from placeholder)

Removed sections: none

Templates requiring updates:
  ✅ .specify/templates/plan-template.md   — Constitution Check section filled with concrete gates
  ✅ .specify/templates/tasks-template.md  — "Tests are OPTIONAL" note reconciled with Principle II
  ✅ .specify/templates/spec-template.md   — reviewed; tech-agnostic by design, no structural change needed
  ✅ README.md                             — reviewed; already documents the gates/CI/a11y, no change needed

Follow-up TODOs:
  - Optional: run /speckit-agent-context-update to refresh CLAUDE.md / agent context
    so the runtime companion reflects these principles.
-->

# dIAlogus Constitution

dIAlogus is a single-user RAG study companion over public-domain classics: a
Next.js web app and a Hono API backed by one Postgres 18 + pgvector database,
with a Mastra-hosted Claude agent and a pg-boss worker. It is built and
maintained by one person. These principles exist so the codebase stays
legible, the answers stay trustworthy, and the experience stays consistent as
features accrete.

## Core Principles

### I. Code Quality & Maintainability

- All code MUST pass `pnpm lint` (Biome 2) and `pnpm typecheck` with zero
  errors before merge. Formatting is owned by Biome (single quotes, no
  semicolons, 2-space indent, 100-column width) — hand-formatting and style
  debates are out of scope.
- TypeScript runs in `strict` mode and `any` is a smell: `noExplicitAny`
  findings MUST be replaced with a real type or, in the rare unavoidable case,
  carry a `// biome-ignore` with a written reason. Cross-package (`@dialogus/*`)
  public APIs MUST be fully typed — no implicit `any` across package boundaries.
- Cognitive complexity per function MUST stay ≤ 15
  (`noExcessiveCognitiveComplexity`). Functions over the ceiling MUST be
  decomposed, never silenced.
- Packages MUST honor the DDD layering (`domain` / `application` /
  `infrastructure`): `domain` MUST NOT import from `application` or
  `infrastructure`, and side effects (DB, network, queues) live only in
  `infrastructure`.
- The process split is a hard boundary: `apps/api` stays request-handling and
  enqueues via a transient pg-boss client; only `apps/worker` may call
  `boss.work(...)` or `boss.schedule(...)`.
- Architecturally significant decisions MUST be captured as ADRs under
  `.compozy/tasks/<feature>/adrs/`, and commits MUST follow Conventional
  Commits.

**Rationale**: A single maintainer cannot afford drift. Machine-enforced
formatting, typing, and a complexity ceiling keep the code reviewable months
later; the layering and process boundaries are what let features 001–004
evolve without entangling the API, worker, and agent.

### II. Testing Standards

- Tests MUST follow the pyramid the toolchain already encodes: fast Vitest
  unit tests (`*.test.ts`), Testcontainers-backed integration tests
  (`*.integration.test.ts`) for anything touching Postgres / pgvector /
  pg-boss, and Playwright E2E + `@axe-core/playwright` for `apps/web`
  journeys.
- Every bug fix MUST ship a regression test that fails before the fix and
  passes after. New behavior MUST be covered at the lowest sufficient layer.
- Integration tests MUST exercise real infrastructure via Testcontainers — the
  database and vector search MUST NOT be mocked for integration-level
  guarantees. Deterministic dev doubles (`EMBEDDING_PROVIDER=mock`,
  `SUMMARY_GENERATOR=mock`) are permitted only to remove external-API
  nondeterminism, never to bypass the code under test.
- The product's correctness contracts MUST have dedicated, threshold-checked
  tests: citation resolvability (≥ 80%), spoiler-cap enforcement (zero
  post-cap citations), grounded refusal on empty retrieval (≥ 2 reformulation
  hints), and language-match accuracy. These thresholds are release gates, not
  aspirations.
- A red test is never "expected": it is fixed or the change is reverted. The
  pre-commit hook (`pnpm lint && pnpm typecheck && pnpm test`) and the full CI
  matrix MUST be green before merge.

**Rationale**: dIAlogus makes factual claims about texts and enforces spoiler
boundaries — correctness *is* the product. Tests at the right layer, run
against real infrastructure, are the only credible evidence that retrieval,
grounding, and the safety contracts still hold as the system grows.

### III. User Experience Consistency

- Every API error MUST be an RFC 9457 Problem Details document
  (`application/problem+json`) with a `urn:dialogus:problems:<slug>` type URI
  and a documented slug — no ad-hoc error shapes. List endpoints MUST use
  cursor pagination and Zod-typed envelopes.
- Product contracts are invariant across surfaces: the agent MUST emit
  `{{cite:<chunk_id>}}` markers for non-trivial claims, MUST enforce the
  per-book spoiler cap at retrieval time, and MUST return a grounded refusal
  with ≥ 2 reformulation hints when retrieval is empty; the web app MUST
  resolve these consistently (streaming-aware citation badges, per-book
  spoiler slider).
- The interface MUST respond in the language of the user's latest message
  (PT/EN) while preserving source quotes in their original language.
- UI MUST be built from the established design system (shadcn/ui new-york +
  neutral, Tailwind v4 tokens in `apps/web/src/app/globals.css`) — no one-off
  color or spacing values outside the tokens.
- Accessibility is a baseline, not a feature: `/` and `/library` MUST sustain
  Lighthouse a11y ≥ 0.9, pass `@axe-core/playwright` with zero violations, and
  stay fully keyboard-navigable (arrow keys between messages, ⌘↵ to send, Esc
  to dismiss panels).

**Rationale**: Consistency is trust. One predictable error contract,
citation / spoiler / refusal behavior that never varies by surface, and an
accessible, token-driven UI mean the owner can rely on what the app says and
how it behaves — exactly what a study companion must earn.

### IV. Performance Requirements

- Semantic search MUST use the HNSW cosine index with SQL-level chapter
  capping; spoiler filtering MUST happen in the query, never by post-filtering
  results in application code.
- Responses MUST stream: the chat surface renders tokens and resolves citation
  badges incrementally as they arrive, not after the stream completes.
- Repeated and upstream-bound work MUST be cached or rate-aware: Gutendex
  search keeps its 60-second LRU cache, the agent system prompt MUST exploit
  Anthropic prompt caching, and in-flight ingestion progress polling MUST stay
  at the 2-second cadence — no tighter.
- The ingestion pipeline MUST remain an idempotent, resumable pg-boss chain
  (download → clean → parse → chunk → summarize → embed → index) that retries
  from the failed stage only, never from the start.
- Frontend performance MUST be measured, not assumed: Lighthouse runs in CI,
  and regressions in the audited a11y/performance scores block merge.

**Rationale**: A local, single-user tool still has to feel instant.
Index-level filtering, streaming, and caching keep latency and cost down; an
idempotent, resumable pipeline means a flaky upstream costs one stage, not a
full re-ingest.

## Technology & Quality Constraints

- Runtime and tooling are fixed: Node ≥ 22.13 and pnpm ≥ 9.15 (via Corepack);
  Biome 2 for lint + format; Vitest 4 for unit; Testcontainers for
  integration; Playwright + Lighthouse + axe-core for the web app.
  Substituting an alternative linter, formatter, or test runner requires an
  ADR and a constitution amendment.
- Persistence is a single Postgres 18 + pgvector instance for every concern
  (catalog, chunks + embeddings, Mastra Memory in its own schema, pg-boss
  queues). Introducing a second datastore requires explicit justification in
  the plan's Complexity Tracking.
- Schema changes MUST go through Drizzle migrations under
  `packages/db/drizzle/` applied via `pnpm db:migrate` — no out-of-band DDL.
- Configuration and secrets MUST be validated through the `@dialogus/shared`
  Zod environment schema at boot; scattered direct `process.env` reads are
  prohibited.
- The RAG agent runs on Claude per the documented dev/prod model split;
  embedding and summary providers are swappable via env and MUST offer
  deterministic mock modes for local development.

## Development Workflow & Quality Gates

- Local gate: the `.githooks/pre-commit` hook
  (`pnpm lint && pnpm typecheck && pnpm test`) MUST pass before every commit
  and MUST NOT be bypassed (`--no-verify`) for work that lands on `main`.
- CI gate: the 6-job GitHub Actions workflow (`lint-and-typecheck`, `test`,
  `integration`, `integration-web`, `a11y`, `build`) MUST be green before
  merge to `main`.
- Spec-driven flow: features are specified, planned, and decomposed via Spec
  Kit (`/speckit-*`). Every plan MUST pass the Constitution Check gate before
  Phase 0 research and again after Phase 1 design; violations MUST be recorded
  in the plan's Complexity Tracking with the rejected simpler alternative.
- Decisions that constrain future work MUST be captured as ADRs; PRDs and task
  trails live under `.compozy/tasks/<feature>/`.
- Commits follow Conventional Commits and history stays bisectable — each
  commit should be lint / typecheck / test green.

## Governance

- This constitution supersedes ad-hoc practice. When a guideline here conflicts
  with convenience, the constitution wins — or it MUST be amended first.
- Amendments are made via a PR that (a) edits this file, (b) bumps the version
  per the policy below, (c) updates the Sync Impact Report at the top, and
  (d) propagates changes to dependent artifacts (`plan-template.md`,
  `spec-template.md`, `tasks-template.md`, and `README.md` where affected).
- Versioning policy (semantic): **MAJOR** for a principle removed or redefined
  or any backward-incompatible governance change; **MINOR** for a new
  principle/section or materially expanded guidance; **PATCH** for
  clarifications and non-semantic wording.
- Compliance review: every plan runs the Constitution Check, and every PR
  review verifies the four principles hold for the change. Unavoidable
  deviations MUST be justified in Complexity Tracking — unjustified complexity
  is rejected.
- The CLAUDE.md / agent-context file is the runtime companion to this
  constitution; when principles change, refresh it via
  `/speckit-agent-context-update`.

**Version**: 1.0.0 | **Ratified**: 2026-06-22 | **Last Amended**: 2026-06-22
