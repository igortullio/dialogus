# Task Memory: task_08.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Ship `GutendexHttpClient` (port adapter) + committed MSW fixtures + unit tests under `packages/catalog`.

## Important Decisions

- New error class `GutendexValidationError` (code `GUTENDEX_VALIDATION_FAILED`) extends `DialogusError`; mirrors existing `GutendexUpstreamError` pattern. Maps to `gutendex-validation-failed` Problem Details slug — middleware wiring lives in task_13 (route surface), out of scope here.
- Cache value is the already-mapped camelCase domain DTO (`GutendexSearchResult` for search, `GutendexBook` for detail) — avoids re-mapping on hits and matches ADR-004 wording.
- `LRUCache<string, GutendexSearchResult | GutendexBook>` with `'books' in cached` / `'id' in cached` discriminator narrowing instead of `as` casts (lru-cache 11 forbids `unknown` value type).
- Cache key shape `GET /books?<sortedQueryString>` (no `Authorization`/cookies in scope; gutendex is unauthenticated). `languages` are sorted alphabetically before serialization so `['en','pt']` and `['pt','en']` collide on the same key.
- Retry budget: `maxRetries = 1` (i.e., 2 total attempts) with exponential `retryBaseDelayMs * 2 ** attempt`. Network errors and 5xx are retryable; 4xx is fatal.
- `fetchJson` was refactored into `attemptFetch` returning a `{kind:'ok'|'fatal'|'retryable'}` discriminated union to clear Biome `noExcessiveCognitiveComplexity` (max 15).
- TTL eviction test uses `cacheTtlMs: 25` + real timers (`await setTimeout 60`) instead of fake timers, because `msw/node` interceptors hang under fake-clock conditions and lru-cache 11 has no clock injection point.

## Learnings

- `LRUCache<K, V>` from `lru-cache@11` requires `V` to extend `{}` — `unknown` does not satisfy the constraint, so domain types or unions are needed.
- MSW v2 handlers are processed FIFO: stacking two `http.get(url, …)` registrations with `server.use(a, b)` makes `a` win; the inline counter in `b` never increments. Tests must register exactly one handler per URL.
- Biome's `noNonNullAssertion` rule blocks `arr[0]!` even in tests; destructuring with a fall-through `if (!first) throw` keeps types narrow without an assertion.

## Files / Surfaces

- `packages/catalog/src/infrastructure/external/GutendexHttpClient.ts` (new)
- `packages/catalog/src/domain/book/BookError.ts` (added `GutendexValidationError`)
- `packages/catalog/src/index.ts` (exports the new error class)
- `packages/catalog/__fixtures__/gutendex/{handlers.ts,search-don-quixote.json,book-996.json,search-machado.json,5xx.json,validation-failure.json}` (new)
- `packages/catalog/__tests__/infrastructure/external/GutendexHttpClient.test.ts` (new)
- `packages/catalog/__tests__/scaffold.test.ts` (updated to assert lru-cache + msw presence — old assertion was a forward-deferred check pointing here)
- `packages/catalog/package.json` (added `lru-cache@^11`, `msw@^2`)

## Errors / Corrections

- Initial attempt added redundant `fiveHundredHandler()` + inline counting handler in the same `server.use(...)` call; counter never incremented. Replaced with a single counting handler.
- First pass typed cache as `LRUCache<string, unknown>`; tsc rejected (`unknown` violates `{}` constraint). Switched to a tagged union with `'books' in cached` / `'id' in cached` narrowing.
- `fetchJson` initially had cognitive complexity 17 (Biome warns at 15). Extracted `attemptFetch` helper returning a `FetchOutcome` discriminated union to drop complexity.

## Ready for Next Run

- Task_13 (catalog routes) needs to extend `apps/api/src/infrastructure/http/middleware/problem.ts` to map `GutendexValidationError` (code `GUTENDEX_VALIDATION_FAILED`) → 502 Problem Details with slug `gutendex-validation-failed`. Currently the middleware falls through to generic `validation-failed` (400), which is wrong for upstream-shape failures.
- MSW fixtures are reusable: import from `@dialogus/catalog/__fixtures__/gutendex/handlers` (or relative path inside the same package). Other features needing Gutendex mocking can `setupServer(...happyPathHandlers)` and override per test.
- `FIXTURE_BASE_URL = 'https://gutendex.test'` — pass it via `new GutendexHttpClient({ baseUrl: FIXTURE_BASE_URL })` so MSW can intercept.
- Pre-existing flake in `packages/ingestion/__tests__/infrastructure/external/GutendexDownloader.test.ts:158` ("serializes back-to-back calls at least minTime=1000ms apart") fails ~30% under full-repo concurrent test runs, passes in isolation. Unrelated to this task. Worth tightening Bottleneck timing in a future patch.
