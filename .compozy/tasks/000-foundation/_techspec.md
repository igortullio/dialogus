# Feature 000: Foundation — Technical Specification

## Executive Summary

Foundation establishes the dIAlogus monorepo baseline across 8 discrete Build Order steps: pnpm workspace + tooling (Biome, Vitest 4, TS 6), `docker-compose.yml` with Postgres 18 + pgvector ≥ 0.8 + uuid-ossp, `@dialogus/shared` (Zod env, errors, shared types), `@dialogus/db` (Drizzle client + first SQL migration + pg-boss init), `apps/api` Hono skeleton with `/health`, `apps/web` Next 16 Server Component that fetches `/health`, CI `ci.yml` (3 jobs), and documentation finalization. All schema changes flow through `drizzle-kit generate` + `migrate` (generate-only strict); `pgboss.start()` is folded into `pnpm db:migrate` as a single ceremony so apps never call `start()` themselves. `apps/api` uses infrastructure-first layout — routes live in `src/infrastructure/http/routes/` from day 1; `domain/` and `application/` appear in Feature 001 when catalog brings real domain logic.

Primary trade-off: **strict migration discipline up front** (SQL files committed for every schema change, no `drizzle-kit push`) for **zero dev-vs-prod drift across the 5-feature lifetime** plus clean code-review diffs on every schema change.

## System Architecture

### Component Overview

```
apps/web                               Next.js 16 App Router, port 3000
  src/app/layout.tsx                   bare HTML shell
  src/app/page.tsx                     Server Component: fetch /health → render status
  src/lib/health.ts                    fetcher using NEXT_PUBLIC_API_URL
  (no Tailwind, no shadcn — Feature 004)

apps/api                               Hono 4 + @hono/node-server, port 3001
  src/index.ts                         boot: loadConfig → createDatabase → hono listen
  src/infrastructure/http/routes/health.ts   /health handler with probes

packages/
  @dialogus/shared
    src/config/index.ts                loadConfig() + Zod envSchema
    src/errors/index.ts                DialogusError hierarchy
    src/types/index.ts                 shared TS types (placeholder)
    src/index.ts                       barrel
  @dialogus/db
    src/client.ts                      createDatabase(url) — postgres.js + drizzle singleton
    src/pgboss.ts                      createPgBoss(url) factory
    src/schema/system_health.ts        canary table
    src/schema/index.ts                schema barrel
    src/migrate.ts                     runMigrations(url) = drizzle-kit migrate + pgboss.start
    src/probes.ts                      probeDb(db), probePgBoss(db)
    drizzle.config.ts                  points at src/schema/
    drizzle/0000_init.sql              generated: extensions + system_health + seed

docker-compose.yml                     pgvector/pgvector:pg18, port 5432, named volume, healthcheck
.githooks/pre-commit                   lint + typecheck + unit (verbatim from m5nita)
.github/workflows/ci.yml               3 jobs: lint-and-typecheck, test, build
```

**Data flow — Foundation E2E wiring proof:**

1. Dev runs `pnpm dev` → both apps start.
2. Browser requests `http://localhost:3000/`.
3. Next 16 Server Component calls `fetch(\`${NEXT_PUBLIC_API_URL}/health\`)` at render.
4. Hono at 3001 runs `/health`: `probeDb(db)` (SELECT 1) + `probePgBoss(db)` (check `pgboss` schema).
5. Returns `{ api: 'up', db: 'up' | 'down', pgboss: 'up' | 'down' }`.
6. Server Component renders "dIAlogus — api: up / db: up / pgboss: up".
7. Browser receives fully-rendered HTML (no client-side fetch).

## Implementation Design

### Core Interfaces

```typescript
// @dialogus/shared/config — env validation + loader
import { z } from 'zod'

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
})

export type DialogusEnv = z.infer<typeof envSchema>
export function loadConfig(): DialogusEnv
```

```typescript
// @dialogus/shared/errors — exception hierarchy
export class DialogusError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = new.target.name
  }
}
export class ConfigError extends DialogusError {}
export class NotFoundError extends DialogusError {}
export class ValidationError extends DialogusError {}
```

```typescript
// @dialogus/db — client + probes
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export type Database = ReturnType<typeof drizzle>
export function createDatabase(connectionString: string): Database {
  return drizzle(postgres(connectionString), { schema })
}
export async function probeDb(db: Database): Promise<boolean>
export async function probePgBoss(db: Database): Promise<boolean>
```

