---
status: completed
title: Configure Biome + pre-commit hook
type: infra
complexity: low
dependencies:
  - task_01
---

# Task 2: Configure Biome + pre-commit hook

## Overview

Install and configure Biome as the single lint + format tool and wire `.githooks/pre-commit` so every commit runs lint + typecheck + unit tests. The pre-commit hook is the gatekeeper that enforces the 30-second feedback-loop goal from the PRD.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add Biome 2 as a devDependency at the repo root.
- MUST create `biome.json` adapted from m5nita with `indentWidth: 2`, `lineWidth: 100`, `quoteStyle: 'single'`, `semicolons: 'asNeeded'`, `noExcessiveCognitiveComplexity` at level warn (max 15), excludes for `node_modules`, `dist`, `build`, `coverage`, `.next`, `*.gen.ts`, `drizzle`.
- MUST create `.githooks/pre-commit` as a plain shell script running `pnpm lint && pnpm typecheck && pnpm test`, exiting non-zero on any failure.
- MUST set `prepare` root script to `git config core.hooksPath .githooks || true` so `pnpm install` activates the hook.
- Pre-commit runtime MUST stay under 30 seconds on a typical change (verified in task_21 smoke).
- Integration tests MUST NOT run in the pre-commit hook.

</requirements>

## Subtasks

- [x] 2.1 Add `@biomejs/biome` devDependency and verify `biome --version`.
- [x] 2.2 Author `biome.json` adapted from m5nita, omitting rules that do not apply to dIAlogus (`.superpowers`, `.claude/worktrees`).
- [x] 2.3 Author `.githooks/pre-commit` shell script with `set -e` semantics.
- [x] 2.4 Verify `pnpm install` activates the hook via `prepare`.

## Implementation Details

Reference TechSpec "Development Sequencing → Build Order Step 1" (sub-bullet on `.githooks/pre-commit` verbatim from m5nita) and ADR-007 product-level (test harness scope).

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/biome.json` — adapt verbatim minus project-specific excludes.
- `/Users/igortullio/Developer/igortullio/m5nita/.githooks/pre-commit` — shell hook, 3 lines, verbatim.
- `/Users/igortullio/Developer/igortullio/m5nita/package.json` — shows how `prepare` wires hooks via Corepack + git config.

### Dependent Files

- `./biome.json` (new)
- `./.githooks/pre-commit` (new, executable)
- `./package.json` (modify: add Biome devDependency, `prepare` script)

### Related ADRs

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — pre-commit hook is part of Day-1 quality gates.

## Deliverables

- `biome.json` committed.
- `.githooks/pre-commit` committed with executable bit set (`chmod +x`).
- `@biomejs/biome` pinned in `devDependencies`.
- Unit tests with 80%+ coverage **(REQUIRED)** — structural validation of `biome.json` and the hook script.
- Integration test **(REQUIRED)** — hook blocks a deliberately broken commit.

## Tests

- Unit tests:
  - [x] `biome.json` parses and includes the mandated rules (`noExcessiveCognitiveComplexity` warn, level 15).
  - [x] `.githooks/pre-commit` starts with `#!/bin/sh` and contains `pnpm lint`, `pnpm typecheck`, `pnpm test` in that order.
  - [x] `pnpm lint` on an intentionally malformed file exits non-zero.
- Integration tests:
  - [x] With `.githooks` active, `git commit` on a file containing a Biome lint error is rejected with exit code 1.
  - [x] `pnpm install` re-runs `prepare` and activates the hook path.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- A deliberately broken commit (lint error) is blocked by pre-commit.
- `pnpm lint` completes in under 10 seconds on the current repo.
