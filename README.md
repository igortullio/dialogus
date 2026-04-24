# dIAlogus

Single-user RAG study companion over public-domain classics.

## Requirements

- Node.js **22.13+** (see `.nvmrc`; `corepack enable` to activate pnpm).
- pnpm **9.15+** (pinned via `packageManager`).
- Docker Desktop for local Postgres 18 + pgvector.

## Quickstart

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
```

Open <http://localhost:3000> — the page should render `dIAlogus — api: up / db: up / pgboss: up` once the stack is wired end-to-end.

### Postgres 18 / Apple Silicon fallback

`docker-compose.yml` pins `pgvector/pgvector:pg18`. If the Postgres 18 image misbehaves on your machine — most likely on Apple Silicon while the multi-arch tag stabilises — fall back to Postgres 17 by editing the `image:` line to `pgvector/pgvector:pg17`, then `docker compose down -v && docker compose up -d`. Both tags ship pgvector ≥ 0.8.0, so migrations and the embedding pipeline behave identically.

## Architecture

_Filled in by task_20 once the end-to-end Foundation slice is wired._

## Next Steps

_Filled in by task_20. Points at `.compozy/tasks/001-catalog/_prd.md` when Feature 001 begins._

## Commit message convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/). Use prefixes such as `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, and `test:` on every commit. No automation enforces this on commit — it is a manual discipline for now.

## License

[MIT](./LICENSE) © 2026 Igor Túllio.
