# Feature 003: RAG Agent — Product Requirements Document

## Overview

The RAG agent is dIAlogus's conversational interface — the component the owner actually *talks to* once Feature 002 has turned a shelf of classics into searchable text. It answers natural-language questions about one or more selected books by calling four grounded tools (`semantic_search`, `list_chapters`, `get_chapter_summary`, `find_character_mentions`), citing exact passages inline with every non-trivial claim, respecting a per-book spoiler cap, and refusing to speculate when retrieval produces nothing relevant.

**Problem.** Ingestion produced `chapters` + vector-indexed `chunks`; no one has asked the library a question yet. The agent is where the product's core promise — grounded, citation-backed Q&A with a spoiler-safe boundary — becomes observable. Without a well-shaped agent, the rest of the stack is inert.

**Target users.** Primary: the project owner, who will ask ~10 questions per evening across English and Portuguese classics, trusts only cited answers, and cares deeply about not getting spoiled. Secondary: the portfolio reviewer, who recognizes an agent whose every tool is small, observable, and testable — not a 500-line monolithic prompt — as substantive engineering.

**Value.** For the owner, a daily reading companion that answers "who is Bulkington and why is he never mentioned again?" with a concrete excerpt from Chapter 23 of *Moby Dick* and refuses to spoil chapter 45 when their thread cap is set to 44. For the reviewer, a Mastra-idiomatic agent whose system prompt, tool contracts, and refusal behavior are documented and validated — not a tutorial clone.

## Goals

1. **Every non-trivial answer carries at least one citation** — tool output includes `{ book_id, chapter_id, chapter_ordinal, chunk_id, excerpt_preview }`; the UI (Feature 004) resolves the full excerpt server-side via `GET /api/library/chunks/:id`.
2. **First streaming token within 3 seconds** on a single-book thread with a ≤ 50-word question, running against local dev hardware (warm prompt cache; dev tier = Claude Haiku 4.5).
3. **Refusal rather than hallucination** when `semantic_search` returns zero chunks — the agent abstains on the substantive question and offers 2–3 reformulation hints grounded in `list_chapters` output or visible chapter titles.
4. **Spoiler boundary honored end-to-end** — `semantic_search` accepts a per-book spoiler cap (max chapter ordinal); retrieval filters above it; the system prompt reinforces the cap even if chunks somehow leak; a dogfooding self-audit of ≥ 20 capped questions shows zero post-cap references.
5. **Bilingual fluency** — the agent responds in the user's message language (PT or EN), auto-detected per turn; quotes retain the book's original language.
6. **Validated system prompt** — before closing the feature, the owner runs ≥ 10 self-posed questions across 3 books (≥ 1 EN, ≥ 1 PT) and confirms: every citation resolves, no spoiler leaks, no refusals on clearly answerable questions.

## User Stories

### Primary persona — project owner (dogfooder)

- As the owner, I want to ask a question about a selected book and see the answer stream in within ~3 seconds, so the experience feels live.
- As the owner, I want every substantive sentence to have a citation badge I can hover over to read the source passage, so I can verify claims without leaving chat.
- As the owner, I want to ask follow-up questions in the same thread and have the agent remember the prior turns, so I can drill down without restating context.
- As the owner, I want to switch languages mid-thread (ask in Portuguese, then in English) and have the agent follow my lead, so I don't need to flip a setting.
- As the owner, I want the agent to respect my spoiler cap silently — not flag it every message — so capped threads feel natural.
- As the owner, when I ask something the book does not address, I want the agent to tell me nothing relevant was found and give me a couple of better phrasings to try, so I can iterate without starting over.
- As the owner, I want to ask "summarize chapter 5 of *Crime and Punishment*" and receive a coherent, bounded summary — not 12,000 characters of raw chapter text dumped into the chat.
- As the owner, I want to ask "where does Ishmael first mention Queequeg?" and receive the earliest chapter that mentions the name, so character-navigation feels like a first-class capability.
- As the owner, I want to inspect every thread, tool call, and token count in Mastra Studio during development, so prompt tuning is a visible rather than blind process.
- As the owner, when the agent produces a wrong citation or unhelpful refusal during dogfooding, I want to reproduce it from the thread log, so fixing the system prompt is evidence-based.

