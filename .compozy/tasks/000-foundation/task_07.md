---
status: completed
title: Implement error hierarchy + health schema with tests
type: backend
complexity: low
dependencies:
  - task_05
---

# Task 7: Implement error hierarchy + health schema with tests

## Overview

Implement the `DialogusError` hierarchy in `@dialogus/shared/errors` and the Zod schema for the `/health` response in `@dialogus/shared/schemas/health`. Both are consumed by `apps/api`, `apps/web`, and future features that need common error typing and shared response shapes.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST define `DialogusError` with `code: string`, `message`, optional `cause`, and `name` set from `new.target.name` so subclass names survive stringification.
- MUST define subclasses `ConfigError`, `NotFoundError`, `ValidationError` that inherit from `DialogusError`.
- MUST define `healthResponseSchema` (Zod 4) shaped `{ api: z.literal('up'), db: z.enum(['up', 'down']), pgboss: z.enum(['up', 'down']) }` and export the inferred type `HealthResponse`.
- Schema MUST live at `packages/shared/src/schemas/health.ts` and be re-exported from the `./schemas/health` entry point.
- Subclasses MUST be distinguishable via `instanceof` checks in TypeScript 6 strict mode.

</requirements>

## Subtasks

- [x] 7.1 Implement `DialogusError` base class with `code`, `cause`, and subclass-aware `name`.
- [x] 7.2 Implement subclasses `ConfigError`, `NotFoundError`, `ValidationError`.
- [x] 7.3 Implement `healthResponseSchema` + `HealthResponse` type.
- [x] 7.4 Wire re-exports from `packages/shared/src/index.ts`.
- [x] 7.5 Write unit tests for each error subclass and the schema.

## Implementation Details

Reference TechSpec "Core Interfaces → @dialogus/shared/errors" and API Endpoints table for the health response shape. Classes live at `packages/shared/src/errors/index.ts`; schema at `packages/shared/src/schemas/health.ts`.

### Relevant Files

- Product TechSpec "Core Interfaces" — `DialogusError` class signature.
- Foundation TechSpec "API Endpoints" — `/health` response shape.

### Dependent Files

- `./packages/shared/src/errors/index.ts` (modify: implement hierarchy)
- `./packages/shared/src/schemas/health.ts` (modify: implement schema)
- `./packages/shared/src/index.ts` (modify: re-export)
- `./packages/shared/__tests__/errors.test.ts` (new)
- `./packages/shared/__tests__/schemas.test.ts` (new)

### Related ADRs

- [ADR-004: Infrastructure-first layout for apps/api](adrs/adr-004.md) — `healthResponseSchema` is consumed by `apps/api/src/infrastructure/http/routes/health.ts`.

## Deliverables

- `DialogusError`, `ConfigError`, `NotFoundError`, `ValidationError` exported from `@dialogus/shared/errors`.
- `healthResponseSchema` + `HealthResponse` exported from `@dialogus/shared/schemas/health`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests **(REQUIRED)** — consumed by task_14 (/health handler) and task_17 (web fetcher).

## Tests

- Unit tests:
  - [x] `new ConfigError('MISSING_ENV', 'x')` → `err.code === 'MISSING_ENV'` and `err.name === 'ConfigError'`.
  - [x] `err instanceof DialogusError` is true for every subclass.
  - [x] `err.cause` is preserved when passed.
  - [x] `healthResponseSchema.safeParse({ api: 'up', db: 'up', pgboss: 'up' })` returns success.
  - [x] `healthResponseSchema.safeParse({ api: 'up', db: 'unknown', pgboss: 'up' })` returns failure with a clear issue on `db`.
  - [x] `healthResponseSchema.safeParse({})` returns failure listing all missing fields.
- Integration tests:
  - [ ] Deferred to task_14 (handler emits a shape that passes the schema) and task_17 (fetcher validates responses with this schema).
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- Error subclasses are distinguishable via `instanceof` and carry `code`/`cause`/`name`.
- `healthResponseSchema` is the single source of truth for the `/health` contract across api and web.
