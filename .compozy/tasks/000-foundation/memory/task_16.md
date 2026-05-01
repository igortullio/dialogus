# Task Memory: task_16.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Scaffold `apps/web` (Next 16 + React 19) with bare layout + placeholder page. No Tailwind/shadcn/TanStack — those land in Feature 004. Build + typecheck must be clean.

## Important Decisions

- Added `@vitejs/plugin-react` as devDep beyond the task spec's listed devDeps. Required because Next mandates `jsx: 'preserve'` in tsconfig, but Vite's import-analysis cannot read raw JSX without a plugin that compiles it pre-analysis.
- Tests assert layout structure by inspecting the returned React element tree (`tree.type === 'html'`) instead of rendering — JSDOM warns when `<html>` is rendered inside an existing `<html>`. Page placeholder uses `render()` from `@testing-library/react` because its root is a regular element.

## Learnings

- `next build` (Next 16) auto-generates `next-env.d.ts` at the package root, which Biome would reformat to single-quote/no-semicolon. Excluded via `!**/next-env.d.ts` in `biome.json` and added to root `.gitignore`.
- Did NOT need `@testing-library/jest-dom` — plain `container.querySelector` assertions are enough for the placeholder.

## Files / Surfaces

- New: `apps/web/{package.json, tsconfig.json, next.config.ts, vitest.config.ts}`
- New: `apps/web/src/app/{layout.tsx, page.tsx}`
- New: `apps/web/__tests__/{scaffold.test.ts, app/layout.test.tsx, app/page.test.tsx}`
- Modified: root `.gitignore` (+ `next-env.d.ts`), `biome.json` (+ `!**/next-env.d.ts` exclude), `pnpm-lock.yaml`

## Errors / Corrections

- First test run failed: vite's import-analysis rejected JSX with `jsx: 'preserve'`. Fix was adding `@vitejs/plugin-react` and using `plugins: [react()]` in `vitest.config.ts` (NOT `esbuild.jsx: 'automatic'` — that bypassed the import-analysis check but still left the issue).

## Ready for Next Run

- task_17 implements `apps/web/src/lib/health.ts` (fetch /health). Reuses the apps/web vitest config; no changes needed there.
- task_18 replaces `page.tsx` placeholder with the real Server Component calling `fetchHealth()`.
