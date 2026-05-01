# Task Memory: task_09.md

## Objective Snapshot

Catalog-namespace use cases (`searchGutendex`, `getGutendexBook`) shipped in `packages/catalog/src/application/`, plus shared `toBookFromGutendex` mapper and `RemoteBook` type. Barrel now exposes the application layer.

## Important Decisions

- Returned `RemoteBook` instead of strict `Book`. `RemoteBook = Pick<Book, 'gutendexId' | 'title' | 'authors' | 'languages' | 'subjects' | 'downloadUrlEpub' | 'downloadUrlTxt' | 'coverUrl'>`. Honest: remote books have no local id / status / timestamps. Aligns with techspec § API Endpoints ("without `id`/`status` — remote-only") and the explicit task test "ingestionStatus left out/undefined".
- Extended `GutendexSearchQuery` with optional `limit?: number` (additive port change in task_06's domain types). Unblocks the test "passes `limit` through to the client" and matches the techspec API endpoint table where `/api/catalog/search` accepts `?limit`.
- Use cases use a deps-first signature: `searchGutendex(deps, query)`, `getGutendexBook(deps, id)`. Mirrors the application-layer convention of dependency injection without a class wrapper.
- Errors (`GutendexUpstreamError`) propagate; use cases never catch — tested explicitly. Problem-Details middleware (task_11) maps them.

## Learnings

- Scaffold test at `__tests__/scaffold.test.ts` previously asserted "does not re-export anything from application/ at this layer". That assertion was tied to task_06's pre-application state and was dropped in this task. The infrastructure-not-exported assertion is unchanged ("constraint is permanent").
- Biome's `useSortedKeys` reorders re-exports alphabetically; types and runtime exports get split — accept the autofixed order rather than fighting it.

## Files / Surfaces

- `packages/catalog/src/application/searchGutendex.ts` (new)
- `packages/catalog/src/application/getGutendexBook.ts` (new)
- `packages/catalog/src/application/mappers/toBookFromGutendex.ts` (new — exports `RemoteBook`)
- `packages/catalog/src/domain/book/GutendexClient.port.ts` (added `limit?: number`)
- `packages/catalog/src/index.ts` (now exports use cases + `RemoteBook` + `toBookFromGutendex`)
- `packages/catalog/__tests__/scaffold.test.ts` (removed application-not-exported assertion)
- `packages/catalog/__tests__/application/searchGutendex.test.ts` (new — 6 cases)
- `packages/catalog/__tests__/application/getGutendexBook.test.ts` (new — 3 cases)

## Errors / Corrections

- Initial implementation tripped Biome's `useSortedKeys` rule on the barrel and import statements — autofixed via `biome check --write`.

## Ready for Next Run

- task_08 (`GutendexHttpClient` + MSW fixtures) must implement the `GutendexClient` port including the new `limit` field. The HTTP client should forward `limit` to the upstream API (Gutendex caps at 32/page) — the use case is unaware of how the limit is honored.
- task_13 (catalog routes + integration test) wires `searchGutendex` / `getGutendexBook` from the barrel + the http client adapter. Routes should map RemoteBook -> the response DTO defined in `@dialogus/shared/schemas/catalog` (task_03).
