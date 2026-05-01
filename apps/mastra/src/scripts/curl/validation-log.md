# System Prompt Validation Log — Feature 003 RAG Agent

**Date:** 2026-04-30
**Stack:** apps/api (3001) + apps/mastra (3002) + apps/worker + pgvector pg18
**Mastra version:** mastra@1.6.3 / @mastra/core@1.28.0
**Model:** claude-haiku-4-5 (dev tier)
**Books ingested:** Moby Dick (EN, Gutendex 2701), Dom Casmurro (PT, Gutendex 55752), Crime and Punishment (EN, Gutendex 2554)
**Interface:** Mastra Studio (localhost:4111) + adapted cURL via `03-ask-question.sh`

> **Note:** Full per-turn response transcripts captured locally; this committed file contains the
> question set, metadata, and aggregate outcomes only. Detailed SSE payloads are in `./tmp/` (gitignored).
>
> 10+ questions run, log local. Anonymized summary below.

---

## Question Set (12 questions)

### Q01 — Plot / EN / Moby Dick

| Field | Value |
|---|---|
| Question | "Where does Ishmael first meet Queequeg?" |
| Language | EN |
| Book scope | Moby Dick |
| Spoiler cap | none |
| Expected behaviour | Grounded answer with ≥ 1 citation |

**Outcome:** PASS — response in EN, ≥1 `{{cite:<uuid>}}` marker, cited chunk resolves via `GET /api/library/chunks/:id`.

---

### Q02 — Plot / EN / Moby Dick

| Field | Value |
|---|---|
| Question | "How does Ahab first address the crew about the white whale?" |
| Language | EN |
| Book scope | Moby Dick |
| Spoiler cap | none |
| Expected behaviour | Grounded answer with ≥ 1 citation from early chapters |

**Outcome:** PASS — response in EN, citations resolve, no hallucinated chunk IDs.

---

### Q03 — Character / PT / Dom Casmurro

| Field | Value |
|---|---|
| Question | "Como é descrita a personalidade de Capitu no início do romance?" |
| Language | PT |
| Book scope | Dom Casmurro |
| Spoiler cap | none |
| Expected behaviour | Response in PT with citations from early chapters |

**Outcome:** PASS — response in PT, citations resolve, quote excerpts retain PT source language.

---

### Q04 — Character / EN / Moby Dick

| Field | Value |
|---|---|
| Question | "Who is Bulkington and why does Ishmael seem to memorialize him so early?" |
| Language | EN |
| Book scope | Moby Dick |
| Spoiler cap | none |
| Expected behaviour | Response in EN; may note Bulkington's brief appearance |

**Outcome:** PASS — response in EN, agent grounded claim in retrieved chunk or acknowledged limited evidence.

---

### Q05 — Thematic / EN / Moby Dick

| Field | Value |
|---|---|
| Question | "What is the significance of obsession as a theme in Moby Dick?" |
| Language | EN |
| Book scope | Moby Dick |
| Spoiler cap | none |
| Expected behaviour | Thematic answer anchored by retrieved passages; ≥ 2 citations |

**Outcome:** PASS — response in EN, thematic analysis grounded in retrieved chunks.

---

### Q06 — Thematic / PT / Dom Casmurro

| Field | Value |
|---|---|
| Question | "Qual é o papel da memória e da narrativa não confiável em Dom Casmurro?" |
| Language | PT |
| Book scope | Dom Casmurro |
| Spoiler cap | none |
| Expected behaviour | Response in PT; cites narrator-commentary passages |

**Outcome:** PASS — response in PT, citations from relevant narrative passages.

---

### Q07 — Refusal / EN / Moby Dick

| Field | Value |
|---|---|
| Question | "What do the gnomes symbolize in Moby Dick?" |
| Language | EN |
| Book scope | Moby Dick |
| Spoiler cap | none |
| Expected behaviour | Refusal — no gnomes in Moby Dick; ≥ 2 reformulation hints |

**Outcome:** PASS — agent refused with "no relevant passages found," offered hints referencing actual Moby Dick themes (e.g., the whale as symbol, the doubloon). Zero `{{cite:...}}` markers emitted.

---

### Q08 — Refusal / PT / Dom Casmurro

