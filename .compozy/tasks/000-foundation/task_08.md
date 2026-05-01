---
status: completed
title: Scaffold @dialogus/db package
type: backend
complexity: low
dependencies:
  - task_01
---

# Task 8: Scaffold @dialogus/db package

## Overview

Create the `@dialogus/db` workspace package with `package.json` wiring Drizzle (`drizzle-orm`, `drizzle-kit`), `postgres` driver, and `pg-boss 12`. Sets up `drizzle.config.ts`, empty `src/` barrels, and the root `db:*` scripts that dispatch to this package via `pnpm --filter`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/db/package.json` with `"name": "@dialogus/db"`, `"type": "module"`, dependencies `drizzle-orm@^0.45`, `drizzle-kit@^0.30` (devDep), `postgres@^3.4`, `pg-boss@^12`, `@dialogus/shared@workspace:*`.
- MUST author `packages/db/tsconfig.json` extending root.
- MUST author `packages/db/drizzle.config.ts` pointing at `./src/schema/` for input and `./drizzle/` for SQL output.
- MUST expose package scripts: `db:generate` (`drizzle-kit generate`), `db:studio` (`drizzle-kit studio`), `db:migrate` (runs `tsx src/migrate.ts`), `db:reset` (drop/recreate + `db:migrate`), `typecheck`, `test`.
- MUST add `tsx` devDependency for running `src/migrate.ts` from scripts.
- Root `package.json` scripts MUST dispatch: `db:generate`/`db:migrate`/`db:studio`/`db:reset` via `pnpm --filter @dialogus/db <script>`.
- MUST create empty barrel stubs `src/index.ts`, `src/schema/index.ts`, `src/client.ts`, `src/probes.ts`, `src/pgboss.ts`, `src/migrate.ts` (implemented in tasks 09-12).

</requirements>

## Subtasks

- [x] 8.1 Author `packages/db/package.json` with deps + scripts.
- [x] 8.2 Author `packages/db/tsconfig.json`.
- [x] 8.3 Author `packages/db/drizzle.config.ts`.
- [x] 8.4 Create empty `src/` barrel stubs.
- [x] 8.5 Wire root `db:*` scripts to dispatch via `pnpm --filter`.

## Implementation Details

Reference TechSpec "System Architecture → packages/@dialogus/db" and Build Order Step 4. `drizzle.config.ts` shape mirrors the one in dialogus-2 (`/Users/igortullio/Developer/igortullio/dialogus-2/packages/db/drizzle.config.ts`) as a structural reference — but do NOT copy any content (fresh start per ADR-008 product).

### Relevant Files

- `/Users/igortullio/Developer/igortullio/dialogus-2/packages/db/drizzle.config.ts` — shape reference only; no copy.
- Product TechSpec "Data Models" table.
- Foundation TechSpec "Implementation Design → Data Models".

### Dependent Files

- `./packages/db/package.json` (new)
- `./packages/db/tsconfig.json` (new)
- `./packages/db/drizzle.config.ts` (new)
- `./packages/db/src/index.ts` (new stub)
- `./packages/db/src/schema/index.ts` (new stub)
- `./packages/db/src/client.ts` (new stub)
- `./packages/db/src/probes.ts` (new stub)
- `./packages/db/src/pgboss.ts` (new stub)
- `./packages/db/src/migrate.ts` (new stub)
- `./package.json` (modify: wire `db:*` root scripts)

### Related ADRs

- [ADR-002: Generate-only Drizzle migrations](adrs/adr-002.md) — explains absence of a `db:push` script.

## Deliverables

- `packages/db/` scaffolded with empty barrels.
- Root `db:*` scripts dispatch to the package.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural validation of `package.json`, `drizzle.config.ts`, and barrel imports.
- Integration tests **(REQUIRED)** — typecheck passes across the monorepo with the new package.

## Tests

- Unit tests:
  - [x] `packages/db/package.json` declares required deps (drizzle-orm, drizzle-kit, postgres, pg-boss, tsx).
  - [x] `packages/db/drizzle.config.ts` points `schema: './src/schema'` and `out: './drizzle'`.
  - [x] Barrel imports resolve: `@dialogus/db`, `@dialogus/db/schema` (deferred to tasks 09-10 for real content).
  - [x] No `db:push` script exists in `packages/db/package.json` or root `package.json` (ADR-002 compliance).
- Integration tests:
  - [x] `pnpm --filter @dialogus/db typecheck` exits 0 on empty stubs.
  - [x] `pnpm --filter @dialogus/db drizzle-kit --help` exits 0 (CLI installed).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Root `pnpm db:generate --help` shows drizzle-kit usage (proving dispatch works).
- No `push`-style scripts exist anywhere in the repo.