```typescript
// @dialogus/db/migrate — single-ceremony migration runner
import PgBoss from 'pg-boss'
export async function runMigrations(connectionString: string): Promise<void> {
  // 1. apply Drizzle SQL migrations from drizzle/
  // 2. const boss = new PgBoss(connectionString); await boss.start(); await boss.stop()
}
```

### Data Models

**Drizzle schema (Foundation):**

- `system_health` — `id uuid default uuid_generate_v4()`, `status text default 'ok'`, `created_at timestamp default now()`. Migration seeds 1 row.
- Extensions via raw SQL in the initial migration: `CREATE EXTENSION IF NOT EXISTS vector;` and `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`.

**pg-boss schema:** managed by pg-boss itself; created by `boss.start()` during `pnpm db:migrate`. Lives in a `pgboss` schema on the same Postgres database.

No other domain tables in Foundation.

### API Endpoints

`apps/api` (Hono, port 3001):

| Method | Path | Purpose | Response |
|---|---|---|---|
| GET | `/health` | Liveness + DB + pg-boss probes | `200 { api: 'up', db: 'up' \| 'down', pgboss: 'up' \| 'down' }` |

Response is Zod-validated via a schema exported from `@dialogus/shared/schemas/health` (new submodule in step 3).

`apps/web` (Next 16, port 3000):

| Route | Purpose |
|---|---|
| `/` | Server Component fetches `/health` at render; shows status line |

## Integration Points

Foundation has **no external service integrations**. Traffic stays localhost (web → api → postgres). Gutendex, OpenAI, Anthropic, and Mastra are introduced in Features 001-004 respectively.

## Impact Analysis

Greenfield — every component is new.

| Component | Impact | Risk | Action |
|---|---|---|---|
| Repo init (pnpm, git, `.githooks`) | new | low | Step 1 |
| `biome.json`, root `tsconfig.json`, `.env.example`, `README`, `LICENSE` | new | low | Step 1 — adapt from m5nita |
| `docker-compose.yml` | new | medium (PG 18 + pgvector 0.8 on Apple Silicon unknown) | Step 2; pin `pgvector/pgvector:pg18`; document fallback to `pg17` |
| `@dialogus/shared` | new | low | Step 3 |
| `@dialogus/db` | new | medium (first pgvector migration + pg-boss integration) | Step 4; smoke via manual run |
| `apps/api` | new | low | Step 5 |
| `apps/web` | new | low-medium (Next 16 App Router Server Component conventions) | Step 6 |
| `ci.yml` | new | low | Step 7 — adapt from m5nita minus bundle budgets |
| Pre-commit hook | new | low | Step 1 — verbatim from m5nita |

## Testing Approach

### Unit Tests

- **Runner**: Vitest 4, default root config.
- **Layout**: `__tests__/` alongside source per package/app.
- **Coverage target: 4-6 smoke tests, pre-commit runtime ≤ 30s.**
  1. `@dialogus/shared/config`: `loadConfig()` throws `ConfigError` with a grouped message listing every missing/malformed field.
  2. `@dialogus/shared/errors`: subclasses preserve `code` + `cause` + correct `name`.
  3. `@dialogus/db/probes`: `probeDb` returns `true` when `SELECT 1` succeeds, `false` on driver error (mocked).
  4. `apps/api /health`: mocked `probeDb` + `probePgBoss` → handler returns expected shape across `up/down` combinations.
  5. `apps/web` page: mocked fetch → rendered HTML contains `dIAlogus` + `api: up`.
- **No Drizzle migration tests** — Testcontainers arrive with Feature 002 (per ADR-007 product-level).

### Integration Tests

**Not in Foundation.** Deferred to Feature 002 where domain tables and the ingestion pipeline first need real-DB coverage. When added, they live in `*.integration.test.ts` files run only in CI + on-demand locally.

### E2E Tests

**Not in Foundation.** Deferred to Feature 004 (Chat UI).

### Manual Smoke (developer runs once before closing Foundation)

1. Fresh clone → `pnpm install && docker compose up -d && pnpm db:migrate && pnpm dev`.
2. `http://localhost:3000` → "dIAlogus — api: up / db: up / pgboss: up".
3. `docker compose stop postgres` → refresh → shows `db: down / pgboss: down`.
4. `pnpm db:reset && pnpm db:migrate` re-creates state cleanly.
5. Deliberately introduce a lint error; `git commit` → pre-commit blocks.

## Development Sequencing