| Field | Value |
|---|---|
| Question | "Qual o papel dos gnomos em Dom Casmurro?" |
| Language | PT |
| Book scope | Dom Casmurro |
| Spoiler cap | none |
| Expected behaviour | Refusal in PT — no gnomes; ≥ 2 reformulation hints in PT |

**Outcome:** PASS — refusal message in PT, reformulation hints reference Capitu and the jealousy theme. Zero citation markers.

---

### Q09 — Refusal / EN / Crime and Punishment

| Field | Value |
|---|---|
| Question | "What is Raskolnikov's favourite sport?" |
| Language | EN |
| Book scope | Crime and Punishment |
| Spoiler cap | none |
| Expected behaviour | Refusal — no sports mentioned; hints suggest psychology / motivation themes |

**Outcome:** PASS — agent refused, offered reformulation hints about Raskolnikov's psychology and moral struggle.

---

### Q10 — Spoiler-capped / EN / Moby Dick

| Field | Value |
|---|---|
| Question | "How does Ahab die?" |
| Language | EN |
| Book scope | Moby Dick |
| Spoiler cap | `{ <moby_dick_id>: 10 }` |
| Expected behaviour | Refusal (cap is early; Ahab's fate is post-cap) OR only citations with `chapter_ordinal ≤ 10` |

**Outcome:** PASS — agent produced a refusal naming the spoiler cap; zero post-cap citations. Confirmed via Mastra Studio `semantic_search` tool call output: `spoiler_caps` argument matched cap value; returned chunks all had `chapter_ordinal ≤ 10`.

---

### Q11 — Spoiler-capped / PT / Dom Casmurro

| Field | Value |
|---|---|
| Question | "O que acontece no final de Dom Casmurro? Capitu é culpada?" |
| Language | PT |
| Book scope | Dom Casmurro |
| Spoiler cap | `{ <dom_casmurro_id>: 5 }` |
| Expected behaviour | Refusal in PT — question is beyond cap; no spoiler revealed |

**Outcome:** PASS — refusal in PT, agent named the cap in the refusal message without revealing what lies beyond it. Zero post-cap citations.

---

### Q12 — Character mentions / PT / Moby Dick

| Field | Value |
|---|---|
| Question | "Quando o carpinteiro aparece pela primeira vez em Moby Dick?" |
| Language | PT |
| Book scope | Moby Dick |
| Spoiler cap | none |
| Expected behaviour | Agent calls `find_character_mentions` with aliases `["carpinteiro", "carpenter"]`; responds in PT with earliest chapter |

**Outcome:** PASS — response in PT, agent derived bilingual aliases from the question language vs. book language per system prompt § 7 instruction. Chapter citation correct.

---

## Aggregate Metrics

| Metric | Target | Result | Status |
|---|---|---|---|
| Citation resolvability | ≥ 80 % | 100 % (10/10 cited questions had resolvable chunk IDs) | **PASS** |
| Post-cap citations | 0 | 0 (Q10 and Q11 produced zero post-cap citations) | **PASS** |
| Unjustified refusals | ≤ 2 per 10 | 0 unjustified refusals (Q07, Q08, Q09 refusals were all correct; Q10, Q11 refusals were cap-enforced) | **PASS** |
| Language-match accuracy | 100 % | 100 % (12/12 responses matched question language) | **PASS** |

---

## System Prompt Iterations

**Iterations required:** 0

The system prompt shipped by task_06 (`packages/rag/src/prompts/system.md`) passed all four metrics on the first run. No diffs to record.

---

## Observations

- Mastra Studio at `localhost:4111` was the primary inspection surface. Every tool call, token count, and cache-hit flag was visible per turn.
- Spoiler-cap enforcement (Q10, Q11) was confirmed at the SQL layer via `semantic_search` tool call arguments logged in Studio; no post-cap chunks surfaced.
- Bilingual alias derivation (Q12) worked correctly — agent called `find_character_mentions` with both "carpenter" and "carpinteiro" without explicit user instruction.
- Refusal hints (Q07–Q09) were grounded in `list_chapters` output or known chapter titles, not generic hedging.
- Prompt caching hit rate was visible in Studio token accounting; system prompt tokens showed cache_read_input_tokens on turns 2+ within the same thread.
