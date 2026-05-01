# Task Memory: task_15.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Wire `apps/api/src/index.ts` end-to-end: `loadConfig()` → `createDatabase` → Hono app → mount `/health` factory from task_14 → `serve()` on `API_PORT` → graceful SIGTERM/SIGINT shutdown.
- Boot logs include `NODE_ENV`, `API_PORT`, redacted `DATABASE_URL` (no credentials).

## Important Decisions

- Module is **not pure side-effect** on import; exports `start({ logger? })`, `attachSignalHandlers(boot, onExit?)`, and `main()`. CLI auto-runs only via `isCliEntry(import.meta.url, process.argv)`. This makes the boot smoke test trivial without spawning a subprocess and keeps `process.exit(1)` outside `start()` so tests can assert the thrown `ConfigError` directly.
- Shutdown timeout fixed at 10s via `SHUTDOWN_TIMEOUT_MS` constant; on timeout the promise resolves (rather than rejects) so the SIGTERM handler still calls `onExit(0)` — the unref'd timer just forces progress.
- Shutdown also closes the underlying `db.$client` (postgres.js pool) with a 5s timeout, but tolerates a `Database` that has no `$client` (e.g., structurally-mocked in unit tests).

## Learnings

- `Promise.withResolvers` requires lib `ES2024`; the root tsconfig targets `ES2022`. Use the manual `let resolve!; new Promise(r => resolve = r)` pattern in any boot/server code under this baseline.
- `vi.resetModules()` between tests creates **separate copies** of `@dialogus/shared/errors` — `instanceof ConfigError` fails across the boundary. Use structural assertions (`{ name: 'ConfigError', code: 'INVALID_ENV' }`) for ConfigError checks in boot tests.
- Capturing pino logs in tests: pass a custom `pino({ level }, stream)` instance via `start({ logger })`, where `stream` is `{ write(chunk) { … } }` parsing each newline-terminated JSON line. Don't spy on `process.stdout.write` — pino's default destination is stdout but other diagnostic noise can interfere.
- DATABASE_URL redaction format: `${protocol}//${hostname}${port ? ':' + port : ''}${pathname}`. Drops `username:password@` segment, keeps protocol + host + port + db path. Handles malformed input by returning `<invalid>`.

## Files / Surfaces

- `apps/api/src/index.ts` — full implementation (start/main/attachSignalHandlers/redactDatabaseUrl/createApiLogger).
- `apps/api/__tests__/boot.test.ts` — 9 boot tests covering ephemeral port bind, redacted log, ConfigError throw, main() exit-1 path, SIGTERM, SIGINT, idempotent shutdown, no-$client db, redactDatabaseUrl utility.
- `packages/shared/src/config/index.ts` — relaxed `API_PORT` / `WEB_PORT` from `.min(1)` to `.min(0)` so ephemeral port bindings (port 0) pass env validation. Required by task_15 test bullet "API_PORT=0 binds to ephemeral port"; minor deviation from the techspec snippet (`.min(1)`), reconciled toward the more specific task spec.

## Errors / Corrections

- First test run hit `Promise.withResolvers` typecheck error → swapped to manual promise resolver.
- First run also hit `instanceof ConfigError` assertion failure → switched to `toMatchObject({ name, code })` because resetModules made the imported class identity differ from the runtime class.
- API_PORT=0 was rejected by `envSchema.min(1)` → relaxed to `min(0)` (recorded under Files/Surfaces above).

## Ready for Next Run

- task_16+ can rely on `start()` returning `{ app, db, server, port, logger, config, shutdown }` — useful if a future test or app needs to embed the API in-process.
- Foundation E2E proof (task_21) can use `pnpm --filter @dialogus/api dev` directly; the dev script already wires `tsx watch src/index.ts`.
