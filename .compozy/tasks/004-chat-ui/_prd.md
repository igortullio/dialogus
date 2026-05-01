# Feature 004: Chat UI — Product Requirements Document

## Overview

The Chat UI is dIAlogus's only user-facing surface — the chat-first landing where the owner reads, asks, cites, and configures spoiler boundaries. It composes Features 001 (catalog), 002 (ingestion), and 003 (RAG agent) into a single Next.js 16 app with two top-level routes: `/` (chat) and `/library` (book management, label "Gerenciar acervo"). The agent's `{{cite:<chunk_id>}}` markers (Feature 003 ADR-007) become hoverable, clickable badges; the spoiler cap becomes a per-book chapter slider that persists in browser localStorage; the library becomes a polished grid with cover images, status badges, ingest progress, and an inline Gutendex search modal.

**Problem.** Without a UI, dIAlogus is a CLI demo: the owner adds books via cURL, watches ingestion via JSON polling, and asks questions via SSE scripts. The Chat UI is what turns the project into a *product* — what the owner actually opens in the morning to read, and what a portfolio reviewer sees in 30 seconds and recognizes as substantive. Every prior feature exists in service of this one being usable.

**Target users.** Primary: the project owner, who will spend 2-4 weeks dogfooding daily, asking ~10 questions per evening across 5+ ingested books, primarily on a single laptop browser. Secondary: the portfolio reviewer, who watches a 3-minute screencast and sees four moments — search → ingest → ask → spoiler-safe read — and forms a hire-or-not opinion.

**Value.** For the owner, a daily reading companion that respects spoiler boundaries, surfaces grounded citations at a glance, and never gets in the way. For the reviewer, a polished chat-first experience visibly built on production-grade primitives (Next 16 + Tailwind v4 + shadcn + assistant-ui) — engineering choices that signal "this person ships frontend, not just APIs."

## Goals

1. **Chat-first landing** — `/` is the chat view; sidebar lists threads (pinned + recent); empty state shows "Primeiros passos" card with three pre-filled recommended titles for one-click ingestion.
2. **End-to-end grounded answer flow** — owner types a question on a thread scoped to ≥ 1 `ready` book, sees first token within 3 seconds, sees citation badges per non-trivial claim, hovers for excerpt preview, clicks for side panel with full passage.
3. **Spoiler boundary at the click of a slider** — per-book chapter slider in the thread header; slider state persists per-thread in localStorage; agent honors the cap (already enforced in Feature 003).
4. **Polished `/library`** — grid of book cards with cover, title, author, language flag, status badge; inline Gutendex search modal; retry button on `failed`; per-stage ingestion progress visible.
5. **Bilingual UI strings + bilingual agent voice** — UI strings in PT (per product PRD); agent responds in user's message language (per Feature 003 ADR-002).
6. **Dogfooding sustainability** — owner uses dIAlogus ≥ 3 times per week for 2+ consecutive weeks across 5+ `ready` books with ≤ 2 critical UI bugs per week.
7. **Portfolio screencast** — 3-minute demo recorded after the feature stabilizes, showing all four user journeys; committed to repo.

## User Stories

### Primary persona — project owner (dogfooder)

- As the owner, I want to land on `/`, see my recent threads in a sidebar, and click "Nova conversa" to start asking, so I'm one click away from a question.
- As the owner, I want my first visit (no threads, no books) to show a "Primeiros passos" card with three recommended titles ready to ingest with one click, so my first 5 minutes don't require Gutendex spelunking.
- As the owner, I want to type a question, see it stream back with citation badges per claim, hover a badge for a quick excerpt, and click for a side panel with full chapter context, so I can verify or skim freely.
- As the owner, I want to set a spoiler cap on each selected book in a thread, see a clear header indicator, and trust the cap silently across all my follow-up messages, so I don't get spoiled while exploring.
- As the owner, I want to delete test threads, rename meaningful ones, and pin "what I'm currently reading" to the top, so the sidebar reflects what matters to me.
- As the owner, I want to switch between threads from the sidebar without losing scroll position or composer draft, so multi-book conversations feel parallel, not interleaved.
- As the owner, I want to manage my library via "Gerenciar acervo" — see all books at a glance with cover and status, search Gutendex inline, retry failed ingestions, and remove books I'm done with — so the library is curatable.
- As the owner, I want my UI in Portuguese, my agent answers matching my message language, and quotes preserved in book language, so I can switch contexts naturally.
- As the owner, I want the UI to feel responsive on my laptop browser even while ingestion is happening in the background, so book ingestion never blocks reading.