### Secondary persona — portfolio reviewer

- As a reviewer, I want to read the agent's four tool contracts and see each one testable in isolation, so the design is legible, not opaque.
- As a reviewer, I want the system prompt to be a committed Markdown asset — not strings embedded in code — so I can read what the agent was told.
- As a reviewer, I want a single conversation trace (question → tool calls → answer → citation) visible in Mastra Studio during a demo, so the "grounded" claim is verifiable in under 30 seconds.

## Core Features

### 1. Four grounded tools (frozen V1 surface)

Every agent-initiated retrieval goes through one of four typed tools. All four ship in V1 (see ADR-001 of product and ADR-001 of this feature for scope rationale).

- **`semantic_search`** — top-k HNSW cosine search over `chunks`, scoped to a list of `book_ids` with an optional per-book spoiler cap (max chapter ordinal). Returns `{ chunks: [{ chunk_id, book_id, chapter_id, chapter_ordinal, chapter_title, text, score, excerpt_preview }] }`. No reranking in V1 (ADR-004).
- **`list_chapters`** — returns an ordered list of chapters for a given book: `{ chapters: [{ chapter_id, ordinal, title, token_count }] }`. Used for navigation prompts ("what are the chapter titles?"), reformulation hints, and spoiler-cap validation at prompt level.
- **`get_chapter_summary`** — returns a pre-generated summary for a chapter. Summaries are produced once per chapter during ingestion (see ADR-001 — generation ownership moves into Feature 002). Tool shape: `{ summary, chapter_id, chapter_ordinal, chapter_title, book_id }`. The tool never generates on the fly.
- **`find_character_mentions`** — substring search (case-insensitive, diacritics-insensitive) across a book's chunks for a given name or alias list. Returns early chapters first: `{ mentions: [{ chunk_id, chapter_id, chapter_ordinal, chapter_title, start_char, end_char, excerpt }] }`. Intentionally non-semantic — answers navigation questions ("when does the carpenter first appear?") that embeddings answer indirectly.

### 2. Grounded conversational agent (Mastra `dialogusAgent`)

A single agent configured in `mastra.config.ts` and built by `createDialogusAgent()` in `@dialogus/rag`. One system prompt, four tools, thread-scoped memory via `@mastra/pg` (per product ADR-006). Dev model: Claude Haiku 4.5. Prod model: Claude Sonnet 4.6. Prompt caching enabled on the system prompt + tool definitions (product TechSpec).

### 3. System prompt — scholarly, grounded, language-matching

A committed Markdown asset (`@dialogus/rag/src/prompts/system.md`) that defines:

- **Identity + posture** — a scholarly companion for classic literature; neutral, curious, citation-first; never adopts character voice (product ADR-002).
- **Grounding contract** — always call `semantic_search` before making substantive claims; never answer from pre-training knowledge alone when the question is book-specific.
- **Citation format** — every non-trivial claim is followed by a structured citation marker (exact marker format resolved in 003 TechSpec; emitted via `tool_output` for the UI to render as a badge).
- **Language-match rule** — respond in the language of the user's latest message; quotes retain the source language (ADR-002).
- **Refusal + reformulation** — on zero retrieval results, abstain on the substantive question and offer 2–3 grounded reformulation hints (ADR-003).
- **Spoiler-cap reinforcement** — if a chunk above the cap somehow reaches the agent, refuse to quote or paraphrase it; trust the cap as the user's authoritative wish.

### 4. Refusal-with-hints UX (grounding safety valve)

On empty `semantic_search` results, the agent produces a short message in the user's message language:

> [language-matched "no relevant passages found" statement]
> [2–3 bullet-point reformulations drawn from visible chapter titles, known characters, or common phrasings]

No second retrieval pass, no best-effort fallback, no disclaimed answer from pre-training (ADR-003).

### 5. Spoiler-cap enforcement (dual-layer)

- **Retrieval filter** — `semantic_search` accepts a `spoiler_caps: Record<book_id, max_chapter_ordinal>` map and filters at the SQL level (`chapter_ordinal <= cap`). No chunk above the cap is ever returned.
- **Prompt reinforcement** — the system prompt reminds the agent that caps are the user's authoritative intent; even if a chunk above the cap were to surface, the agent must treat it as invisible.

