---
status: completed
title: Implement envSchema + loadConfig with tests
type: backend
complexity: medium
dependencies:
  - task_05
---

# Task 6: Implement envSchema + loadConfig with tests

## Overview

Implement the single source of truth for environment variable validation inside `@dialogus/shared/config`. `loadConfig()` parses `process.env` once on startup via a Zod schema and throws a `ConfigError` carrying every missing/malformed field in one grouped message. Every app calls this at its entry point.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST define a Zod schema covering Foundation env vars: `NODE_ENV`, `DATABASE_URL`, `API_PORT`, `WEB_PORT`, `NEXT_PUBLIC_API_URL`, `LOG_LEVEL`. Future vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_MASTRA_URL`) are declared as `.optional()` so Foundation `.env.example` stays complete without breaking validation.
- MUST coerce `API_PORT` and `WEB_PORT` via `z.coerce.number().int().min(1).max(65535)` with defaults 3001 and 3000.
- MUST default `NODE_ENV` to `'development'`, `LOG_LEVEL` to `'info'`, and `NEXT_PUBLIC_API_URL` to `'http://localhost:3001'`.
- `loadConfig()` MUST throw `ConfigError` (from `@dialogus/shared/errors`, task_07) with a grouped message listing every invalid field when validation fails.
- MUST NOT silently succeed on invalid env — the throw is intentional fast-fail behavior per the PRD User Story.
- Signature reference: see TechSpec "Core Interfaces" for the exported `envSchema`, `DialogusEnv` type, and `loadConfig` signature.

</requirements>

## Subtasks

- [x] 6.1 Implement `envSchema` (Zod 4) per TechSpec signature.
- [x] 6.2 Implement `loadConfig()` that calls `envSchema.safeParse(process.env)` and throws `ConfigError` with grouped issues on failure.
- [x] 6.3 Export `DialogusEnv` TypeScript type inferred from schema.
- [x] 6.4 Write unit tests covering happy path, missing required field, and malformed port.

## Implementation Details

Reference TechSpec "Core Interfaces → @dialogus/shared/config". The schema should live at `packages/shared/src/config/index.ts` and re-export from `packages/shared/src/index.ts`.

### Relevant Files

- `/Users/igortullio/Developer/igortullio/m5nita/apps/api/src/index.ts` lines 13-24 — m5nita's direct `process.env` validation pattern (reference only; dIAlogus uses Zod).
- Product TechSpec "Env validation" section.
- Foundation PRD "Core Features → 5. Shared environment validation".

### Dependent Files

- `./packages/shared/src/config/index.ts` (modify: add schema + loadConfig)
- `./packages/shared/src/index.ts` (modify: re-export)
- `./packages/shared/__tests__/config.test.ts` (new)

### Related ADRs

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — `.env.example` must cover every schema field.

## Deliverables

- `envSchema` + `DialogusEnv` + `loadConfig()` exported from `@dialogus/shared/config`.
- Unit tests with 80%+ coverage **(REQUIRED)** — happy path and failure paths.
- Integration tests **(REQUIRED)** — `loadConfig()` called with a real `.env` file returns parsed values in task_15 api boot.

## Tests

- Unit tests:
  - [x] Happy path: valid env containing `DATABASE_URL=postgres://...` returns an object with all defaults applied.
  - [x] Missing `DATABASE_URL` throws `ConfigError` whose message mentions `DATABASE_URL`.
  - [x] Malformed `API_PORT='abc'` throws `ConfigError` whose message mentions `API_PORT`.
  - [x] Multiple missing fields produce a single grouped error listing each field.
  - [x] `NEXT_PUBLIC_API_URL` defaults to `http://localhost:3001` when absent.
  - [x] Optional future keys (`ANTHROPIC_API_KEY`, etc.) do NOT cause failure when absent.
- Integration tests:
  - [ ] Deferred to task_15 (apps/api boot invokes `loadConfig` against real env).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Invalid env fails at startup with a single grouped message; no silent fallback.
- Every app can import `{ loadConfig }` from `@dialogus/shared/config` without circular dependency.
