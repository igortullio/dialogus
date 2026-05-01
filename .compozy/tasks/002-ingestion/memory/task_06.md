# Task Memory: task_06.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Implement `GutendexDownloader` adapter — polite fetch (User-Agent + bottleneck rate limit + 0-1s jitter) → streaming download to `./storage/raw/<id>.<ext>` → incremental SHA-256 → exponential-backoff retry on 5xx/network errors → `DownloadError` on 4xx/exhausted retries.

## Important Decisions

- **`response.body.cancel()` hangs in MSW v2/Node** when responses use `HttpResponse.text()`. The downloader's `discardBody` therefore drains via `await response.text()` — error responses are tiny (a few bytes), so the "small read" cost is negligible.
- **Constructor accepts test-only injection seams** (`fetchImpl`, `limiterOptions`, `retryBaseDelayMs`, `maxJitterMs`, `random`, `sleep`) — keeps unit tests fast (real bottleneck minTime=1000 only used in the dedicated rate-limit assertion) without leaking test concerns into runtime defaults.
- **MSW happy-path response uses `new HttpResponse(body, { headers })`** instead of `HttpResponse.arrayBuffer(buf)` — the latter's TS signature requires `ArrayBuffer | SharedArrayBuffer` and rejects Node `Buffer` (NonSharedBuffer). The constructor accepts `BodyInit` which is type-compatible.
- **URL path conventions** for the aleph mirror: `cache/epub/<id>/pg<id>.epub.noimages` for EPUB, `cache/epub/<id>/pg<id>.txt.utf8` for TXT.
- **Scaffold test was tightened**: `bottleneck` is now an asserted dep (replacing the prior "not yet pulled in" exclusion), and the negative assertion narrowed to the remaining task-7/task-9 adapter libs.

## Learnings

- `Readable.fromWeb(response.body)` does not type-check directly because Node stream typings expect `ReadableStream<any>` while fetch yields `ReadableStream<Uint8Array<ArrayBuffer>>`. A single `as unknown as Parameters<typeof Readable.fromWeb>[0]` cast at the boundary is the cleanest narrowing — both share the runtime contract.
- bottleneck import in ESM: `import Bottleneck from 'bottleneck'` works because `esModuleInterop: true`. The library ships a `default` export that is the constructor.
- MSW v2's `setupServer` handlers from `msw/node` accept `{ onUnhandledRequest: 'error' }` to surface accidental real-network calls. Use it on every Node test that mocks fetch.
- A `Transform` stream that mutates state via closure (`hash.update(chunk)`, `bytes += chunk.length`) and forwards chunks unchanged to a downstream `createWriteStream` is the standard "tee + measure" pattern for streaming-with-side-effects in Node.

## Files / Surfaces

- New: `packages/ingestion/src/infrastructure/external/GutendexDownloader.ts`.
- New fixtures: `packages/ingestion/__fixtures__/gutenberg/{handlers.ts, sample.epub, sample.txt}`.
- New tests: `packages/ingestion/__tests__/infrastructure/external/GutendexDownloader.test.ts` (12 cases).
- Modified: `packages/ingestion/package.json` (+`bottleneck@^2`, +`msw@^2.4.9` devDep).
- Modified: `packages/ingestion/__tests__/scaffold.test.ts` (asserts `bottleneck` present; removed from "not yet pulled in" list).

## Errors / Corrections

- First test pass timed out on 4xx path: `response.body.cancel()` was hanging inside the MSW interceptor. Switched to `await response.text()` to drain the small error body.
- Lint round 1: 2 `noNonNullAssertion` violations on the rate-limit timestamp pair (`first!`, `second!`). Replaced with `as [number, number]` destructuring tuple narrowing — the `expect(toHaveLength(2))` guard immediately above proves the elements exist.
- Typecheck round 1: `HttpResponse.arrayBuffer(Buffer)` signature mismatch (`NonSharedBuffer` ≠ `ArrayBuffer | SharedArrayBuffer`). Switched to `new HttpResponse(body, ...)` constructor which accepts `BodyInit`.

## Ready for Next Run

- task_10 (download stage handler) can construct `new GutendexDownloader()` with zero options for production wiring; `apps/worker` boot just needs to inject it into `StageDeps`.
- task_07 (OpenAI / Mock embedding adapters) has the MSW + bottleneck pattern available to copy; the per-adapter rate limit knob lives in the constructor like this one.
- Storage path defaults to `./storage/raw` relative to `process.cwd()`; integration tests in task_16 should set a dedicated `storageDir` per run (or use a temp dir like the unit tests already do).
