---
status: completed
title: Scaffold @dialogus/shared package
type: backend
complexity: low
dependencies:
  - task_01
---

# Task 5: Scaffold @dialogus/shared package

## Overview

Create the `@dialogus/shared` workspace package with its `package.json` (multi-entry `exports` map), `tsconfig.json` (extending root), empty source barrels for `config`, `errors`, `types`, and `schemas`, and placeholder test setup. This package is the foundation for env validation, error classes, and shared Zod schemas consumed by every other package and app.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `packages/shared/package.json` with `"name": "@dialogus/shared"`, `"private": true`, `"type": "module"`, `"main": "./src/index.ts"`, `"types": "./src/index.ts"`.
- MUST declare `exports` map with keys `.`, `./config`, `./errors`, `./types`, `./schemas/health` — all pointing directly at `./src/*` (no build step in dev).
- MUST add `zod` (v4) as a dependency.
- MUST author `packages/shared/tsconfig.json` extending the root config.
- MUST create empty barrel stubs `src/index.ts`, `src/config/index.ts`, `src/errors/index.ts`, `src/types/index.ts`, `src/schemas/health.ts` (content added in task_06 and task_07).
- MUST add `typecheck` and `test` scripts invoking `tsc --noEmit` and `vitest run`.
- MUST add `vitest` devDependency at the package level.

</requirements>

## Subtasks

- [x] 5.1 Author `packages/shared/package.json` with exports map and deps.
- [x] 5.2 Author `packages/shared/tsconfig.json` extending root.
- [x] 5.3 Create empty barrel stubs under `src/`.
- [x] 5.4 Verify `pnpm --filter @dialogus/shared typecheck` passes on empty stubs.

## Implementation Details

Reference TechSpec "System Architecture → packages/@dialogus/shared" and "Build Order Step 3". The multi-entry `exports` pattern mirrors the product ARCHITECTURE.md described for `@dialogus/core` in the old plan — relocated to `shared` after the merge per product ADR-003.

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/packages/shared/package.json` — template for multi-entry exports.
- Product TechSpec "Packages" table.

### Dependent Files

- `./packages/shared/package.json` (new)
- `./packages/shared/tsconfig.json` (new)
- `./packages/shared/src/index.ts` (new stub)
- `./packages/shared/src/config/index.ts` (new stub)
- `./packages/shared/src/errors/index.ts` (new stub)
- `./packages/shared/src/types/index.ts` (new stub)
- `./packages/shared/src/schemas/health.ts` (new stub)

## Deliverables

- `packages/shared/` scaffolded with all files listed above.
- Unit tests with 80%+ coverage **(REQUIRED)** — sanity import tests asserting every export path resolves.
- Integration tests **(REQUIRED)** — `pnpm -r typecheck` passes with the new package present.

## Tests

- Unit tests:
  - [x] `import '@dialogus/shared'` resolves (main barrel).
  - [x] `import '@dialogus/shared/config'` resolves.
  - [x] `import '@dialogus/shared/errors'` resolves.
  - [x] `import '@dialogus/shared/types'` resolves.
  - [x] `import '@dialogus/shared/schemas/health'` resolves.
- Integration tests:
  - [x] `pnpm --filter @dialogus/shared typecheck` exits 0.
  - [x] `pnpm install` re-runs without errors after package is added to workspace.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- All five module entry points resolve from any workspace package via `@dialogus/shared/*`.
- Package builds via `tsc --noEmit` with no errors on empty stubs.
