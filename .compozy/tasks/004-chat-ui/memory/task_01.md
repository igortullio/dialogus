# Task Memory: task_01.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Promoted `apps/web` from Foundation stub to Next 16 + Tailwind v4 + shadcn + assistant-ui + AI SDK + TanStack Query baseline. Wired `<ThemeProvider>` (system pref) + `<QueryClientProvider>` (30 s staleTime) + `<Toaster />` in root layout. Recorded the Mastra metadata verification result as `MASTRA_THREAD_METADATA_AVAILABLE = true` in `src/lib/feature-flags.ts`.

## Important Decisions

- Used Tailwind v4 CSS-first config (no `tailwind.config.ts`) with `@import 'tailwindcss'` + `@import 'tw-animate-css'` + `@theme inline { ... }` block in `src/app/globals.css`. shadcn `components.json` has `tailwind.config = ""` per the v4 contract.
- ADR-007 primary path confirmed: `@mastra/client-js@1.14.2` exposes `createMemoryThread({ metadata })`, `getMemoryThread().update({ metadata })`, and `.get()` returning `StorageThreadType.metadata?: Record<string, unknown>` — no fallback `thread_metadata` table needed.
- Verification test uses `vi.spyOn(globalThis, 'fetch')` (not MSW) to keep apps/web free of new test-only deps.

## Learnings

- Vite/Vitest tries to PostCSS-process CSS imported by source files. Setting `css: { postcss: { plugins: [] } }` in `vitest.config.ts` skips Tailwind's PostCSS in jsdom tests so the v4 `@import 'tailwindcss'` doesn't break unit runs.
- jsdom doesn't ship `window.matchMedia`; `next-themes` blows up without it. Added `__tests__/vitest.setup.ts` polyfill registered via `setupFiles`.
- Next 16 moved `experimental.typedRoutes` to top-level `typedRoutes`; `next.config.ts` warns if you use the old key.
- `@mastra/client-js`'s `MemoryThread.update` issues a `PATCH` (not `PUT`) — the verification asserts that.

## Files / Surfaces

- new: `src/app/globals.css`, `components.json`, `postcss.config.mjs`, `src/lib/utils.ts`, `src/lib/query-client.tsx`, `src/lib/feature-flags.ts`, `src/components/theme-provider.tsx`, `src/components/ui/{button,card,badge,input,separator,skeleton,sonner}.tsx`, `__tests__/vitest.setup.ts`, `__tests__/setup/{mastra-metadata-verification,providers,tailwind-smoke}.test.{ts,tsx}`.
- modified: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/src/app/layout.tsx`, `apps/web/vitest.config.ts`, `apps/web/__tests__/scaffold.test.ts`, `apps/web/__tests__/app/layout.test.tsx`.

## Errors / Corrections

- First test run failed because the `@/*` path alias wasn't wired into Vitest — added `resolve.alias` to `vitest.config.ts`.
- Tightened `findElement` test helper from `ComponentType` → `ElementType` so providers with required `children` typecheck.

## Ready for Next Run

- `MASTRA_THREAD_METADATA_AVAILABLE = true` in `src/lib/feature-flags.ts`; task_05 should consume this directly. No fallback work needed; task_15 deps stay as-is.
- 8 shadcn primitives shipped (button/card/badge/input/separator/skeleton/sonner). Task_06 still needs to add the rest (dialog, sheet, tooltip, dropdown-menu, alert-dialog, slider, select, popover, tabs).
- `@mastra/client-js` is installed for verification but kept available for any client-side Mastra calls task_07/task_09 might want; otherwise `useChat` (`@ai-sdk/react` + `@assistant-ui/react-ai-sdk`) is the planned interface.
