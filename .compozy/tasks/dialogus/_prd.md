# dIAlogus V1 — Product Requirements Document

## Overview

dIAlogus is a single-user, self-hosted conversational study companion for public-domain classic books from Project Gutenberg. The product answers reader questions in natural language, grounding every response in exact passages from the text with precise chapter + excerpt citations.

**Problem.** Existing tools for talking to classic literature split into two unsatisfying tiers: persona-roleplay chatbots that hallucinate plot and never cite sources, and generic "chat-with-PDF" tutorials that offer no book-specific intelligence. A serious reader has nowhere to ask grounded, citation-backed questions about *Don Quixote* or *Moby Dick* with the reassurance that the answer traces back to a real passage.

**Target users.** Primary: the project owner — a senior backend engineer reading classics in English and Portuguese, using dIAlogus as both a learning project and a daily reading companion. Secondary: international hiring managers and peer engineers who review the product as a portfolio piece demonstrating RAG engineering depth.

**Value.** For the owner, a daily reading companion that respects spoiler boundaries, cites chapters precisely, and runs entirely on personal infrastructure. For reviewers, a working, opinionated product — not a tutorial clone — that answers "can this candidate build production AI systems?" through visible UX and documented decisions.

## Goals

1. **Functional V1** spanning the 5 canonical product surfaces (foundation, catalog, ingestion, agent, chat UI) within 7–9 weeks of planned effort.
2. **Dogfooding pass**: the owner uses dIAlogus as the primary Q&A tool for personal reading across ≥ 5 ingested books (EN + PT mix) for 2–4 consecutive weeks without critical friction.
3. **Portfolio artifact**: a 3-minute screencast demonstrating the four user journeys, plus README + ARCHITECTURE.md that tell the "why" story.
4. **Grounded-answer guarantee**: every non-trivial agent response cites at least one passage; cited passages are verifiable in the source text; the agent refuses rather than hallucinates when retrieval returns nothing usable.
5. **Spoiler-boundary end-to-end**: user sets chapter progress, retrieval filters above it, agent prompting reinforces, UI reflects the active cap.

## User Stories

### Primary persona — reader of classics (the project owner)

- As a reader, I want to type a question about a book I'm reading and get an answer grounded in specific passages, so I can verify the model's claims against the source.
- As a reader, I want to start a new conversation from a fresh chat page, pick one or more books, and begin asking, so I don't have to navigate a library tree first.
- As a reader, I want an inline citation badge for every non-trivial claim, with hover-preview and click-through to fuller context, so I can verify without leaving the chat.
- As a reader, I want to set my current chapter on a thread and trust the agent not to reveal anything past that point, so I don't get spoiled during study.
- As a reader, I want to switch between previous conversations from a sidebar, so I can maintain parallel discussions across books.
- As a reader, I want to browse and search Project Gutenberg from inside dIAlogus, add titles to my personal library, and watch ingestion progress in near-real time, so discovering a new book is frictionless.
- As a reader, I want to retry a failed ingestion with the reason shown, so flaky networks or malformed files don't block me permanently.
- As a reader, I want to see the status of every book in my library at a glance, so I know what I can ask about right now.

### Secondary persona — portfolio reviewer

- As a reviewer, I want a short screencast demonstrating the product end-to-end, so I can form an opinion in under 3 minutes without cloning the repo.
- As a reviewer, I want a README + ARCHITECTURE.md that explain decisions and their trade-offs, so I can assess product judgment.
- As a reviewer, I want one-command local setup, so I can verify the claims in under 15 minutes.

## Core Features

### 1. Personal book catalog

Discover Gutendex titles by search (title, author, topic, filtered to EN or PT), add books to the personal library, track ingestion status, and remove books (soft delete). Status lifecycle: `discovered` → `downloading` → `parsing` → `chunking` → `embedding` → `ready`, with `failed` as a recoverable terminal state.

### 2. Asynchronous book ingestion

Transform a book from `discovered` to `ready` via a resumable multi-stage pipeline: download raw text, strip Project Gutenberg boilerplate, parse chapters with language-aware heuristics (EN and PT patterns), chunk into retrieval-sized passages with overlap, generate vector embeddings, index for semantic search. Progress is visible; failures are retryable with the reason surfaced.

### 3. Grounded conversational agent

A single conversational agent answers questions about one or more selected books using semantic retrieval plus auxiliary tools (list chapters, summarize chapter, find character mentions). Every non-trivial answer carries inline citations referencing book + chapter + excerpt. The agent refuses to answer rather than hallucinate when retrieval is empty. Thread context preserved across turns.

### 4. Spoiler boundary

In any thread, the user may set a "current chapter" per selected book. Retrieval filters to chunks at or below that chapter; the agent prompt reinforces the boundary. Disabling or adjusting the cap is one click; a clear header indicator shows the active cap.

