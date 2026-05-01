# Task Memory: task_10.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Ship the five library-namespace use cases (`addBookToLibrary`, `listLibrary`, `getBook`, `removeBook`, `restoreBook`) in `@dialogus/catalog` with deps-first signatures, no framework imports, and unit tests covering every happy + error path. Status: completed.

## Important Decisions

- New `Book` ID is generated in the use case via `node:crypto.randomUUID()` rather than relying on the DB `uuid_generate_v4()` default. The repo's `BookMapper.toPersistence` always sets `id: book.id`, and `DrizzleBookRepository.save` performs `INSERT ... ON CONFLICT (id) DO UPDATE`, so the use case must own the id.
- `addBookToLibrary` constructs the domain `Book` with `createdAt = updatedAt = new Date()`, `tags: []`, `rawHash: null`, `ingestionStatus: 'discovered'`, `ingestionError: null`, `deletedAt: null`. Returns whatever `repository.save` resolves with (the persisted row, which the adapter remaps).
- Two distinct `DuplicateBookError` messages: one for active duplicates (cites `existingBookId`); one for soft-deleted duplicates that explicitly references `POST /api/library/books/{id}/restore`. Both carry `existingBookId` so the Problem-Details middleware can echo it.
- `removeBook` rejects with `BookNotFoundError` for both the missing case and the already-soft-deleted case (per task spec: "treated as not-present").
- `restoreBook` always calls `repository.restore(id)` after a `findById` non-null check; the port's contract makes restore idempotent for already-active books, so the use case does not branch on `deletedAt`.

## Learnings

- `DrizzleBookRepository.findById` already returns soft-deleted rows (no `isNull(deletedAt)` filter), which is exactly what `restoreBook` needs.
- `DialogusError` subclasses surface `code` as a string property (`DUPLICATE_GUTENDEX_ID`, `BOOK_NOT_FOUND`), so tests assert on `.code` + `.existingBookId` via `toMatchObject`.

## Files / Surfaces

- New: `packages/catalog/src/application/{addBookToLibrary,listLibrary,getBook,removeBook,restoreBook}.ts`
- Modified: `packages/catalog/src/index.ts` (barrel re-exports all 7 use cases)
- New tests: `packages/catalog/__tests__/application/{addBookToLibrary,listLibrary,getBook,removeBook,restoreBook}.test.ts`

## Errors / Corrections

- Initial Biome run flagged formatting in `addBookToLibrary.test.ts`, `listLibrary.ts`, and `removeBook.test.ts`; auto-fixed with `pnpm lint:fix`. Final lint run shows only the 5 pre-existing baseline warnings.

## Ready for Next Run

- Task 13 (`/api/catalog/*` routes) and task 14 (`/api/library/*` routes) can import all 7 use cases from `@dialogus/catalog` barrel: `addBookToLibrary`, `listLibrary`, `getBook`, `removeBook`, `restoreBook`, `searchGutendex`, `getGutendexBook`.
- The `addBookToLibrary` deps shape is `{ repository, client }` — a single deps object with both ports — vs. `{ client }` for the catalog-namespace use cases. Routes must construct the deps object accordingly.
