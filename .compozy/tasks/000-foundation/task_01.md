---
status: completed
title: Initialize monorepo root
type: infra
complexity: low
dependencies: []
---

# Task 1: Initialize monorepo root

## Overview

Bootstrap the monorepo's structural files so downstream packages and apps have a consistent configuration surface. Creates the root `package.json`, pnpm workspace definition, TypeScript config, and basic ignore files that every subsequent task depends on.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `package.json` at repo root with `"type": "module"`, `"private": true`, `engines.node >= 22`, `packageManager: "pnpm@9.15.4"`.
- MUST create `pnpm-workspace.yaml` declaring `apps/*` and `packages/*`.
- MUST create root `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `moduleResolution: 'bundler'`, target ES2022, TypeScript 6.0 baseline (fallback `~5.9` if a peer rejects TS 6).
- MUST create `.nvmrc` pinning Node 22.13+.
- MUST create `.gitignore` covering `node_modules`, `dist`, `.next`, `.env`, `coverage`, OS files.
- Root scripts MUST include placeholders: `dev`, `build`, `test`, `lint`, `lint:fix`, `typecheck`, `db:generate`, `db:migrate`, `db:studio`, `db:reset`, `prepare` (some will dispatch to package scripts created in later tasks).

</requirements>

## Subtasks

- [x] 1.1 Run `pnpm init` and customize the generated `package.json` (name, scripts, engines, `packageManager`).
- [x] 1.2 Author `pnpm-workspace.yaml` with `apps/*` + `packages/*`.
- [x] 1.3 Author root `tsconfig.json` mirroring m5nita patterns with TS 6 options.
- [x] 1.4 Author `.nvmrc` and `.gitignore`.
- [x] 1.5 Wire all root scripts (dev, build, test, lint, lint:fix, typecheck, db:*, prepare).

## Implementation Details

Reference TechSpec "Development Sequencing → Build Order Step 1". Mirror conventions from the m5nita template files cited below.

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/package.json` — template for root scripts + `packageManager` pin.
- `/Users/igortullio/Developer/igortullio/m5nita/pnpm-workspace.yaml` — template (verbatim `apps/*` + `packages/*`).
- `/Users/igortullio/Developer/igortullio/m5nita/tsconfig.json` — template for strict compiler options.

### Dependent Files

- `./package.json` (new)
- `./pnpm-workspace.yaml` (new)
- `./tsconfig.json` (new)
- `./.nvmrc` (new)
- `./.gitignore` (new)

### Related ADRs

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — `packageManager` and `.nvmrc` are Day-1 polish items.

## Deliverables

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.nvmrc`, `.gitignore` all committed.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural validation of the manifest files.
- Integration tests for monorepo bootstrap **(REQUIRED)** — `pnpm install` completes cleanly on a fresh clone.

## Tests

- Unit tests:
  - [x] `package.json` parses as valid JSON with required fields (`name`, `type`, `packageManager`, `engines.node`, `scripts`).
  - [x] `pnpm-workspace.yaml` parses and lists exactly `apps/*` and `packages/*`.
  - [x] `tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, and `moduleResolution: bundler`.
  - [x] `.nvmrc` contents match `/^22\./`.
- Integration tests:
  - [x] `pnpm install` on a fresh checkout completes with exit code 0.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm install` completes on a fresh clone.
- Subsequent scaffolding tasks can add workspace packages without modifying these root files.
