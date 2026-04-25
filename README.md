# dIAlogus

Single-user RAG study companion over public-domain classics.

## Requirements

- Node.js **22.13+** (see `.nvmrc`).
- pnpm **9.15+** (activated via Corepack).
- Docker Desktop **≥ 4.30** for local Postgres 18 + pgvector.

## Quickstart

```bash
corepack enable
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

Open <http://localhost:3000> — the landing page should render:

```
dIAlogus — api: up / db: up / pgboss: up
```

> First-run only: copy `.env.example` to `.env` before the first `pnpm db:migrate`. The bundled defaults already point at the docker-compose Postgres on `localhost:5432`, so no edits are required to boot the stack.
>
> ```bash
> cp .env.example .env
> ```

### Postgres 18 / Apple Silicon fallback

`docker-compose.yml` pins `pgvector/pgvector:pg18`. If the Postgres 18 image misbehaves on your machine — most likely on Apple Silicon while the multi-arch tag stabilises — fall back to Postgres 17 by editing the `image:` line to `pgvector/pgvector:pg17`, then `docker compose down -v && docker compose up -d`. Both tags ship pgvector ≥ 0.8.0, so migrations and the embedding pipeline behave identically. The fallback is recorded in [ADR-001](./.compozy/tasks/000-foundation/adrs/adr-001.md).

## Architecture

dIAlogus is a single-user, locally-runnable study companion that grounds conversations about books in the public domain. The product surface is a Next.js 16 web app that talks to a Hono 4 API, which delegates persistence and search to a single Postgres 18 database with the `pgvector` and `uuid-ossp` extensions. Foundation (this commit) ships only the scaffolding — the catalog, ingestion pipeline, RAG agent, and chat UI arrive in features 001 through 004.

The repository is a pnpm monorepo with two roots. `apps/` holds the runnable processes: `apps/web` (Next.js 16 App Router, port 3000) renders the landing page as a React Server Component that fetches `/health` from `apps/api` (Hono 4, port 3001) at request time. `packages/` holds the shared libraries that every app reuses: `@dialogus/shared` exports the Zod environment schema and the `DialogusError` hierarchy that both apps import on boot, and `@dialogus/db` owns the Drizzle client, the `system_health` canary table, the pg-boss factory, and the `pnpm db:migrate` ceremony that applies the SQL migrations under `packages/db/drizzle/` and bootstraps the `pgboss` schema in one step. Tooling is intentionally small: Biome 2 for lint + format, Vitest 4 for unit tests, a `.githooks/pre-commit` shell script that runs `pnpm lint && pnpm typecheck && pnpm test`, and a 3-job GitHub Actions workflow (lint+typecheck, test, build).

At runtime the Foundation slice is three processes: the Next.js web server on `:3000`, the Hono API server on `:3001`, and the Postgres 18 + pgvector container started by `docker compose up -d`. There is no worker, no Mastra dev server, no Tailwind, and no shadcn yet — those land with later features. The end-to-end signal that the stack is wired correctly is the landing page line `dIAlogus — api: up / db: up / pgboss: up`: rendering it requires env validation through `@dialogus/shared/config`, a server-side fetch from `apps/web` to `apps/api`, Drizzle's `SELECT 1` probe against Postgres, and a presence check on the `pgboss` schema, all in one request.

## Next steps

Foundation V1 is the baseline; product features begin with the book catalog. The next feature's PRD lives at [`.compozy/tasks/001-catalog/_prd.md`](./.compozy/tasks/001-catalog/_prd.md).

## Commit message convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/). Use prefixes such as `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, and `test:` on every commit. No automation enforces this on commit — it is a manual discipline for now.

Examples:

- `feat(api): add /search endpoint`
- `fix(db): handle null pgvector embedding`
- `chore(repo): bump pnpm-lock.yaml`
- `docs: clarify db:reset semantics`

## License

[MIT](./LICENSE) © 2026 Igor Túllio.