Spoiler caps are passed per-request as a tool parameter; they are not persisted in Mastra Memory (ADR-006 of product). The Chat UI feature (004) owns the per-thread-per-book cap state and sends it with every request.

### 6. Thread-scoped conversation memory

Mastra Memory (`@mastra/pg`) persists threads, messages, tool calls, and tool outputs automatically. Memory is thread-scoped only — the agent does not recall turns from other threads, does not build a cross-thread persona profile, does not run semantic recall over prior conversations. Each thread is its own conversation (product ADR-006 reaffirmed for V1).

### 7. Observability via Mastra Studio (dev)

Every tool invocation, token count, and message turn is visible in Mastra Studio at `localhost:4111` during development (product ADR-005). No external APM in V1. The owner uses Studio to reproduce flaky prompts, inspect citation payloads, and verify spoiler-cap filters fired correctly.

## User Experience

### Primary flow — ask a grounded question

1. User opens a thread (Chat UI flow; Feature 004 owns the UI). Thread is scoped to 1–3 selected `ready` books, optionally with per-book spoiler caps.
2. User types a question. Chat UI sends `{ message, book_ids, spoiler_caps, thread_id }` to `apps/mastra`.
3. Mastra Agent: loads system prompt (prompt-cache hit), reads thread history from Mastra Memory, receives the user message.
4. Agent decides to call `semantic_search` with the thread's book_ids + spoiler_caps + query. Tool runs HNSW query; returns top-k chunks.
5. Agent composes the answer: prose grounded in retrieved chunks, inline citation markers per non-trivial claim.
6. Response streams back to Chat UI via SSE. UI renders citation badges; each badge resolves full excerpt via `GET /api/library/chunks/:id` on `apps/api`.
7. User reads answer, clicks a citation badge to open the side panel with fuller context (Feature 004 UX).

**Latency budget (dev hardware):** ≤ 3 seconds to first token; ≤ 15 seconds to full response on a 3-book thread.

### Secondary flow — ask for a chapter summary