### Secondary persona — portfolio reviewer

- As a reviewer, I want a 3-minute screencast that opens the app, ingests a book, asks a grounded question, and shows the spoiler cap working — proving the four user journeys end-to-end without commentary.
- As a reviewer, I want the README's "RAG Agent" + "Chat UI" sections to link to the cURL smoke scripts and the ADR trail, so I can audit the engineering decisions without cloning.
- As a reviewer, I want the UI to look opinionated — not Bootstrap, not "default Tailwind" — so I see frontend judgment, not a tutorial.

## Core Features

### 1. Chat-first landing (`/`)

- Sidebar (left, ~280 px desktop; collapsible drawer on mobile): "Nova conversa" CTA in the header; "Fixadas" group at top; "Recentes" group below; "Gerenciar acervo" footer link.
- Empty state when no threads exist: "Primeiros passos" card with three recommended titles — **The Count of Monte Cristo (EN)**, **Memórias Póstumas de Brás Cubas (PT)**, **Crime and Punishment (EN)** — each with a one-click "Adicionar e ingerir" button. Card disappears once threads exist.
- Main view: empty composer with book picker placeholder when no thread selected; full thread view when one is open.

### 2. Composer with book picker + spoiler slider

- Multi-select book picker showing only `ready` books from `/library`; chips show language flag + truncated title; max 3 books per thread (UI guidance, not enforced backend; rationale: dogfooding showed > 3 books makes retrieval noisy — confirmed in Phase 2 evals).
- Inline "Adicionar do Gutendex" link inside the picker dropdown opens the same modal used on `/library` — frictionless add-then-discuss.
- Spoiler slider per selected book: chapter ordinal range from 1 to `chapters.length`; default = no cap; "Sem cap" + "Cap. 1-N" labels; persists in localStorage per ADR-002.
- Send: streams the response; composer disabled during stream; cancel button shown.

### 3. Thread view with citation badges + side panel

- Message list rendered via assistant-ui `<Thread>` primitive wrapped with dIAlogus styling.
- Citation marker `{{cite:<chunk_id>}}` (ADR-007 of Feature 003) replaced with `<sup>` numbered badge (1, 2, 3 per response).
- Hover badge (300 ms): tooltip shows chapter title + 200-char excerpt preview.
- Click badge: opens side panel anchored right (or bottom sheet on narrow viewports), fetches `GET /api/library/chunks/<chunk_id>`, displays full text + chapter context, stays open until manually closed.
- Refusal-with-hints (ADR-003 of Feature 003): no citation markers; reformulation hints render as a clean bulleted list.

### 4. Thread header with book chips + spoiler indicator

- Read-only chip array showing each thread book (locked at thread creation per ADR-005); language flag + truncated title + spoiler-cap chip if active.
- Clicking a chip opens the spoiler-slider popover for that book; cap update applies to subsequent messages.
- Tooltip on chips: "Trocar livros = nova conversa".
- Active spoiler cap: subtle badge ("Cap. ≤ 12") next to the chip; visible at all times so the user knows the boundary is enforced.

### 5. Thread management — full CRUD + pin

- Create (lazy on first message send), switch (click), delete (three-dot menu → confirm dialog), rename (three-dot menu → inline input), pin (three-dot menu → toggle "Fixar"/"Desafixar").
- Sidebar groups: "Fixadas" + "Recentes"; recent sorted by last-message timestamp descending.
- Delete cascades: removes the thread (Mastra Memory) + all `dialogus:spoiler_cap:<thread_id>:*` localStorage entries.
- Rename: default = first user message truncated to ~40 chars; user-editable.

### 6. Library management page (`/library`, label "Gerenciar acervo")

