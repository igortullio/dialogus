---
status: completed
title: Scaffold apps/web package
type: frontend
complexity: low
dependencies:
  - task_01
  - task_07
---

# Task 16: Scaffold apps/web package

## Overview

Create the `apps/web` workspace app using Next.js 16 (App Router) + React 19 + TypeScript, with a bare HTML shell `layout.tsx` and an empty `page.tsx` stub (filled in task_18). No Tailwind, no shadcn, no Tanstack Query — those arrive in Feature 004.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST create `apps/web/package.json` with `"name": "@dialogus/web"`, `"type": "module"`, dependencies `next@^16`, `react@^19`, `react-dom@^19`, workspace `@dialogus/shared@workspace:*`.
- MUST add devDeps `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `vitest`, `@testing-library/react`, `jsdom`.
- MUST author `apps/web/tsconfig.json` extending root with Next.js compatibility (`jsx: 'preserve'`, `noEmit: true`, Next plugins).
- MUST author minimal `apps/web/next.config.ts` (empty config or `export default {}`).
- MUST create `apps/web/src/app/layout.tsx` as a bare HTML shell: `<html lang="pt-BR"><body>{children}</body></html>` with page title `dIAlogus` in metadata.
- MUST create `apps/web/src/app/page.tsx` as a placeholder server component rendering `<h1>dIAlogus</h1>` only (fleshed out in task_18).
- Scripts: `dev` (`next dev -p 3000`), `build` (`next build`), `start` (`next start -p 3000`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`).
- MUST NOT install Tailwind, shadcn, or TanStack Query.

</requirements>

## Subtasks

- [x] 16.1 Author `apps/web/package.json` with deps and scripts.
- [x] 16.2 Author `apps/web/tsconfig.json` + `next.config.ts`.
- [x] 16.3 Author `src/app/layout.tsx` bare HTML shell.
- [x] 16.4 Author `src/app/page.tsx` placeholder returning `<h1>dIAlogus</h1>`.
- [x] 16.5 Verify `pnpm --filter @dialogus/web typecheck` and `pnpm --filter @dialogus/web build` pass.

## Implementation Details

Reference Foundation TechSpec Build Order Step 6. Next 16 App Router defaults `fetch` to `cache: 'no-store'` — important for task_17/18 but not this scaffold task.

### Relevant Files

- Next.js 16 docs (App Router quickstart).
- Foundation TechSpec § Implementation Design.

### Dependent Files

- `./apps/web/package.json` (new)
- `./apps/web/tsconfig.json` (new)
- `./apps/web/next.config.ts` (new)
- `./apps/web/src/app/layout.tsx` (new)
- `./apps/web/src/app/page.tsx` (new placeholder)

## Deliverables

- `apps/web/` scaffolded, typechecks and builds cleanly.
- Unit tests with 80%+ coverage **(REQUIRED)** — `layout.tsx` + placeholder `page.tsx` render tests.
- Integration tests **(REQUIRED)** — `next build` exits 0.

## Tests

- Unit tests:
  - [x] `layout.tsx` renders `<html lang="pt-BR">` and includes children.
  - [x] Metadata exports from `layout.tsx` include title `dIAlogus`.
  - [x] `page.tsx` placeholder renders `<h1>dIAlogus</h1>`.
  - [x] `package.json` does NOT contain `tailwindcss` or `shadcn` (Feature 004 enforcement).
- Integration tests:
  - [x] `pnpm --filter @dialogus/web build` exits 0.
  - [x] `pnpm --filter @dialogus/web typecheck` exits 0.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria

- All tests passing
- Test coverage >=80%
- `pnpm --filter @dialogus/web dev` serves a page at `http://localhost:3000` with `dIAlogus` heading.
- No Tailwind or shadcn dependency present.
