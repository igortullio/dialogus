# Task Memory: task_06.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Scaffold `@dialogus/catalog` with hexagonal folder layout and ship the **domain layer only**: `Book` entity, `BookRepository.port`, `GutendexClient.port`, and `BookError` hierarchy (`DuplicateBookError`, `BookNotFoundError`, `GutendexUpstreamError`) extending `DialogusError`. No Drizzle, no HTTP client, no use cases yet — those land in tasks 07/08/09/10. Public barrel exports domain only.

## Important Decisions

- `IngestionStatus` declared **inside `@dialogus/catalog/domain/book`** (not imported from `@dialogus/db` or `@dialogus/shared`). Reason: the listed dep `task_03` (which republishes the enum from `@dialogus/shared`) is still pending in `_tasks.md` and the schemas are absent on disk; the task spec explicitly forbids a Drizzle dep at this layer. Defining the enum where the bounded context owns it keeps the domain free of upstream deps and matches the techspec rule "Package hexagon applies inside `@dialogus/catalog`". Values mirror the canonical 7-tuple already enforced by `books_ingestion_status_check`. Once task_03 lands, downstream packages converge on `@dialogus/shared`; until then, both `@dialogus/db/schema` and `@dialogus/catalog/domain` carry the same literal tuple.
- `DuplicateBookError` carries an optional `existingBookId` field so the route layer can surface the existing UUID in Problem Details (see techspec error envelope example: `existing_book_id` extension member). Constructor accepts `(detail: string, opts?: { existingBookId?: string; cause?: unknown })`.
- `GutendexUpstreamError` carries `upstreamStatus: number | null` as a public readonly field so `apps/api` can map it into RFC 9457 `gutendex-upstream-error` responses with the upstream status visible.
- Ports live as `interface` declarations (not classes) per the m5nita pattern (`PoolRepository.port.ts`).

## Learnings

- `@dialogus/shared/errors` already defines `DialogusError` with `(code, message, cause?)` constructor — catalog errors just call `super(...)` with that shape. Existing catalog errors must hard-code the `code` value rather than accept it from the caller (different from `DialogusError` directly).
- Repo uses `vitest@4` and the root `vitest.config.ts` collects `__tests__/**/*.test.ts` from every workspace package; no per-package config needed for unit tests. Coverage uses `@vitest/coverage-v8` (already a devDep on `@dialogus/db`).
- `pnpm-workspace.yaml` includes `packages/*`, so a new `packages/catalog/` is auto-discovered after `pnpm install`.
- Biome formatter: single quotes, no semicolons, 2-space indent, 100-col width.

## Files / Surfaces

- New: `packages/catalog/package.json`, `packages/catalog/tsconfig.json`.
- New: `packages/catalog/src/index.ts` (barrel, domain-only exports).
- New: `packages/catalog/src/domain/book/Book.ts`, `IngestionStatus.ts`, `BookRepository.port.ts`, `GutendexClient.port.ts`, `BookError.ts`.
- New empty placeholders are intentionally avoided — `src/application/` and `src/infrastructure/persistence/`, `mappers/`, `external/` directories are created on disk but kept empty until later tasks (no `.gitkeep`, no barrel — git only tracks files that contain content; tests assert the barrel does not export from `infrastructure/`).
- New: `packages/catalog/__tests__/scaffold.test.ts` (package.json + barrel + folder shape).
- New: `packages/catalog/__tests__/domain/book/BookError.test.ts` (error hierarchy).
- New: `packages/catalog/__tests__/domain/book/Book.test.ts` (entity type-level guard if useful).

## Errors / Corrections

- (none)

## Ready for Next Run

- Tasks 07/08/09/10 can `import { Book, BookRepository, GutendexClient, DuplicateBookError, BookNotFoundError, GutendexUpstreamError, IngestionStatus, INGESTION_STATUS_VALUES } from '@dialogus/catalog'`.
- Catalog domain has no runtime deps beyond `@dialogus/shared/errors` (re-export of `DialogusError`).
- Verification at completion: `pnpm typecheck`, `pnpm test`, and `pnpm exec biome check .` all green from repo root; catalog vitest coverage at 100% (target ≥80%); 5 pre-existing baseline lint warnings unchanged.
