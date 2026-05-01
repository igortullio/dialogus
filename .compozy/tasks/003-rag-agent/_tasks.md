# RAG Agent — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | @dialogus/rag domain layer (ports + entities + errors + barrel) | completed | medium | — |
| 02 | QueryEmbedder adapters (OpenAI + Mock) | completed | low | task_01 |
| 03 | semantic_search tool | completed | medium | task_01, task_02 |
| 04 | list_chapters + get_chapter_summary tools | completed | low | task_01 |
| 05 | find_character_mentions tool | completed | medium | task_01 |
| 06 | System prompt Markdown asset + snapshot test | completed | low | task_01 |
| 07 | createDialogusAgent factory + package barrel | completed | medium | task_03, task_04, task_05, task_06 |
| 08 | apps/mastra scaffold + mastra.config.ts wiring | completed | medium | task_07 |
| 09 | Integration test suite (5 suites, Testcontainers + MSW) | completed | high | task_08 |
| 10 | CI integration job extension | completed | low | task_09 |
| 11 | cURL smoke scripts + apps/mastra README | completed | low | task_08 |
| 12 | System prompt validation (≥10 owner-posed questions) | completed | low | task_08, task_11 |
| 13 | Feature 003 closure (README, annotations, commit) | pending | low | task_10, task_12 |

**External prerequisite:** Feature 002 task_24 (worker registration for `summarize` queue + integration suite extension) must be merged before task_01 of this feature starts. Without it, `chapter_summaries` is an unmigrated table and `get_chapter_summary` has no data to read.
