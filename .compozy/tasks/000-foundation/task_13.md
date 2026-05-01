---
status: completed
title: Scaffold apps/api package
type: backend
complexity: low
dependencies:
  - task_01
  - task_06
  - task_10
---

# Task 13: Scaffold apps/api package

## Overview

Create the `apps/api` workspace app with `package.json` (Hono 4 + `@hono/node-server` + `tsx`), `tsconfig.json`, and the infrastructure-first folder skeleton per ADR-004. Ships a placeholder `src/index.ts` that will be fleshed out in task_15 once the route handler (task_14) is in place.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/api/package.json` with `"name": "@dialogus/api"`, `"type": "module"`, dependencies `hono@^4.12`, `@hono/node-server@^1.13`, workspace `@dialogus/shared@workspace:*`, `@dialogus/db@workspace:*`, `pino`, `pino-pretty` (dev only).
- MUST add devDependencies `tsx`, `vitest`, `@types/node`.
- MUST author `apps/api/tsconfig.json` extending the root with `outDir: ./dist` and appropriate `include` for `src/**`.
- MUST scaffold folder `apps/api/src/infrastructure/http/routes/` (infrastructure-first per ADR-004) without creating empty `domain/` or `application/` folders.
- MUST create placeholder `src/index.ts` that exports nothing but successfully type-checks (filled in task_15).
- MUST add scripts: `dev` (`tsx watch src/index.ts`), `build` (`tsc --build`), `start` (`node dist/index.js`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`).

</requirements>

## Subtasks

- [x] 13.1 Author `apps/api/package.json` with deps and scripts.
- [x] 13.2 Author `apps/api/tsconfig.json`.
- [x] 13.3 Create `apps/api/src/infrastructure/http/routes/` folder with a `.gitkeep` placeholder (replaced in task_14).
- [x] 13.4 Create placeholder `apps/api/src/index.ts` that imports `loadConfig` to prove dep wiring compiles.
- [x] 13.5 Verify `pnpm --filter @dialogus/api typecheck` passes.

## Implementation Details

Reference TechSpec § Implementation Design and ADR-004. Absence of `domain/` and `application/` folders is deliberate — Feature 001 introduces them when catalog arrives.

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/package.json` — template for Hono deps and scripts.
- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/tsconfig.json` — template.
- Foundation ADR-004: [Infrastructure-first layout for apps/api](adrs/adr-004.md).

### Dependent Files

- `./apps/api/package.json` (new)
- `./apps/api/tsconfig.json` (new)
- `./apps/api/src/index.ts` (new placeholder)
- `./apps/api/src/infrastructure/http/routes/.gitkeep` (new, placeholder)

### Related ADRs

- [ADR-004: Infrastructure-first layout for apps/api](adrs/adr-004.md) — dictates folder shape.

## Deliverables

- `apps/api/` scaffolded with package manifest, tsconfig, and infrastructure folder.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural checks (manifest keys, folder shape).
- Integration tests **(REQUIRED)** — `pnpm install` + `pnpm typecheck` pass with the new app.

## Tests

- Unit tests:
  - [x] `apps/api/package.json` declares dependencies `hono`, `@hono/node-server`, `pino`.
  - [x] `apps/api/package.json` declares workspace deps `@dialogus/shared@workspace:*` and `@dialogus/db@workspace:*`.
  - [x] Folder `apps/api/src/infrastructure/http/routes/` exists.
  - [x] Folders `apps/api/src/domain/` and `apps/api/src/application/` do NOT exist (ADR-004 enforcement).
  - [x] `tsconfig.json` extends root and has `outDir: './dist'`.
- Integration tests:
  - [x] `pnpm --filter @dialogus/api typecheck` exits 0.
  - [x] `pnpm install` succeeds with new workspace package.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `apps/api/` exists with expected folder shape.
- No empty `domain/` or `application/` folders present (ADR-004 compliance).
