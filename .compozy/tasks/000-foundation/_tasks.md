# Foundation — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Initialize monorepo root | completed | low | — |
| 02 | Configure Biome + pre-commit hook | completed | low | task_01 |
| 03 | Write Day-1 documentation files | completed | low | task_01 |
| 04 | Docker Compose for Postgres 18 + pgvector | completed | low | task_01 |
| 05 | Scaffold @dialogus/shared package | completed | low | task_01 |
| 06 | Implement envSchema + loadConfig with tests | completed | medium | task_05 |
| 07 | Implement error hierarchy + health schema with tests | completed | low | task_05 |
| 08 | Scaffold @dialogus/db package | completed | low | task_01 |
| 09 | Implement Drizzle system_health schema | completed | low | task_08 |
| 10 | Implement createDatabase + probes with tests | completed | medium | task_08, task_09 |
| 11 | Implement pgboss factory + runMigrations with tests | completed | medium | task_10 |
| 12 | Generate initial SQL migration + extensions + seed | completed | medium | task_04, task_09, task_11 |
| 13 | Scaffold apps/api package | completed | low | task_01, task_06, task_10 |
| 14 | Implement /health route handler with tests | completed | medium | task_07, task_10, task_13 |
| 15 | Implement apps/api boot assembly | completed | medium | task_06, task_10, task_13, task_14 |
| 16 | Scaffold apps/web package | completed | low | task_01, task_07 |
| 17 | Implement web lib/health fetcher with tests | completed | low | task_07, task_16 |
| 18 | Implement landing Server Component with tests | completed | medium | task_16, task_17 |
| 19 | GitHub Actions CI workflow with 3 jobs | completed | medium | task_15, task_18 |
| 20 | Finalize README + architecture summary | completed | low | task_12, task_15, task_18 |
| 21 | Foundation smoke test + closure | completed | medium | task_12, task_15, task_18, task_19, task_20 |
