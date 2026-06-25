# Contract — Ingestion Retry (resume-not-restart, retryable-only)

## `POST /api/library/books/:id/ingest/retry`

**Server behavior is unchanged** — it already does the right thing; this feature only surfaces it.

- Auth-session + **membership-gated** (non-member ⇒ `404`).
- `409`-class domain errors via existing problem slugs: `book-already-ready` when `status ===
  'ready'`; `book-not-in-retryable-state` when `status !== 'failed'`.
- On success: `202` with `envelope(ingestionEnqueueResponseDtoSchema.parse(result))`:

```jsonc
{ "book_id": "uuid", "status": "embedding", "stage": "embed", "job_id": "…" }
```

The pipeline **resumes from `ingestion_last_stage`** (falling back to `download` if null) — earlier
`done`/`skipped` stage records are preserved; only the failed stage and those after it re-run
(idempotent, per Constitution IV and [../data-model.md](../data-model.md)).

### Web UX contract (the actual change)

1. **Retryable-only affordance** — the "Tentar novamente" button is shown **only** when
   `error.retryable === true` (`download` / `embed` / `summarize`). For non-retryable failures the
   UI shows the friendly reason + a "não é recuperável automaticamente" note and **no** retry
   button (FR-009: MUST NOT offer retry for non-recoverable failures).
2. **Resume wording** — the confirm dialog MUST state the resume stage and that completed work is
   preserved, e.g.:
   > "Retomar a ingestão de *<título>*? Continua da etapa **<stage display name>** — as etapas já
   > concluídas não serão refeitas. Pode levar alguns minutos."
   It MUST NOT render the raw `"<slug>: <message>"`. (FR-010, FR-011)
3. **Post-retry feedback** — on `202`, the card re-enters the in-progress stepper at the resumed
   stage (toast: "Retomando a ingestão a partir de <stage>."). (FR-011)

### Stage display names (web — PT shown; EN parallel in `messages.ts`)

| stage | display |
|---|---|
| download | Download |
| clean | Limpeza |
| parse | Extração de capítulos |
| chunk | Divisão em trechos |
| summarize | Resumos |
| embed | Embeddings |
| index | Indexação |

### Friendly failure messages (`slug → {pt, en}` map)

| slug | retryable | pt (default shown) |
|---|---|---|
| `ingestion-download-failed` | ✓ | "Não foi possível baixar o livro do Gutendex. Tente novamente." |
| `ingestion-clean-failed` | ✗ | "Falha ao preparar o texto do livro." |
| `ingestion-parse-failed` | ✗ | "Não foi possível dividir o livro em capítulos (formato inesperado)." |
| `ingestion-chunk-failed` | ✗ | "Falha ao dividir o texto em trechos." |
| `ingestion-summarize-failed` | ✓ | "Falha ao gerar os resumos dos capítulos. Tente novamente." |
| `ingestion-embed-failed` | ✓ | "Falha ao gerar os embeddings. Tente novamente." |
| `ingestion-index-failed` | ✗ | "Falha na indexação final do livro." |
| `ingestion-failed` (fallback) | ✗ | "A ingestão falhou. Veja os detalhes técnicos." |

Each message is prefixed/annotated with "(etapa N de 7)" using `stage_index`/`total_stages`.