### Build Order

1. **Repo scaffold** — no deps
   - `pnpm init` at root with `"type": "module"`, `"private": true`, `packageManager: "pnpm@9.15.4"`, `engines.node: ">=22"`.
   - `pnpm-workspace.yaml` with `apps/*` + `packages/*`.
   - Root `package.json` scripts: `dev` (`pnpm --parallel -r dev`), `build` (`pnpm -r build`), `test` (`pnpm -r test`), `lint` (`biome check .`), `lint:fix` (`biome check --write .`), `typecheck` (`pnpm -r typecheck`), `db:generate`, `db:migrate`, `db:studio`, `db:reset`, `prepare` (`git config core.hooksPath .githooks || true`).
   - Root `tsconfig.json` mirroring m5nita + TS 6 opts.
   - `biome.json` adapted from m5nita.
   - `.nvmrc` with `22.13`.
   - `.githooks/pre-commit` (verbatim m5nita: `pnpm lint && pnpm typecheck && pnpm test`).
   - `.env.example` listing every planned env var with per-variable comments.
   - `README.md`, `LICENSE` (MIT), `.gitignore`.

2. **Postgres via docker-compose** — depends on 1
   - `docker-compose.yml` using `pgvector/pgvector:pg18`, named volume, `POSTGRES_USER/PASSWORD/DB`, healthcheck via `pg_isready`.
   - README documents fallback to `pg17` if Apple Silicon edge case surfaces.
   - Verification: `docker compose up -d && docker compose exec postgres psql -U dialogus -c "SELECT version();"` → PG 18.

3. **`@dialogus/shared`** — depends on 1
   - `packages/shared/package.json` with `"type": "module"` and `exports` map (`./config`, `./errors`, `./types`, `./schemas/health`, root barrel).
   - `src/config/index.ts` — `envSchema` + `loadConfig()`.
   - `src/errors/index.ts` — `DialogusError` + subclasses.
   - `src/types/index.ts` — placeholder barrel.
   - `src/schemas/health.ts` — Zod schema + TypeScript type for the `/health` response.
   - `src/index.ts` — barrel re-exporting all modules.
   - `__tests__/config.test.ts` + `__tests__/errors.test.ts`.
   - `tsconfig.json` extending root; `typecheck` + `test` scripts.

4. **`@dialogus/db`** — depends on 2, 3
   - `packages/db/package.json` with deps on `drizzle-orm`, `drizzle-kit`, `postgres`, `pg-boss@^12`.
   - `src/schema/system_health.ts` — Drizzle table.
   - `src/schema/index.ts` — barrel.
   - `src/client.ts` — `createDatabase(url)`.
   - `src/pgboss.ts` — `createPgBoss(url)` factory.
   - `src/probes.ts` — `probeDb`, `probePgBoss`.
   - `src/migrate.ts` — `runMigrations()` = drizzle-kit migrate + `pgboss.start()` + `pgboss.stop()`.
   - `drizzle.config.ts` pointing at `src/schema/`.
   - Run `pnpm db:generate` once → `drizzle/0000_init.sql` committed with extensions + `system_health` + seed row.
   - `__tests__/probes.test.ts` with mocked db.

5. **`apps/api`** — depends on 3, 4
   - `apps/api/package.json` with `hono`, `@hono/node-server`, `tsx`, `@dialogus/shared`, `@dialogus/db`.
   - `src/infrastructure/http/routes/health.ts` — handler calling `probeDb` + `probePgBoss`, returning Zod-validated shape.
   - `src/index.ts` — `loadConfig()` → `createDatabase(DATABASE_URL)` → Hono app with health route mounted → `serve({ fetch: app.fetch, port: API_PORT })`.
   - `__tests__/health.test.ts` — mocked probes, asserts `up/up/up`, `up/down/up`, `up/up/down`.
   - `tsconfig.json`, scripts: `dev` (`tsx watch src/index.ts`), `build` (`tsc`), `test`, `typecheck`.

6. **`apps/web`** — depends on 3, 5
   - `apps/web/package.json` with `next@16`, `react@19`, `react-dom@19`, `@dialogus/shared`.
   - `src/app/layout.tsx` — bare HTML shell.
   - `src/app/page.tsx` — Server Component: `const h = await fetchHealth()`, renders "dIAlogus — api: {h.api} / db: {h.db} / pgboss: {h.pgboss}".
   - `src/lib/health.ts` — `fetchHealth()` reading `NEXT_PUBLIC_API_URL` from env, returning Zod-validated response.
   - `next.config.ts` minimal.
   - `__tests__/page.test.tsx` — mocked fetch.
   - Scripts: `dev` (`next dev -p 3000`), `build` (`next build`), `start` (`next start -p 3000`), `test`, `typecheck` (`tsc --noEmit`).

