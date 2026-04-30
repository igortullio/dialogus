# Task Memory: task_18.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

T018: Catalog smoke + closure. Verify all PRD exit criteria, extend README, annotate _prd.md, commit closure.

## Important Decisions

- `CHOKIDAR_USEPOLLING=1` added to `apps/web` dev script — kqueue/FSEvents EMFILE limit in monorepo prevents Turbopack from watching routes without polling. Added to `package.json` and scaffold test updated to match.
- Removed `.js` extensions from all relative imports in `packages/shared/src/` — Turbopack cannot resolve `.ts` files via `.js` extension references; bundler moduleResolution doesn't need them.
- `experimental.extensionAlias` removed from `next.config.ts` — Next.js 16 Turbopack doesn't support this option.
- `ListResult.total` added to domain port + `DrizzleBookRepository` runs parallel COUNT(*) to fix `meta.count` always returning page size instead of total.

## Learnings

- `next dev` (Turbopack) in this monorepo requires `CHOKIDAR_USEPOLLING=1` to avoid EMFILE watcher failures that prevent route detection.
- TypeScript ESM `.js` import extensions cause Turbopack module resolution failures for monorepo source files — strip them when `moduleResolution: "bundler"` is in effect.
- `packages/ingestion` has a pre-existing flaky timing test (`expect(second - first).toBeGreaterThanOrEqual(1000)`) not caused by T018 changes.

## Files / Surfaces

- `packages/shared/src/schemas/library.ts`, `book.ts`, `catalog.ts`, `index.ts` — stripped `.js` extensions
- `packages/shared/src/http/index.ts`, `packages/shared/src/index.ts`, `packages/shared/src/config/index.ts`, `packages/shared/src/http/cursor.ts` — stripped `.js` extensions
- `apps/web/next.config.ts` — removed extensionAlias
- `apps/web/package.json` — added CHOKIDAR_USEPOLLING=1 to dev script
- `apps/web/__tests__/scaffold.test.ts` — updated dev script assertion
- `packages/catalog/src/domain/book/BookRepository.port.ts` — added `total: number` to ListResult
- `packages/catalog/src/infrastructure/persistence/DrizzleBookRepository.ts` — parallel COUNT(*) query
- `apps/api/src/infrastructure/http/routes/library.ts` — use result.total for meta.count
- 6 test files updated for ListResult.total mock shape
- `README.md` — added "API Problems" + "Catalog (feature 001)" sections
- `.compozy/tasks/001-catalog/_prd.md` — appended Exit Criteria Verification

## Errors / Corrections

- Biome format errors in `apps/api/src/index.ts` and `DrizzleBookRepository.ts` — fixed with `pnpm biome format --write`
- DrizzleBookRepository tests expected 1x select call but COUNT added second — fixed assertions to 2x

## Ready for Next Run

T018 complete. Feature 001 closed. Feature 002 (book-ingestion) can begin.
