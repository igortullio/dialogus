# Task Memory: task_07.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Land `DrizzleBookRepository` + `BookMapper` in `@dialogus/catalog` so `apps/api` can wire the catalog use cases (tasks 09/10) against real Postgres. Adapter satisfies the `BookRepository` port from task_06 with cursor pagination per ADR-005 and soft-delete/restore per techspec.

## Important Decisions

- `save` uses `INSERT ... ON CONFLICT (id) DO UPDATE` (single-statement upsert) instead of a check-then-insert/update split. The `set` clause omits `id` and `createdAt` so the original row's `createdAt` is preserved on conflict; everything else (including `deletedAt`) is overwritten by the entity passed in. This is what lets future use cases re-save a fetched-and-mutated `Book` without separate `update` plumbing.
- `softDelete` and `restore` set `updatedAt: sql\`now()\`` (server clock) rather than passing a JS `Date`, matching the techspec's "set deleted_at = now()" wording and avoiding clock skew between app and DB.
- `restore` checks `returning()` for an empty array to throw `BookNotFoundError`. The use case layer doesn't need a separate `findById` precheck.
- `list` uses the limit + 1 trick to compute `nextCursor` without a second query; the +1 sentinel row is sliced off before mapping. `nextCursor` is the last in-page row, never the sentinel.
- Cursor predicate is built with `sql\`(${books.createdAt}, ${books.id}) < (${cursor.createdAt.toISOString()}, ${cursor.id})\``. `cursor.createdAt` is serialized to ISO string before parameterization so postgres-js gets a stable timestamptz literal regardless of driver heuristics.
- `BookMapper.toPersistence` deep-copies `authors`, `languages`, `subjects`, `tags` (the readonly→mutable boundary). This also means stored rows are independent of the domain entity reference passed in — mutating the input afterwards cannot leak into the row.
- The `@dialogus/catalog` scaffold test was loosened: `@dialogus/db`, `drizzle-orm`, `postgres` are now legitimate deps (db) / peerDeps (drizzle-orm + postgres) for the infrastructure layer. The "no HTTP client" assertion stays — task_08 introduces lru-cache/undici via the Gutendex client.

## Learnings

- The Drizzle row type from `typeof books.$inferSelect` carries the column types directly, so `BookRow` matches the domain `Book` field-by-field with one quirk: row arrays are mutable and domain arrays are `readonly`. `toDomain` benefits (assignment is automatic); `toPersistence` needs `.map(...)` for `authors` and `[...arr]` for the string arrays to satisfy the writable target type.
- Biome's `noThenProperty` blocks the "thenable mock" trick (returning `{ then, returning }` from `where()`). The clean alternative is to vary the mock shape: when the test exercises `.where().returning()` (restore), make `.where()` return `{ returning }`; when it exercises `await db.update().set().where()` (softDelete), use `mockResolvedValue(undefined)` so `await` short-circuits the chain. The mock helper picks the shape based on whether `updateReturning` was supplied.
- `import type { books }` is the lint-correct form in the mapper because `books` only appears inside `typeof ...` (verified by Biome's `useImportType`). The repository file imports `books` as a value because it appears in `eq(books.id, ...)`, `desc(books.createdAt)`, etc.
- `noUncheckedIndexedAccess` in tsconfig flags `trimmed[trimmed.length - 1]` even after a `hasNext` check — solved by typing the result as `BookRow | undefined` and gating `nextCursor` on the truthiness of `last`.

## Files / Surfaces

- `packages/catalog/src/infrastructure/persistence/DrizzleBookRepository.ts` (new) — adapter implementing `BookRepository`.
- `packages/catalog/src/infrastructure/persistence/mappers/BookMapper.ts` (new) — `toDomain` + `toPersistence`, plus `BookRow`/`BookInsert` type aliases re-exported for tests + downstream use cases.
- `packages/catalog/__tests__/infrastructure/persistence/DrizzleBookRepository.test.ts` (new) — 18 unit tests using mocked Drizzle chains.
- `packages/catalog/__tests__/infrastructure/persistence/mappers/BookMapper.test.ts` (new) — 11 round-trip tests covering every column + edge cases.
- `packages/catalog/package.json` — added `@dialogus/db@workspace:*` to deps, `drizzle-orm`/`postgres` to peerDependencies (and devDependencies so the workspace install resolves them).
- `packages/catalog/__tests__/scaffold.test.ts` — relaxed the "no @dialogus/db at the domain layer" assertion (replaced with positive `peerDependencies` check + a still-strict "no HTTP client" assertion for task_08).

## Errors / Corrections

- First mock used a thenable shape (`{ then, returning }`) — Biome flagged `noThenProperty`. Fixed by branching the mock factory on whether `updateReturning` was supplied.
- First mapper had `import { books }` as value — Biome's `useImportType` flagged it because `books` only appears in `typeof ...`. Fixed to `import type`.

## Ready for Next Run

- Task 08 (`GutendexHttpClient`) can land independently; no shared state with task 07 beyond the package barrel.
- Task 10 (library use cases) can use the repository directly: `new DrizzleBookRepository(db)`. `db` is the existing `Database` from `@dialogus/db/client`.
- Integration tests deferred to task 14 — the repository's tuple-cursor SQL has not yet been validated against real Postgres. Add `library.integration.test.ts` and `cursor.integration.test.ts` against Testcontainers there.
- The repository defaults to `limit = 20` if the caller omits it. If routes want a different default, pass it explicitly; do not change the constant without updating the techspec.
