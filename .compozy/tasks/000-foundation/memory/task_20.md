# Task Memory: task_20.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Replace task_03 placeholder sections of `README.md` with finalized Day-1 shape: 5-command quickstart, 3-paragraph architecture, "Next steps" pointer to `.compozy/tasks/001-catalog/_prd.md`, retained PG 17 fallback, expanded Conventional Commits examples.

## Important Decisions

- Quickstart block contains exactly the 5 commands the spec requires — `corepack enable`, `pnpm install`, `docker compose up -d`, `pnpm db:migrate`, `pnpm dev`. The `cp .env.example .env` step is documented as a first-run-only prerequisite in narrative directly under the quickstart block (NOT inside it). Reason: `loadConfig()` in `@dialogus/shared/config` reads `process.env` directly with no dotenv hookup, so a fresh clone DOES need `.env`, but task_20 explicitly requires the 5-command block to be those exact lines in order. Task_21 will treat the 5-command block as the verbatim quickstart and the cp step as part of fresh-clone setup.
- Headings stay in English (`## Requirements`, `## Architecture`, `## Next steps`) — task_20 accepts either English or Portuguese. Other dev-facing docs (PRD, TechSpec, ADRs) are English; portfolio reviewers expect English; the test regex accepts both.

## Learnings

- `__tests__/day1-docs.test.ts` was authored by task_03 and asserts the exact placeholder shape. Finalizing the README must update those structural tests in lockstep — the "Filled in by task_20" placeholder check and the `cp .env.example .env` quickstart check both go away. Add the task_20 structural checks (PG 17 fallback, 001-catalog link, 3+ paragraphs, Conventional Commits examples) to the same file so README structure stays in one place.
- Markdown section-extraction regex: a non-greedy `[\s\S]*?` followed by a lookahead like `(?=^##\s+|\s*$)` collapses to zero matches because `\s*$` matches at every line break. Use a line-by-line scan (`split('\n')` + `findIndex` + walk to next `##`) instead — less clever, more correct.

## Files / Surfaces

- `README.md` — finalized.
- `__tests__/day1-docs.test.ts` — placeholder asserts removed; task_20 structural asserts added (5-command quickstart in order, PG 17 fallback mention, link to `001-catalog/_prd.md`, ≥3 architecture paragraphs, Conventional Commits with example prefixes, Requirements/Architecture/Next steps headings).

## Errors / Corrections

- First test draft used a fragile regex for the Architecture section and reported 0 paragraphs; replaced with line-walk scan.

## Ready for Next Run

- Task_21 fresh-clone smoke can quote the README's 5-command block as-is; the cp step is in narrative right under the block, where the operator naturally executes it on the very first run.