### 5. Chat-first interface

Landing is the chat view with a sidebar listing recent threads. Empty state invites "Nova conversa"; the composer's book picker supports multi-select from the personal library and an inline "adicionar do Gutendex" shortcut if the needed book isn't yet available. Token streaming with inline citation attachment; hover reveals the excerpt, click opens a side panel with surrounding text. Library management sits behind a secondary "Gerenciar acervo" link.

## User Experience

### Primary flow — ask a grounded question

1. User lands on chat home; sidebar shows previous threads (or an empty-state card on first visit).
2. Clicks "Nova conversa". Composer opens with the book picker at the top.
3. Searches the personal library. If the book is missing, opens "Adicionar do Gutendex" → picks → book queues for ingestion; once `ready` it becomes selectable.
4. Types the question and sends.
5. Response streams; citation badges appear inline per supported claim. Hover = excerpt preview; click = side panel with chapter + surrounding text.
6. Follow-ups maintain thread context.

### Secondary flow — configure spoiler boundary

1. Inside a thread, user clicks the book chip in the header.
2. Panel lists each selected book with a chapter slider.
3. User caps each book at the current reading position. A subtle header indicator shows the cap.
4. Subsequent messages silently respect the cap; the agent neither references nor summarizes post-cap content.

### Secondary flow — library management

1. User clicks "Gerenciar acervo" in the sidebar footer.
2. Library page shows a grid of books with cover, title, author, language flag, and status badge.
3. A top search bar queries Gutendex; results render below with "Adicionar" action.
4. Clicking "Ingerir" on a `discovered` book transitions status visibly.
5. Clicking "Tentar novamente" on a `failed` book re-queues it with the last error shown.

### UI/UX considerations

- **Language**: UI strings, empty states, validation messages in Portuguese. Source code, logs, and technical docs in English.
- **Accessibility**: responsive base layout, keyboard-navigable chat, screen-reader labels on citation badges and status indicators.
- **Dark mode**: follow system preference; no toggle in V1.
- **Onboarding**: empty library shows a "Primeiros passos" card with 3 recommended titles (one EN, one PT, one with multiple notable translations) pre-filled and ready to ingest with a single click.

## High-Level Technical Constraints

- **Single-user, local-first**: no authentication in V1; product runs on the owner's machine.
- **Public-domain only**: source texts exclusively via Project Gutenberg / Gutendex. No user uploads, no paid APIs.
- **Ingestion must not block user interactions**: heavy work runs off the request path; the UI polls or streams status.
- **API keys remain private**: Anthropic and OpenAI credentials never committed or shipped in images.
- **Latency target**: first streaming token within 3 seconds for typical questions on a `ready` book; full response within 15 seconds on a ≤ 3-book thread.
- **Ingestion throughput**: a typical EPUB (≤ 2 MB) reaches `ready` within 5 minutes on local dev hardware.
- **Citation verifiability**: the agent may only emit citations that resolve to persisted passages; excerpt text is looked up server-side, never accepted verbatim from the model.

## Non-Goals (Out of Scope)

- Authentication / multi-user.
- Book sources beyond Gutendex (no Archive.org, no user uploads, no paid APIs).
- Persona / roleplay mode — agent never adopts a character voice.
- Multi-translation side-by-side view — deferred to Phase 2.
- Structure-aware chunking (verse, dialogue, drama-specific) — deferred to Phase 2.
- Cross-book thematic search UI — V1 supports multi-book threads, no standalone "find passages across my library".
- Evals framework (curated dataset, Ragas-style recall@k / faithfulness) — deferred to Phase 2.
- Public deployment polish (domain, hosted DB, CDN) — local-first; public deploy is post-V1.
- Book languages beyond English and Portuguese.
- Annotations / highlights / personal notes on passages.
- Mobile-first UX or PWA.
- External observability (Sentry, OpenTelemetry, custom dashboards) beyond local logging and the agent framework's built-in studio.

## Phased Rollout Plan

### MVP (Phase 1) — Scholarly chat with spoiler boundary — target 7–9 weeks

Included surfaces:

1. **Foundation** — monorepo, persistence, scaffolds, CI; tightened to the minimum that proves the full stack wires up (trimmed from the old plan's 50-task footprint).
2. **Book catalog** — Gutendex search, personal library CRUD, EN+PT language filter, soft delete.
3. **Book ingestion** — resumable pipeline with EN+PT chapter heuristics; retryable failures.
4. **Grounded RAG agent** — semantic retrieval, chapter and character tools, citation-first prompting, refusal on empty retrieval.
5. **Chat-first UI** — landing is the chat, multi-book thread composer, spoiler slider, inline citations, library as a secondary surface.

Exit criteria to close V1:

- Owner completes 2+ weeks of dogfooding with 5+ `ready` books (≥ 3 EN, ≥ 2 PT).
- Four user journeys flow without showstopping bugs (search → ingest → ask → spoiler-safe read).
- 3-minute screencast recorded and committed.
- README + ARCHITECTURE.md reflect shipped state.

### Phase 2 — Depth and polish

- Evals framework with a curated 30–50-question dataset (mixed EN/PT, plot / theme / citation), Ragas-style recall@k + faithfulness, CI regression guard.
- Multi-translation mode — group Gutendex IDs of the same work; side-by-side excerpt view; agent diff commentary.
- Structure-aware chunking for verse-heavy and dialogue-heavy books.
- Public deploy on a managed platform with a custom domain.

### Phase 3 — Optional expansion (no commitment)

- Annotations and highlights; agent references user-marked passages.
- Cross-book thematic search UI.
- Mobile-first PWA.
- Language expansion beyond EN + PT.

## Success Metrics

### Primary (V1 completion gate)

- **Dogfooding sustainability**: owner uses dIAlogus ≥ 3 times per week for 2+ consecutive weeks, with ≤ 2 critical bugs per week.
- **Library breadth**: ≥ 5 books reach `ready` (≥ 3 EN, ≥ 2 PT).
- **Grounding fidelity** (subjective owner review): in ≥ 80 % of self-posed questions, the cited passage supports the claim upon inspection.
- **Spoiler respect** (subjective): in ≥ 95 % of questions asked with a spoiler cap set, the agent does not reveal information from chapters beyond the cap.
- **Screencast delivered**: 3-minute demo recorded and committed.

### Secondary (portfolio signalling)

- **Repo quality**: README with "why" narrative, ADRs committed, zero lint/typecheck errors on `main`.
- **Ingestion throughput**: EPUB ≤ 2 MB reaches `ready` in < 5 minutes locally.
- **First-token latency**: agent streams first token within 3 seconds on a ≤ 3-book thread.

## Risks and Mitigations

### Adoption risks

- **Ingestion-failure friction kills dogfooding.** V1 requires a visible "Tentar novamente" with the last error; job queue captures failure reasons.
- **Chat-first landing confuses first-time use (no threads, no library).** Empty-state card prefills 3 recommended titles with a one-click "Adicionar" action.

### Competitive risks

- **Character.AI Books or Project Gutenberg's experimental dialog tool reduces novelty value.** Positioning stays distinct (scholarly, cited, self-hosted, single-user); portfolio story leans on engineering depth (grounding, spoiler boundary, bounded contexts), not novelty.

### Timeline / resource risks

- **Repeat of the old project's spec-drift failure.** Run a spec-upfront session producing PRD + TechSpec + tasks.md for all 5 features before any implementation begins. (This product-level PRD is the first artifact of that session.)
- **Test-harness complexity re-blocks development.** Integration tests run only in a dedicated CI job; pre-commit stays at lint + typecheck + unit tests with mocked DB.
- **Mastra + assistant-ui learning curves slip the schedule.** Phase 2 absorbs non-essentials; deferring features is preferred over slipping the dogfooding gate.

### Dependency risks

- **Gutendex outage or API change.** Raw files cached locally with SHA-256 hashes; mocked client in tests.
- **OpenAI rate limits or embedding price changes.** Embedding provider is abstracted; local fallback model is a contingency path.
- **Anthropic API cost creep during dogfooding.** Dev uses the cheaper model, prod the stronger; prompt caching on system prompt + chapter summaries.

## Architecture Decision Records

- [ADR-001: Chat-first product shape](adrs/adr-001.md) — Landing is chat with thread list, not library grid.
- [ADR-002: Scholarly grounded agent posture](adrs/adr-002.md) — Neutral academic tone with cited passages; no persona, no roleplay.
- [ADR-003: Full 5-feature MVP with lighter guardrails](adrs/adr-003.md) — Follow old plan's feature sequence; shrink Constitution and test harness weight.
- [ADR-004: Spoiler boundary as the V1 differentiator](adrs/adr-004.md) — Only one UX innovation in V1; multi-translation and structure-aware chunking deferred.

## Open Questions

- **Onboarding book list**: which 3 titles fill the "Primeiros passos" card? (Candidates: *Moby Dick* / *Crime and Punishment* / *Dom Casmurro*. Decide before the Chat UI feature spec.)
- **Agent system prompt wording**: drafted during the RAG-agent feature spec; validated against 5–10 owner-posed questions before implementation.
- **Ingestion retry policy**: exponential backoff, manual-only, or bounded retries? (Resolve in the Book Ingestion TechSpec.)
- **Per-book chapter cap persistence**: does the spoiler cap persist across threads for the same book or reset per thread? (Resolve in the Chat UI TechSpec.)
- **Phase 2 public deploy auth**: if/when Phase 2 adds a public deploy, what's the minimal auth footprint? Not a V1 concern.