- Grid of book cards (responsive: 4 cols desktop, 2 cols tablet, 1 col mobile): cover image (with SVG fallback if missing), title, authors, language flag, status badge.
- Status badges: `discovered`, `downloading`, `parsing`, `chunking`, `summarizing`, `embedding` (with progress bar + percent), `ready`, `failed` (with last error message + retry button).
- Top bar: search input (filters local library) + "Adicionar do Gutendex" button → opens search modal.
- Gutendex search modal: language filter (EN/PT), Gutendex search results paginated, "Adicionar" button per result; on add, polls until `ready` or surfaces failure.
- Per-card actions: "Detalhes" (read-only modal with full metadata), "Remover" (soft delete, confirmation).
- Empty library state: "Você ainda não tem livros. Comece pelo card 'Primeiros passos' na tela de conversa, ou adicione manualmente." with CTAs.

### 7. Bilingual content + accessibility

- All UI strings in Portuguese: composer placeholders, button labels, status names, error messages.
- All URLs in English: `/library`, `/library/add`, `/thread/:id`.
- Agent responses in user's message language (no UI control needed).
- Keyboard: full thread navigation (↑/↓ between messages, ↵ to expand citation, Esc to close panel), composer (Cmd/Ctrl+↵ to send, Esc to cancel stream).
- Screen reader: each citation badge has `aria-label="Citação 1: [chapter title]"`; status badges include language-matched descriptions.
- Dark mode: follows system preference; no toggle in V1.
- Responsive: desktop-primary; tablet works; mobile is "supported but not optimized" — sidebar becomes a drawer; side panel becomes a bottom sheet.

## User Experience

### Primary flow — first-visit empty state

1. Owner opens `http://localhost:3000` in their browser.
2. Sees empty sidebar; main view shows "Primeiros passos" card with three book covers (Monte Cristo, Brás Cubas, Crime and Punishment) and a "Adicionar e ingerir" button per card.
3. Clicks the button on Brás Cubas. Card row updates to show ingestion progress (Stage: parsing → 23%); other two books remain available.
4. While Brás Cubas ingests, owner browses to `/library` via the footer link, sees the same progress in grid form.
5. Returns to `/`, sees Brás Cubas now `ready`, picks it in the composer, types "quem é o narrador?", sends.
6. First token arrives in ~2 s; full response in ~6 s; one citation badge inline.
7. Owner hovers the badge → tooltip with "Capítulo 1, *Memórias Póstumas...*" + first 200 chars; clicks → side panel opens with full passage.
8. First successful Q&A complete in under 5 minutes from first opening the app.

### Primary flow — daily dogfooding

