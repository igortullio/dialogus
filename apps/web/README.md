# @dialogus/web

Chat-first Next.js 16 app for dIAlogus. Two routes: `/` (chat) and `/library`.

## Tests

### Unit tests (vitest)

```bash
pnpm --filter @dialogus/web test
```

Excludes the Playwright `__tests__/integration/` and `__tests__/a11y/` directories.

### Playwright happy-path (integration)

The happy-path E2E test exercises all four user journeys (search → ingest → ask → spoiler-safe read → rename → pin → delete). It needs the full stack running with deterministic providers — Postgres, `apps/api`, `apps/worker`, `apps/mastra`, and `apps/web` — plus LLM mocking at the `apps/mastra` layer.

```bash
# 1. Boot Postgres + apply migrations.
docker compose up -d
pnpm db:migrate

# 2. Boot the four Node apps with mock providers and the Anthropic MSW shim.
ANTHROPIC_API_KEY=test-anthropic-key \
OPENAI_API_KEY=test-openai-key \
EMBEDDING_PROVIDER=mock \
SUMMARY_GENERATOR=mock \
E2E_MOCK_LLM=1 \
pnpm dev

# 3. In another terminal, install the Chromium browser binary (one-time per machine).
pnpm --filter @dialogus/web test:e2e:install

# 4. Run the suite. The Playwright config reuses the running dev server.
pnpm --filter @dialogus/web test:e2e -- --project=integration
```

Environment variables:

| Variable | Purpose |
|---|---|
| `EMBEDDING_PROVIDER=mock` | Forces `MockEmbeddingProvider` in `apps/worker`; ingestion completes without OpenAI calls. |
| `SUMMARY_GENERATOR=mock` | Forces `MockChapterSummaryGenerator`; summary generation runs without Anthropic calls. |
| `E2E_MOCK_LLM=1` | Activates the MSW shim in `apps/mastra` that intercepts `https://api.anthropic.com/v1/messages` and returns deterministic tool-use → final-text responses. |
| `PLAYWRIGHT_DISABLE_WEB_SERVER=1` | Skips `playwright.config.ts`'s automatic `pnpm dev` boot. Use when the stack is already up. |
| `PLAYWRIGHT_BASE_URL` | Override of the target origin (defaults to `http://localhost:3000`). |

### Lighthouse accessibility audits

```bash
pnpm --filter @dialogus/web test:a11y
```

Requires `apps/api` and `apps/web` running (the audit pages do not need `apps/mastra` or `apps/worker`). Asserts an accessibility score `>= 0.9` on `/` and `/library`. The suite also runs `@axe-core/playwright` against the same routes for an inline check on critical violations.

Set `PLAYWRIGHT_SKIP_LIGHTHOUSE=1` to skip the Lighthouse run while still executing the axe-core checks (useful on machines without a usable headless Chromium binary).

## CI

The repository's `.github/workflows/ci.yml` adds two jobs:

- **`integration-web`** (≤ 10 min): boots Postgres via the GitHub Actions service container, runs migrations, starts the full app stack with mock providers, then runs `pnpm test:e2e -- --project=integration`.
- **`a11y`** (≤ 5 min): boots Postgres + `apps/api` + `apps/web` only, runs `pnpm test:a11y`.

Both jobs upload Playwright traces / videos / `stack.log` on failure under `actions/upload-artifact`.
