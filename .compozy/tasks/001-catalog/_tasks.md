# Catalog — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Add @dialogus/shared/http envelope + problem helpers | completed | low | — |
| 02 | Add @dialogus/shared/http cursor codec | completed | medium | — |
| 03 | Add @dialogus/shared/schemas book/catalog/library DTOs | completed | low | — |
| 04 | @dialogus/db books schema + migration 0001 | completed | medium | — |
| 05 | @dialogus/db idempotency_keys schema + migration 0002 | completed | low | task_04 |
| 06 | @dialogus/catalog scaffold + domain layer | completed | medium | task_03 |
| 07 | @dialogus/catalog DrizzleBookRepository + BookMapper | completed | medium | task_04, task_06 |
| 08 | @dialogus/catalog GutendexHttpClient + MSW fixtures | completed | medium | task_06 |
| 09 | @dialogus/catalog catalog use cases (search + detail) | completed | low | task_06 |
| 10 | @dialogus/catalog library use cases (add, list, get, remove, restore) | completed | medium | task_06 |
| 11 | apps/api problem middleware (RFC 9457 converter) | completed | low | task_01 |
| 12 | apps/api idempotency middleware | completed | medium | task_05, task_11 |
| 13 | apps/api /api/catalog/* routes + integration test | completed | medium | task_03, task_07, task_08, task_09, task_11 |
| 14 | apps/api /api/library/* routes + integration tests | completed | high | task_03, task_07, task_10, task_11, task_12 |
| 15 | apps/api pg-boss init + cleanup-idempotency-keys job | completed | medium | task_05, task_12 |
| 16 | apps/web landing "livros: N" extension | completed | low | task_14 |
| 17 | CI integration job with Testcontainers | completed | medium | task_12, task_13, task_14 |
| 18 | Catalog smoke + closure | completed | medium | task_13, task_14, task_15, task_16, task_17 |