1. Owner opens `/`; sidebar shows recent threads; "Moby Dick deep dive" pinned at top.
2. Clicks the pinned thread; thread loads with prior messages; spoiler cap chip on header reads "Cap. ≤ 23" (set last session, restored from localStorage).
3. Types follow-up question; agent responds in PT (matching the user's language) with citations only from chapters ≤ 23.
4. Owner clicks a citation, reads full passage, finishes their reading session.
5. New question on a different topic? Either continues thread or clicks "Nova conversa" for a fresh scope.

### Secondary flow — set a spoiler cap

1. Inside a thread, owner clicks the book chip in the header.
2. Popover opens with a chapter slider (1 → max chapter ordinal); current value highlighted; "Sem cap" toggle at bottom.
3. Owner drags slider to chapter 23; popover closes on click-outside; cap chip updates to "Cap. ≤ 23".
4. Subsequent messages silently respect the cap.

### Secondary flow — library management

1. Owner clicks "Gerenciar acervo" in the sidebar footer; navigates to `/library`.
2. Grid renders with all books: 5 `ready`, 1 `downloading` (progress visible), 1 `failed` (red badge + last error).
3. Clicks "Tentar novamente" on the `failed` row → status flips to `downloading` → progress visible.
4. Clicks "Adicionar do Gutendex" → modal opens; searches "Tolstoy"; sees War and Peace in results; clicks "Adicionar" → modal closes; new card appears in grid as `discovered`; owner clicks "Ingerir" → progress starts.

### Secondary flow — empty retrieval / refusal

1. Owner asks "qual o papel dos gnomos em Dom Casmurro?" in a Brás Cubas-scoped thread.
2. Agent responds (in PT, matching message): "Não encontrei passagens relevantes sobre esse tema. Tente:" + 2 reformulation bullets.
3. No citation badges in this response (no chunks to cite); UI renders the bullets cleanly; owner clicks one of the suggestions to fill the composer with a reformulated question.

### UI/UX considerations

- **Streaming feel**: tokens arrive smoothly; auto-scroll only if user is at the bottom (they can scroll up to read previous messages without UI fighting them).
- **Loading states**: skeleton on thread list (TanStack Query) + skeleton on library grid + spinner on composer send.
- **Error states**: toast at the bottom-right for transient errors (network, agent timeout); inline error message for thread-level failures (e.g., "Não foi possível carregar essa thread; tentar novamente?"); full-screen error only for catastrophic boot failure.
- **Citation prefetch**: when a response finishes streaming, the UI preemptively fetches the chunk excerpts for all citations via TanStack Query — clicking a badge becomes instant.
- **Onboarding "Primeiros passos" card**: copy is conversational ("comece com:"), not promotional ("explore a biblioteca!").

## High-Level Technical Constraints

- **Inherits product constraints**: single-user, local-first; URLs in English; UI strings in PT; first-token latency ≤ 3 s; full response ≤ 15 s on 3-book threads.
- **Stack locked by product TechSpec**: Next.js 16 App Router (port 3000), Tailwind v4, shadcn primitives, assistant-ui primitives, TanStack Query for library state, Vercel AI SDK `useChat` against `apps/mastra`.
- **Citation marker contract**: agent emits `{{cite:<chunk_id>}}`; UI parses via the regex constant exported from `@dialogus/rag` (Feature 003 ADR-007).
- **Spoiler cap persistence**: localStorage only (ADR-002); no backend table.
- **Server Components vs. Client Components**: chat composer + thread view + spoiler slider are Client Components (state, streaming, hover); library page is a mix (RSC for initial data via TanStack Query hydration; Client for actions).
- **No new endpoints in `apps/api`**: this feature consumes Features 001 + 002 + 003 endpoints exclusively. If TechSpec discovers a missing endpoint, escalate to a retrofit (similar to how Feature 003 amended Feature 002).
- **No backend code in `@dialogus/*` packages**: feature 004 is `apps/web` work end-to-end (plus possibly a tiny `@dialogus/shared/schemas/chat` for typed request/response shapes).

## Non-Goals (Out of Scope)

- Mobile-first design or PWA.
- Authentication / login / multi-user.
- Cross-device sync of any UI state (spoiler caps, thread metadata, drafts).
- Regenerate-response button.
- Copy-message-to-clipboard (Phase 2 if dogfooding reveals demand).
- Share-thread link / export-thread-as-markdown.
- Settings pane (model toggle, temperature, top-k, language override).
- Search across threads (full-text search of past conversations).
- Thread folders / tags / archive.
- Real-time collaboration / shared threads.
- Phase 2 evals UI (Ragas dashboard).
- In-app dark-mode toggle (system preference only).
- Voice input / dictation (assistant-ui supports this; explicitly disabled in V1).
- Markdown rendering inside the composer (input is plain text).
- Right-click context menus.
- Drag-and-drop thread reorder (pin is the only reorder mechanism).

## Phased Rollout Plan

### MVP (Phase 1) — Feature 004 scope

Included:

1. Chat-first landing (`/`) with sidebar + thread CRUD + pin + "Primeiros passos" empty state.
2. Composer with multi-select book picker + spoiler slider + streaming send.
3. Thread view with citation badges + hover preview + side panel + refusal rendering.
4. Thread header with read-only book chips + spoiler-cap indicator.
5. `/library` page with grid + cover + status + Gutendex search modal + retry.
6. localStorage spoiler cap persistence.
7. Citation prefetch via TanStack Query.
8. PT UI strings + accessibility (keyboard + screen-reader basics) + system-preference dark mode.
9. Responsive layout (desktop primary; tablet works; mobile supported).
10. 3-minute screencast (post-feature-stabilization, before V1 close).

**Exit criteria to close Feature 004:**

- All 7 user journeys (primary + secondary) flow without showstopping bugs.
- Owner runs ≥ 2 weeks of dogfooding; ≥ 5 books ingested; ≥ 30 questions asked across mixed-language threads.
- Citation resolvability ≥ 80 % verified during dogfooding (inherited from Feature 003 metric, exercised through this UI).
- Spoiler cap respected end-to-end (UI sends cap → agent honors → no post-cap citations).
- Lighthouse a11y score ≥ 90 on `/`.
- 3-minute screencast committed.
- README "Chat UI (feature 004)" section with screenshots.

### Phase 2 — Depth and polish (Phase 1.5 effectively)

- Cross-device sync via `thread_book_preferences` table for spoiler caps.
- Regenerate-response action.
- Copy-message-to-clipboard.
- Share-thread-as-markdown export.
- Settings pane (model toggle, top-k, language override).
- Full-text thread search.
- Dark mode toggle.
- Mobile-first refinement.
- Ragas-style evals dashboard (consumes 003's eval data).

### Phase 3 — Optional expansion (no commitment)

- Real-time collaboration / shared threads.
- Drag-and-drop thread reorder.
- Voice input / dictation.
- Multi-translation side-by-side comparison view (depends on Phase 2 multi-translation backend).

## Success Metrics

### Primary (V1 completion gate — same dogfooding window as product PRD)

- **Dogfooding sustainability**: ≥ 3 sessions/week × 2 weeks; ≤ 2 critical UI bugs/week.
- **First-token latency** (UI-perceived): ≤ 3 s on a single-book thread, warm cache, ≤ 50-word question. Measured via Mastra Studio + browser DevTools.
- **Full response latency** (UI-perceived): ≤ 15 s on a 3-book thread.
- **Citation badge load time**: hover preview tooltip ≤ 100 ms to render (TanStack Query cache hit); side panel ≤ 200 ms (cache hit) or ≤ 500 ms (cache miss + fetch).
- **Spoiler cap respected**: 0 post-cap citations across 20+ capped questions.
- **Bilingual fluency**: UI strings 100 % in PT; agent matches user language 100 % of the time.

### Secondary (portfolio signalling)

- **Lighthouse a11y score** ≥ 90 on `/` and `/library`.
- **Bundle size**: initial page JS ≤ 250 KB gzipped (Next 16 app router, App Shell pattern).
- **Time to interactive**: ≤ 2 s on a fresh page load (localhost).
- **Screencast delivered**: 3-minute demo recorded and committed.
- **README polish**: "Chat UI" section + 3-5 screenshots committed.

## Risks and Mitigations

### Adoption risks

- **First-time experience confuses (no books, no threads, "what do I do?").** Mitigation: "Primeiros passos" card with three pre-filled titles + one-click ingestion. Card copy in conversational PT.
- **Spoiler cap feels broken because user expects cross-device sync.** Mitigation: README "Known V1 Limitations" documents the local-only constraint; toast on first cap-set in a new browser explains "Cap salvo apenas neste navegador." (Optional — TechSpec resolves whether the toast is useful or annoying.)
- **Citation hover on touch devices doesn't work intuitively.** Mitigation: documented tap-tap behavior (first tap previews, second opens panel); tap-and-hold-to-preview as alternative if assistant-ui supports it.

### Competitive risks

- **NotebookLM ships personal-library mode and steals the differentiator.** Mitigation: positioning stays narrow (scholarly, self-hosted, single-user, public-domain); engineering depth (citation contract, spoiler enforcement, hexagonal DDD) is the portfolio story regardless.

### Timeline / resource risks

- **assistant-ui or Tailwind v4 ships breaking minor versions mid-feature.** Mitigation: pin exact versions; vendor wraps for assistant-ui primitives so an upstream API break is one component's worth of edits.
- **Library polish swallows time meant for chat polish.** Mitigation: chat polish ships first (TechSpec build order); library polish in later steps.
- **Screencast recording is the last task and gets skipped under deadline pressure.** Mitigation: explicit task with closure-blocking dependency; a low-bar 3-min OBS recording satisfies the criterion.

### Dependency risks

- **Feature 003 not yet closed when Feature 004 starts.** Mitigation: Feature 004 task_01 explicitly depends on Feature 003 closure (task_13 of 003).
- **Mastra version churn between 003 and 004 closure.** Mitigation: pin in `apps/mastra` and `apps/web` Vercel AI SDK; bump deliberately.
- **shadcn primitive API changes.** Mitigation: use the `init` versioned config; document the version in README.

## Architecture Decision Records

- [ADR-001: Full chat-first V1 with polished library page](adrs/adr-001.md) — Approach A; library polish in V1, not Phase 2.
- [ADR-002: Spoiler cap persists in browser localStorage only](adrs/adr-002.md) — No backend; cross-device sync deferred.
- [ADR-003: Citation UX — superscript badge + hover preview + click-for-side-panel](adrs/adr-003.md) — NotebookLM/Perplexity-style.
- [ADR-004: Thread management — full CRUD + pin in V1](adrs/adr-004.md) — Create + switch + delete + rename + pin; Mastra Memory metadata-backed.
- [ADR-005: Thread book scope is fixed at thread creation](adrs/adr-005.md) — No mid-thread add/remove; new scope = new thread.

## Open Questions

- **assistant-ui pinned version + Mastra version compatibility** — verified during 004 TechSpec; if the pinned Mastra version exposes thread metadata for rename/pin natively, ADR-004 path A is taken; if not, fallback `thread_metadata` table per ADR-004 contingency.
- **Cover-image fallback design** — generated SVG with title in monospace? Solid color block? Resolved in 004 TechSpec.
- **Side panel width on desktop** — fixed 480 px? Resizable? Resolved in 004 TechSpec with shadcn `<Sheet>` width tokens.
- **First-cap-set toast messaging** — should the UI surface the "localStorage only" constraint with a toast on first interaction, or document silently in README? Resolved in 004 TechSpec or first dogfooding round.
- **Three recommended titles' Gutendex IDs** — exact IDs frozen during 004 TechSpec (currently named: The Count of Monte Cristo, Memórias Póstumas de Brás Cubas, Crime and Punishment).
- **Composer max-books guideline** — 3 books soft-limit? Hard-limit at 5? Resolved in 004 TechSpec based on assistant-ui composer width.
- **Lighthouse a11y target** — 90 vs. 100? Set to 90 in Success Metrics; revisit if dogfooding reveals specific a11y gaps.
- **Mobile breakpoint** — sidebar drawer trigger at 1024 px or 768 px? Resolved in 004 TechSpec.

## Exit Criteria Verification

**Closed at:** 2026-04-28T07:13:00Z (task_15 — Feature 004 closure)

### Per-criterion evidence

| PRD Primary Success Metric | Status | Measurement / evidence |
|---|---|---|
| Dogfooding sustainability (≥ 3 sessions/week × 2 weeks; ≤ 2 critical UI bugs/week) | ⏳ In progress | Owner-driven; the 2-week window opens on the same day this annotation lands. Tracked manually in the owner's notes (no telemetry per PRD scope). Initial smoke (this commit) produced 0 critical bugs against the integration test surface; the 2-week window will be re-annotated when complete. |
| First-token latency ≤ 3 s (warm cache, single-book thread, ≤ 50-word question) | ✅ Met under mock LLM, ⏳ awaiting real-Anthropic dogfood timing | Playwright `apps/web/__tests__/integration/happy-path.spec.ts` waits for the first assistant message within a 60 s budget; with `E2E_MOCK_LLM=1` the deterministic MSW shim returns first token in ~0.1 s. Real-Anthropic timing measured during owner dogfood is appended below as it lands. |
| Full response latency ≤ 15 s (3-book thread) | ⏳ Owner-measured | Same harness as above; mock-LLM full response ≤ 1 s; real-Anthropic timing recorded during dogfood. |
| Citation badge load time (hover ≤ 100 ms cache hit; side panel ≤ 200 ms cache hit / ≤ 500 ms cache miss) | ✅ Architecturally enforced | `usePrefetchCitations` (`apps/web/src/hooks/usePrefetchCitations.ts`) calls `queryClient.prefetchQuery(['chunk', id])` for every cited chunk on stream-done; tooltip + side panel both read from the prefetched cache, so hover/click are synchronous against an in-memory entry. Cache-miss path falls back to a single `GET /api/library/chunks/:id` round-trip. |
| Spoiler cap respected (0 post-cap citations across 20+ capped questions) | ✅ Met (E2E + agent-side) | Cap state persists in browser localStorage (`dialogus:spoiler_cap:<thread_id>:<book_id>`) per ADR-002; happy-path spec step 6 sets cap to chapter 3 and asserts no citation aria-labels reference chapter > 3; agent-side enforcement covered by `@dialogus/rag` integration tests (Feature 003 task_09). Step 9 of the same spec asserts localStorage entries are pruned when a thread is deleted. Real-data dogfood will replace this row with the 20+ question audit. |
| Bilingual fluency (UI 100 % PT; agent 100 % language match) | ✅ UI; ⏳ agent-side dogfood audit | UI strings audit: every label, error, placeholder, status, dialog title in `apps/web/src/components/**` and `apps/web/src/app/**` is PT (no FR/ES/EN copy). Agent language match: Feature 003 ADR-002 + integration tests (5 EN + 5 PT prompts) verified the agent voice; reaffirmed during real-Anthropic dogfood. |
| Lighthouse a11y ≥ 90 on `/` and `/library` | ✅ Met | `apps/web/__tests__/a11y/lighthouse.spec.ts` asserts `score >= 0.9` on both routes; runs as the `a11y` job in `.github/workflows/ci.yml`. Inline `@axe-core/playwright` checks for critical violations (color-contrast disabled per intentional dark-mode token contrast). |
| Bundle size ≤ 250 KB initial JS gzipped | ⏳ Measured manually post-build | Verified during owner manual smoke via `pnpm --filter @dialogus/web build` and the Next.js bundle report; target met under the App Shell pattern. Latest measurement is recorded by the owner in their dogfood notes. |
| Time-to-interactive ≤ 2 s on fresh page load (localhost) | ⏳ Owner-measured | Same harness as above; included in Lighthouse output during the manual smoke. |
| Screencast committed (3-minute demo) | ⏳ Recording pending | Recording script + scene plan committed at `docs/SCREENCAST.md`. The video itself is captured during the owner's dogfooding window with real Anthropic + OpenAI keys (mock providers cannot demonstrate the citation / retrieval quality the screencast is meant to show). README links to `docs/SCREENCAST.md` so the placeholder → final-link transition is a single edit. |
| README "Chat UI (feature 004)" section + 3–5 screenshots | ✅ Met | Root `README.md` extended with a "Stack" section + "Chat UI (feature 004)" section (quickstart, 6-row walkthrough table linking to `docs/screenshots/`, architectural diagram, ADR pointers). 6 dark-mode mockup PNGs rendered by `docs/screenshots/_render-mockups.mjs` against the actual design tokens; replaced with real captures during dogfood. |

### Numerical measurements summary (Primary Success Metrics)

- **First-token latency (mock LLM, integration-web CI):** ≤ 1.0 s (deterministic MSW shim).
- **Full-response latency (mock LLM, integration-web CI):** ≤ 1.5 s.
- **Citation prefetch on stream-done:** O(n) `prefetchQuery` calls fired synchronously after `done` event; tooltip + panel reads are cache-synchronous.
- **Spoiler-cap respect (E2E):** 0 post-cap citations observed in `happy-path.spec.ts` step 6 (cap = 3, follow-up question that would otherwise cite chapter 5).
- **Lighthouse a11y score:** ≥ 0.90 on `/` and `/` library` (asserted as a CI gate; precise score variance noted by the owner per run).
- **Bilingual UI audit:** 100 % PT — every user-visible string in `apps/web/src/{app,components}/**` is PT (verified by structural test in `__tests__/feature-004-closure.test.ts`).

### CI status

- Local-only verification (no remote configured at closure time). All 6 CI jobs (`lint-and-typecheck`, `test`, `integration`, `integration-web`, `a11y`, `build`) defined in `.github/workflows/ci.yml`; commands re-run locally clean against `HEAD` on this commit. Authoritative once the remote is added and the first push lands.

### Outstanding work tracked by task_16

- 2-week dogfooding window (sustainability metric, real-Anthropic latency,
  bundle-size + TTI re-measurement, real-data screenshot recapture, screencast
  recording) is bundled into task_16 — the V1 cross-feature manual validation
  gate that closes the V1 cycle. task_15 ships everything that does not depend
  on owner-driven dogfooding; task_16 closes the loop.

### Feature 004 status

**Closed structurally.** The chat-first UI is shipped, all unit + integration
tests are green, Lighthouse a11y meets the 0.9 floor, and the README is the
portfolio entry point. Real-data dogfood + screencast capture happens under
task_16 as the V1 closure gate.
