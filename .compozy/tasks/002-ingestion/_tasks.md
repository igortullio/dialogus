# Ingestion — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Add @dialogus/shared/schemas/ingestion + problem slugs | completed | low | — |
| 02 | apps/worker scaffold + retrofit apps/api cleanup removal | completed | medium | — |
| 03 | chapters + chunks schemas + migration 0003 | completed | medium | task_02 |
| 04 | @dialogus/ingestion scaffold + domain layer | completed | medium | task_01 |
| 05 | @dialogus/ingestion persistence (repos + mappers) | completed | medium | task_03, task_04 |
| 06 | GutendexDownloader (polite fetch + streaming + SHA-256) | completed | medium | task_04 |
| 07 | EmbeddingProvider adapters (OpenAI + Mock) | completed | medium | task_04 |
| 08 | YAML heuristics + GutenbergCleaner + TxtChapterParser | completed | medium | task_04 |
| 09 | EpubChapterParser (gxl + epub2 fallback) | completed | medium | task_04 |
| 10 | Download + Clean stage handlers | completed | medium | task_05, task_06, task_08 |
| 11 | Parse stage handler | completed | medium | task_05, task_08, task_09 |
| 12 | Chunk stage handler | completed | medium | task_05 |
| 13 | Embed + Index stage handlers | completed | medium | task_05, task_07 |
| 14 | apps/api library routes (ingest/ingestion/retry/chunks) | completed | medium | task_01, task_03, task_05 |
| 15 | apps/worker handler registration + cleanup schedule | completed | medium | task_02, task_10, task_11, task_12, task_13 |
| 16 | Integration test suites + CI integration job extension | completed | high | task_14, task_15 |
| 17 | apps/web landing "livros&#58; X (prontos&#58; N)" | completed | low | task_14 |
| 18 | Ingestion smoke + closure | completed | medium | task_14, task_15, task_16, task_17, task_24 |
| 19 | chapter_summaries schema + migration 0004 (ADR-008) | completed | low | task_03 |
| 20 | @dialogus/ingestion ChapterSummary domain layer (ADR-008) | completed | low | task_04 |
| 21 | DrizzleChapterSummaryRepository + mapper (ADR-008) | completed | low | task_19, task_20 |
| 22 | AnthropicChapterSummaryGenerator + Mock + prompt asset (ADR-008) | completed | medium | task_20 |
| 23 | Summarize stage handler (use case) (ADR-008) | completed | medium | task_21, task_22 |
| 24 | Worker registration for summarize + integration suite extension (ADR-008) | completed | medium | task_15, task_23 |

Tasks 19–24 are the retroactive amendment driven by Feature 003 ADR-001 + 002 ADR-008. They add a seventh pipeline stage (`summarize`) between `chunk` and `embed` to pre-generate chapter summaries consumed by Feature 003's `get_chapter_summary` tool.
