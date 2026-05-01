# Task Memory: task_03.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Centralize the catalog/library wire DTOs into `@dialogus/shared/schemas/{book,catalog,library}.ts` so apps/api task_13/task_14 routes can validate requests + responses, and apps/web stops re-defining them ad-hoc.

## Important Decisions

- **snake_case wire DTOs** (deviates from task spec literal "camelCase"). Repo convention is snake_case across all `@dialogus/shared/schemas/*` and `apps/web/src/lib/api/_schemas.ts`. The catalog `Book` domain entity stays camelCase; the route boundary maps domain → snake_case DTO.
- **Reuse `ingestionStatusEnum` from `./ingestion.ts`** (10-value set: `discovered | downloading | cleaning | parsing | chunking | summarizing | embedding | indexing | ready | failed`). Task spec text mentions a 7-value set that predates ADR-008 in feature 002 — the canonical post-ADR-008 set is what the repo ships and what the existing test `ingestion.test.ts` pins.
- **`raw_hash` is omitted from `bookDtoSchema`** per task spec. It is an internal SHA-256 of the raw Gutendex JSON used for change detection — not a client concern. `.strip()` default silently drops it if present in upstream input.
- **`gutendexBookSchema` is the raw Gutendex response shape** (with `formats` map, optional `translators`, `bookshelves`, `copyright`, `media_type`, `download_count`). Distinct from `apps/web/_schemas.ts`'s name-clashing schema, which actually models the post-mapping shape; that is a stale ad-hoc workaround until the catalog routes ship.
- **`include_deleted` uses `z.stringbool()`** (Zod 4.3.6 has it). `z.coerce.boolean()` would treat `'false'` as `true`, which is wrong for query-string parsing.
- `.strip()` is the Zod v4 default — no explicit `.strip()` call needed.
- `z.coerce.number()` for `gutendex_id` and `limit` to handle query/JSON string coercion.

## Learnings

- `apps/web/src/lib/api/_schemas.ts` exists because `@dialogus/shared/schemas/{book,catalog,library}` was missing — task 03 was deferred while feature 004 shipped. Migrating apps/web to the shared schemas is **out of scope** for this task; record as a follow-up.
- Zod 4 `z.stringbool()` truthy defaults: `['true','1','yes','on','y','enabled']`; falsy: `['false','0','no','off','n','disabled']`.

## Files / Surfaces

- `packages/shared/src/schemas/book.ts` (new)
- `packages/shared/src/schemas/catalog.ts` (new)
- `packages/shared/src/schemas/library.ts` (new)
- `packages/shared/src/schemas/index.ts` (barrel)
- `packages/shared/package.json` (exports map)
- `packages/shared/__tests__/schemas/book.test.ts` (new)
- `packages/shared/__tests__/schemas/catalog.test.ts` (new)
- `packages/shared/__tests__/schemas/library.test.ts` (new)

## Errors / Corrections

(none)

## Ready for Next Run

- Follow-up: migrate `apps/web/src/lib/api/_schemas.ts` `bookSchema` / `gutendexBookSchema` consumers to import from `@dialogus/shared/schemas/book` once task_13/14 ship. Note: apps/web's local `bookSchema` requires `raw_hash` — drop that requirement during migration since the canonical wire DTO omits it.