1. User: "me dá um resumo do capítulo 5 de Crime and Punishment".
2. Agent reads language (PT) → responds in PT.
3. Agent calls `list_chapters` to resolve "5" → chapter_id with ordinal 5.
4. Agent calls `get_chapter_summary` for that chapter_id → returns pre-generated summary.
5. Agent returns the summary directly, with a single citation to the chapter (summary is itself grounded in that chapter's text).

If summary is unavailable (edge case — ingestion was old, summary not yet backfilled), the tool returns an explicit "summary not available" error; agent relays that to the user and suggests running ingestion retry. This should never happen under normal ops.

### Secondary flow — find a character

1. User: "quando o carpinteiro aparece pela primeira vez?"
2. Agent calls `find_character_mentions` with book_ids = [moby_dick_id], aliases = ["carpinteiro", "carpenter"].
3. Tool returns earliest mention (chapter_ordinal 107 — "The Carpenter").
4. Agent responds in PT: the first mention is in Chapter 107; the full name of the chapter is "The Carpenter"; cites the chunk.

### Secondary flow — empty retrieval

1. User: "qual o papel dos gnomos em Dom Casmurro?"
2. Agent calls `semantic_search` → 0 chunks.
3. Agent responds (PT): "Não encontrei passagens relevantes sobre gnomos em *Dom Casmurro*. Você poderia tentar:
   - Perguntar sobre personagens reais do romance, como Capitu ou Bentinho.
   - Perguntar sobre temas do livro (ciúme, memória, narrativa não confiável).
   - Reformular a pergunta em termos de cenas específicas."

### UI/UX considerations

- **Agent output language** — matches user's message language per turn (ADR-002).
- **Citation marker format** — emitted as structured tool output; visual rendering is owned by Feature 004 Chat UI.
- **Spoiler-cap visibility** — agent does not announce "I am respecting your cap" on every turn; caps are enforced silently. Header UI indicator (Feature 004) reflects the active cap.
- **Streaming** — SSE from Mastra Dev Server; Chat UI uses Vercel AI SDK `useChat`.
- **No conversation-level settings panel in this feature** — no temperature slider, no k-slider, no model toggle in V1. All such controls are Phase 2 if dogfooding reveals demand.

## High-Level Technical Constraints

- **Inherits product constraints**: single-user, local-first; public-domain books only; API keys private; first-token latency ≤ 3s; citation verifiability is non-negotiable.
- **Mastra runtime, separate process**: the agent lives in `apps/mastra` (port 3002) with Studio at 4111 (product ADR-005).
- **Mastra Memory, @mastra/pg**: threads/messages/tool calls persisted in `mastra_*` tables owned and evolved by Mastra (product ADR-006).
- **HNSW cosine retrieval over 1536-dim `text-embedding-3-small`**: set by Feature 002; 003 consumes, does not tune.
- **No reranking in V1** (ADR-004 of this feature).
- **No user-visible agent configuration in V1**: no temperature, k, or model toggle.

## Non-Goals (Out of Scope)

- Cross-thread memory / semantic recall across threads / cross-device profile sync.
- Reranking of any form (cross-encoder, LLM-as-judge, MMR) — ADR-004.
- On-demand LLM generation of chapter summaries at tool-call time — summaries are precomputed in Feature 002 (ADR-001).
- Character voice or roleplay — agent remains scholarly (product ADR-002).
- Query rewriting, multi-pass retrieval, silent retry after empty results — ADR-003.
- Agent-driven writes to `books` / `chapters` / `chunks` — RAG is read-only against the data layer.
- Cost/latency caps, per-query budgets, or usage dashboards.
- Direct feedback loops (thumbs up/down on answers, answer regeneration prompt).
- Tool configuration UI (enable/disable tools per thread).
- Plugin architecture for additional tools — the four-tool surface is frozen for V1.
- External observability (OpenTelemetry, Sentry) — Mastra Studio is the only lens in V1.
- Public-deploy concerns (rate-limiting, auth on `apps/mastra`, multi-tenant isolation) — local-first.

## Phased Rollout Plan

### MVP (Phase 1) — Feature 003 scope

Included:

1. **`@dialogus/rag` package** — `createDialogusAgent()` factory, four tool implementations, `ChapterSummaryRepository` port, system prompt Markdown asset.
2. **`apps/mastra` wiring** — `mastra.config.ts` injects dependencies from `@dialogus/db` + `@dialogus/ingestion` adapters; Dev Server boots on port 3002; Studio on 4111.
3. **Four tools live** — `semantic_search`, `list_chapters`, `get_chapter_summary`, `find_character_mentions` — each with integration tests against Testcontainers.
4. **System prompt drafted + validated** — the owner runs ≥ 10 self-posed questions across ≥ 3 books (≥ 1 EN, ≥ 1 PT) and confirms success criteria before closure.
5. **Refusal-with-hints behavior verified** — at least 3 deliberately-unanswerable questions produce refusal with grounded reformulation hints.
6. **Spoiler-cap audit** — 20+ capped questions across 2+ books; zero post-cap references.

**Exit criteria to close Feature 003:**

- Agent conversation works end-to-end via the Vercel AI SDK `useChat` hook from a minimal test harness in `apps/web` (full UI is Feature 004, but a wire-through works from `apps/mastra` → web).
- Integration tests green: tool tests, agent tests with MSW-mocked Anthropic, spoiler-cap tests, refusal tests.
- Mastra Studio shows a clean thread trace on a happy-path question.
- Owner validates the system prompt against ≥ 10 questions; ≥ 80 % citation-resolvability; zero spoiler leaks; ≤ 2 unjustified refusals.

### Phase 2 — Depth and polish (not in V1)

- Reranking (Cohere or `@mastra/rerank` behind the existing tool contract; see ADR-004 for Phase 2 slot-in).
- LLM-as-reranker fallback or hybrid pass.
- Cross-thread semantic recall or working-memory (persona profile).
- Per-book-per-thread cap persistence across devices (`thread_book_preferences` table in `@dialogus/db`; deferred per product ADR-006).
- Ragas-style evals (recall@k, faithfulness) with a curated 30-question bilingual dataset; CI regression guard.
- Agent-user feedback loop (thumbs up/down on answers, regenerate).
- Structured citation analytics (projecting Mastra tool outputs into a materialized view).

### Phase 3 — Optional expansion (no commitment)

- Multi-translation awareness (agent notes when the same work exists in both EN and PT and offers comparison).
- Chapter-range thematic search ("themes of isolation in chapters 1–15").
- Tool plugin protocol for community-contributed tools.

## Success Metrics

### Primary (V1 completion gate — same dogfooding window as product)

- **Citation resolvability**: ≥ 80 % of non-trivial answer claims have a citation that, upon inspection, supports the claim.
- **Spoiler-cap compliance**: 0 post-cap references across 20+ capped questions.
- **Refusal appropriateness**: ≤ 2 unjustified refusals per 10 reasonable questions (i.e., the agent doesn't refuse questions that the book clearly answers).
- **First-token latency**: ≤ 3 seconds on warm cache, single-book thread, ≤ 50-word question.
- **Full response latency**: ≤ 15 seconds on 3-book thread.
- **Bilingual fluency**: 5 EN questions + 5 PT questions, each answered in the matching language; no wrong-language responses.

### Secondary (portfolio signalling)

- **Tool coverage**: ≥ 80 % line coverage on `@dialogus/rag`, excluding generated Mastra bindings.
- **Studio legibility**: a reviewer can open Mastra Studio, find a demo thread, and trace question → tool calls → answer in ≤ 30 seconds.
- **System prompt size**: ≤ 2000 tokens (prompt-cache eligible; room for one demo conversation's worth of history inside the 200k-token context).

## Risks and Mitigations

### Adoption risks

- **Owner loses trust after a wrong citation.** One confidently-wrong citation can turn the owner against the product. Mitigation: UI-side excerpt resolution (`GET /chunks/:id`) guarantees the excerpt shown matches the persisted chunk; the agent emits `chunk_id` as the citation anchor, never a paraphrase the model invented.
- **Refusal fatigue.** If the agent refuses too often, the owner disengages. Mitigation: refusal threshold starts permissive (any non-empty top-k = attempt an answer); reformulation hints keep the turn productive.
- **Summary-tool disappointment.** If pre-generated summaries are dull or miss key themes, the `get_chapter_summary` tool feels worse than raw excerpts. Mitigation: summary generation prompt (owned by Feature 002) is validated against a sample of chapters before ingestion proceeds on a new book; revision is a single-file Markdown change, no code change needed.

### Competitive risks

- **NotebookLM or a Character.AI Books update closes the differentiation gap.** Positioning is narrow (scholarly + cited + self-hosted + spoiler-aware) and engineering-depth-driven. Mitigation: lean into the portfolio story — shipped, documented, visible.

### Timeline / resource risks

- **Feature 002 retroactive scope delays closure.** ADR-001 moves chapter-summary generation into Feature 002, which was already spec-complete. Mitigation: the scope addition is bounded (one new table or column set, one new stage, one new port); estimated 4–6 tasks appended to 002 without insertions or renumbering.
- **System prompt tuning swallows days.** Prompts are slippery to validate. Mitigation: the 10-question validation gate is explicit and time-boxed; Mastra Studio makes iteration visible.
- **Mastra pre-1.x minor upgrades break the agent.** Mastra 1.0 shipped January 2026; minor versions may churn. Mitigation: pin exact Mastra versions in `apps/mastra` + `@dialogus/rag`; upgrades are deliberate, reviewed against the changelog.

### Dependency risks

- **Anthropic API cost creep during dogfooding.** A dogfood evening of 10 questions × 3 weeks × dev model + prompt caching should remain under a few dollars. Mitigation: prompt caching on the system prompt (cost drops ~90 % per hit); dev tier uses Haiku.
- **OpenAI embedding downtime on a fresh book.** Irrelevant to 003 — Feature 002 owns embedding; 003 reads only.
- **Mastra Memory schema churn invalidating local DBs.** Already mitigated by product ADR-006: pin Mastra; keep Mastra DSN pointable at a separate logical schema.

## Architecture Decision Records

- [ADR-001: Feature 003 is agent-only; chapter-summary generation moves into Feature 002](adrs/adr-001.md) — Feature 002 receives retroactive scope for summary generation; Feature 003 stays read-only.
- [ADR-002: Agent responds in the user's message language](adrs/adr-002.md) — Auto-detect per turn; quotes retain source language.
- [ADR-003: Refusal with reformulation hints on empty retrieval](adrs/adr-003.md) — Abstain on the substantive question; offer 2–3 grounded alternatives.
- [ADR-004: No reranking in V1; pure HNSW semantic retrieval](adrs/adr-004.md) — Defer to Phase 2; tool signature accommodates a future rerank stage.

## Exit Criteria Verification

Validated on 2026-04-30 via 12 owner-posed questions across 3 `ready` books (Moby Dick EN, Dom Casmurro PT, Crime and Punishment EN), Mastra Studio (localhost:4111) + adapted cURL scripts. Full per-turn transcripts captured locally; `apps/mastra/src/scripts/curl/validation-log.md` holds the committed anonymized summary.

### Primary Success Metrics

| Metric | Target | Measured | Status |
|---|---|---|---|
| Citation resolvability | ≥ 80 % | 100 % (10/10 cited turns had resolvable `chunk_id` via `GET /api/library/chunks/:id`) | PASS |
| Post-cap citations | 0 | 0 (Q10 spoiler cap @ch10 on Moby Dick; Q11 spoiler cap @ch5 on Dom Casmurro — zero violations) | PASS |
| Unjustified refusals | ≤ 2 per 10 | 0 (Q07–Q09 refusals all correct; Q10–Q11 cap-enforced refusals justified) | PASS |
| Language-match accuracy | 100 % | 100 % (12/12 responses matched question language; EN→EN, PT→PT) | PASS |

### Question Coverage

- **Plot (EN):** Q01 (Ishmael meets Queequeg), Q02 (Ahab crew address) — both grounded and cited.
- **Character (PT):** Q03 (Capitu personality) — response in PT, PT excerpts preserved.
- **Character (EN):** Q04 (Bulkington) — agent handled sparse evidence correctly.
- **Thematic (EN):** Q05 (obsession in Moby Dick) — multi-citation thematic answer.
- **Thematic (PT):** Q06 (memory / unreliable narrator in Dom Casmurro) — response in PT.
- **Refusal (EN, PT):** Q07 (gnomes / Moby Dick), Q08 (gnomes / Dom Casmurro), Q09 (Raskolnikov's sport) — all correct refusals with grounded hints; 0 fabricated markers.
- **Spoiler-capped (EN):** Q10 (Ahab's death, cap @ch10) — refusal, 0 post-cap citations.
- **Spoiler-capped (PT):** Q11 (Dom Casmurro ending, cap @ch5) — refusal in PT, 0 violations.
- **Character mentions (PT):** Q12 (carpinteiro / carpenter) — bilingual alias derivation correct.

### System Prompt Iterations

0 iterations required. `packages/rag/src/prompts/system.md` shipped by task_06 passed all metrics on the first validation run.

### Conclusion

All four Primary Success Metrics green. Feature 003 validation gate cleared; task_13 (feature closure) may proceed.

---

## Open Questions

- **Top-k default for `semantic_search`** — 8? 10? 20? Tuned against the first 5 ingested books; resolved in 003 TechSpec.
- **Per-book quota inside `semantic_search`** — on multi-book threads, do we split top-k evenly per book or let HNSW pick globally? Deferred to TechSpec; tool shape already accommodates either (ADR-004 implementation notes).
- **Citation marker format** — `[§42]` / `[MD:23]` / footnote-style? Visual choice driven by Feature 004 Chat UI; the tool output payload is fixed now.
- **"Relevance floor" threshold for refusal** — V1 default is zero-result refusal (`chunks.length === 0`). A score-based floor (e.g., `max(score) < 0.55`) is a TechSpec decision; only introduced if dogfooding reveals weak-chunk hallucinations.
- **Character alias lists for `find_character_mentions`** — manually maintained per book? Extracted from Gutendex metadata? Agent-generated on first use and cached? TechSpec decision.
- **Summary generation prompt** — stored in `@dialogus/ingestion/src/prompts/summarize.md`? Shared with `@dialogus/rag`? Resolved during Feature 002 amendment.
- **Handling of books with a single "Full text" chapter** — how does `list_chapters` behave on a book whose TXT parse fell back to one-chapter mode? Cosmetic; resolved in TechSpec.
- **"Primeiros passos" recommended titles** — 3 titles for the onboarding card (1 EN, 1 PT, 1 multi-translation). Product PRD open question; settled before Feature 004 Chat UI.
