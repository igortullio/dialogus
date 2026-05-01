# Task Memory: task_10.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Extend the GitHub Actions `integration` job so the 5 mastra integration suites from task_09 ship green in CI without busting the 15-min budget; document local usage; add a discovery meta-test.

## Important Decisions

- **Did NOT split `integration` into `integration-api` + `integration-mastra`.** Combined local wall-clock = ~34s (api ~34s, mastra ~5.5s, run in parallel by `pnpm -r`). CI add-on (install + Docker pull) lands well under the 15-min budget. Splitting is a Phase-2 decision if wall-clock ever creeps past the threshold.
- **Did NOT change `apps/mastra/vitest.integration.config.ts` include patterns.** `**/*.integration.test.ts` already discovers all 5 suites under `__tests__/integration/` (verified by the new `integration-discovery.test.ts`).
- **Authored a minimal `apps/mastra/README.md` covering only the CI/integration surface.** task_11 owns the broader README content (Quickstart, Architecture, cURL scripts) and will extend this file in place. Sections added now: header, "Integration tests in CI" with the 5-suite table, "Run integration tests locally".
- **Pinned fixture API keys at the job-level `env:` block** (not as repository secrets). `ANTHROPIC_API_KEY=test-anthropic-key`, `OPENAI_API_KEY=test-openai-key`. YAML comment documents the no-real-secrets rule for future contributors.

## Learnings

- **Node 22 `globSync` is experimental and emits a stderr warning.** Switched the discovery test to `readdirSync(root, { recursive: true, withFileTypes: true })` + path-segment filter — zero deps, zero warning, stable API. The `recursive: true` option exposes `dirent.parentPath` (Node 22+) so we can rebuild absolute and relative paths without manual recursion.
- **Vitest in `apps/mastra` (no per-app config) inherits the root `vitest.config.ts`** — that's why `pnpm --filter @dialogus/mastra test` (regular, not `test:integration`) excludes `*.integration.test.ts` automatically. Removing the root exclude would cause integration tests to run during the `test` job too.
- **`describe.skipIf(!dockerAvailable)` keeps suites green when Docker is missing.** All 5 suites use it; integration-discovery does not need this guard because it only reads filenames, not state.

## Files / Surfaces

- `.github/workflows/ci.yml` (modified): added job-level `env:` block on `integration` with fixture API keys + MASTRA_PORT + NEXT_PUBLIC_MASTRA_URL.
- `apps/mastra/__tests__/integration-discovery.test.ts` (new): 6 unit tests asserting `**/*.integration.test.ts` resolves to ≥5 files including the 5 named suites.
- `apps/mastra/README.md` (new, minimal): CI section + local run command. Reserved structure for task_11 to extend.
- `__tests__/ci-workflow.test.ts` (modified): added one regression test asserting the integration job env block contains the four required fixture vars.

## Errors / Corrections

- First `globSync` attempt passed `exclude: ['**/node_modules/**', '**/dist/**']` (an array). Node 22's `globSync` requires `exclude` to be a `(path: string) => boolean` predicate — fixed by switching off `globSync` entirely (see Learnings).

## Ready for Next Run

- task_11 (cURL scripts + apps/mastra README) can extend `apps/mastra/README.md` in place — current file owns only the "Integration tests in CI" + "Run integration tests locally" sections; insert the project README content (Quickstart, Architecture, cURL scripts) above or below those sections, do not delete them.
- task_13 (feature closure) can verify CI green on `main` after merge by inspecting the `integration` job duration in the latest main-branch run; targets ≤ 15 minutes.