7. **CI `ci.yml`** — depends on 5, 6
   - `.github/workflows/ci.yml` with 3 jobs: `lint-and-typecheck`, `test`, `build`.
   - Concurrency group cancels in-progress PR runs; main runs preserved.
   - Node 22 single-version matrix; pnpm via Corepack.
   - No Postgres service (unit tests only; integration added with Feature 002).
   - No bundle budgets (added with Feature 004).

8. **Documentation finalization + dogfood smoke** — depends on 7
   - README quickstart runs verbatim against a fresh clone.
   - Architecture summary updated; "Next steps" points to `.compozy/tasks/001-catalog/_prd.md` (once it exists).
   - First commit lands on `main` with green CI.

### Technical Dependencies

- Node 22.13+, pnpm 9.15+ (via Corepack).
- Docker Desktop ≥ 4.30.
- GitHub Actions runner standard (no Docker-in-Docker needed for Foundation CI).

## Monitoring and Observability

- **Logs**: `pino` + `pino-pretty` for local dev stdout; JSON output in prod.
- **Health endpoint**: `/health` is the manual probe surface.
- **No metrics, tracing, or error tracker in Foundation** — per product ADR scope.

## Technical Considerations

### Key Decisions

1. **Generate-only Drizzle migrations** (ADR-002) — all schema changes committed as SQL via `drizzle-kit generate`; `push` disallowed. Zero dev-vs-prod drift across features.
2. **pg-boss init folded into `db:migrate`** (ADR-003) — single ceremony. Apps call only `send()`/`work()`.
3. **Infrastructure-first layout for `apps/api`** (ADR-004) — `src/infrastructure/http/routes/` from day 1; `domain/` + `application/` appear with Feature 001. Packages (`shared`, `db`) stay flat with module-level grouping.
4. **TypeScript 6 baseline**, fallback to ~5.9 if a peer rejects (inherited from product TechSpec).
5. **Single Postgres** hosts domain + pgvector + pg-boss + future Mastra Memory. One `DATABASE_URL`.
6. **No Tailwind, no shadcn, no TanStack Query in Foundation** — Feature 004.
7. **Pre-commit hook verbatim from m5nita** — plain shell, no husky or lefthook.
8. **Root `pnpm dev` uses `pnpm --parallel -r dev`** — sufficient for 2 apps; Feature 002 revisits when worker joins, possibly swapping to Turborepo.

### Known Risks

- **pgvector 0.8 + PG 18 on Apple Silicon** — unknown edge case. Mitigation: multi-arch image `pgvector/pgvector:pg18`; README fallback to `pg17`.
- **TypeScript 6 peer incompat** with Drizzle / Hono / Next 16 / `@mastra/*` — unknown until install. Mitigation: typecheck is the first gate; pin to ~5.9 if any peer rejects.
- **Next 16 App Router Server Component caching defaults** — `fetch` default `cache: 'no-store'` means health re-fetches every render; fine for Foundation local, Feature 001 may want short revalidation.
- **pg-boss 12 + PG 18** — unstated by pg-boss docs. Mitigation: smoke `db:migrate` on Foundation close before merging.
- **`drizzle-kit migrate` + `pgboss.start()` in one script** can leave PG in partial state if pgboss fails mid-migrate. Mitigation: `runMigrations` uses try/catch and logs explicit stage ("drizzle done, pgboss starting") so partial state is diagnosable.

## Architecture Decision Records

- [ADR-001: Linear + transparent delivery with E2E wiring and Day-1 polish](adrs/adr-001.md) — Foundation proves the vertical slice via a Server Component fetch; first commit is portfolio-grade.
- [ADR-002: Generate-only Drizzle migrations](adrs/adr-002.md) — no `push`; all schema changes committed as SQL.
- [ADR-003: pg-boss init folded into `db:migrate`](adrs/adr-003.md) — single ceremony; apps never call `pgboss.start()` themselves.
- [ADR-004: Infrastructure-first layout for `apps/api`](adrs/adr-004.md) — routes live in `src/infrastructure/http/routes/` from day 1; `domain/` + `application/` introduced with Feature 001.
