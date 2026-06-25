import {
  INGESTION_STAGE_VALUES,
  type IngestionStage,
  type IngestionStageState,
  type IngestionUnit,
} from '@dialogus/shared/schemas/ingestion'

/** Stages whose failures are transient and worth a retry (mirrors the API). */
export const RETRYABLE_SLUGS: ReadonlySet<string> = new Set([
  'ingestion-download-failed',
  'ingestion-embed-failed',
  'ingestion-summarize-failed',
])

/**
 * Web-side presentation of ingestion state (feature 002). The API stays
 * slug-based; the UI maps slugs → human-readable, localized text and NEVER
 * renders the raw `<slug>: <message>` string. PT is the default surface; EN
 * strings are kept in parallel for when the interface language flips.
 */

type Lang = 'pt' | 'en'

const STAGE_DISPLAY: Record<IngestionStage, Record<Lang, string>> = {
  download: { pt: 'Download', en: 'Download' },
  clean: { pt: 'Limpeza', en: 'Cleanup' },
  parse: { pt: 'Extração de capítulos', en: 'Chapter extraction' },
  chunk: { pt: 'Divisão em trechos', en: 'Chunking' },
  summarize: { pt: 'Resumos', en: 'Summaries' },
  embed: { pt: 'Embeddings', en: 'Embeddings' },
  index: { pt: 'Indexação', en: 'Indexing' },
}

const STATE_DISPLAY: Record<IngestionStageState, Record<Lang, string>> = {
  pending: { pt: 'Aguardando', en: 'Pending' },
  queued: { pt: 'Na fila', en: 'Queued' },
  running: { pt: 'Em andamento', en: 'In progress' },
  done: { pt: 'Concluído', en: 'Done' },
  failed: { pt: 'Falhou', en: 'Failed' },
  skipped: { pt: 'Cacheado', en: 'Cached' },
}

const UNIT_DISPLAY: Record<IngestionUnit, Record<Lang, { singular: string; plural: string }>> = {
  bytes: { pt: { singular: 'byte', plural: 'bytes' }, en: { singular: 'byte', plural: 'bytes' } },
  chapters: {
    pt: { singular: 'capítulo', plural: 'capítulos' },
    en: { singular: 'chapter', plural: 'chapters' },
  },
  chunks: {
    pt: { singular: 'trecho', plural: 'trechos' },
    en: { singular: 'trecho', plural: 'chunks' },
  },
}

/** Friendly, localized failure messages keyed by error slug. */
const ERROR_MESSAGE: Record<string, Record<Lang, string>> = {
  'ingestion-download-failed': {
    pt: 'Não foi possível baixar o livro do Gutendex.',
    en: 'Could not download the book from Gutendex.',
  },
  'ingestion-clean-failed': {
    pt: 'Falha ao preparar o texto do livro.',
    en: 'Failed to prepare the book text.',
  },
  'ingestion-parse-failed': {
    pt: 'Não foi possível dividir o livro em capítulos (formato inesperado).',
    en: 'Could not split the book into chapters (unexpected format).',
  },
  'ingestion-chunk-failed': {
    pt: 'Falha ao dividir o texto em trechos.',
    en: 'Failed to split the text into chunks.',
  },
  'ingestion-summarize-failed': {
    pt: 'Falha ao gerar os resumos dos capítulos.',
    en: 'Failed to generate chapter summaries.',
  },
  'ingestion-embed-failed': {
    pt: 'Falha ao gerar os embeddings.',
    en: 'Failed to generate embeddings.',
  },
  'ingestion-index-failed': {
    pt: 'Falha na indexação final do livro.',
    en: 'Failed at the final indexing step.',
  },
  'ingestion-failed': {
    pt: 'A ingestão falhou.',
    en: 'Ingestion failed.',
  },
}

const FALLBACK_ERROR: Record<Lang, string> = {
  pt: 'A ingestão falhou.',
  en: 'Ingestion failed.',
}

const RETRY_HINT: Record<Lang, string> = {
  pt: 'Tente novamente.',
  en: 'Try again.',
}

const TOTAL_STAGES = 7

export function stageDisplayName(stage: IngestionStage, lang: Lang = 'pt'): string {
  return STAGE_DISPLAY[stage][lang]
}

export function stageStateLabel(state: IngestionStageState, lang: Lang = 'pt'): string {
  return STATE_DISPLAY[state][lang]
}

export function unitLabel(unit: IngestionUnit, count: number, lang: Lang = 'pt'): string {
  const forms = UNIT_DISPLAY[unit][lang]
  return count === 1 ? forms.singular : forms.plural
}

/**
 * Human-readable failure line for a failed book. Names the failing stage and
 * appends a retry hint when recoverable. NEVER returns the raw slug+message.
 */
export function friendlyErrorMessage(
  slug: string,
  options: { stage?: IngestionStage | null; stageIndex?: number | null; retryable?: boolean } = {},
  lang: Lang = 'pt',
): string {
  const base = ERROR_MESSAGE[slug]?.[lang] ?? FALLBACK_ERROR[lang]
  const parts = [base]
  if (options.stage) {
    const position =
      typeof options.stageIndex === 'number' ? ` ${options.stageIndex + 1} de ${TOTAL_STAGES}` : ''
    const stageWord = lang === 'pt' ? 'etapa' : 'step'
    parts.push(`(${stageWord} ${stageDisplayName(options.stage, lang)}${position})`)
  }
  if (options.retryable) parts.push(RETRY_HINT[lang])
  return parts.join(' ')
}

/** Extract the slug from a raw persisted error field (`<slug>: <message>`). */
export function parseErrorSlug(raw: string | null | undefined): string | null {
  if (!raw) return null
  const idx = raw.indexOf(': ')
  return idx > 0 ? raw.slice(0, idx) : raw
}

/** Infer the failing stage from an error slug (`ingestion-<stage>-failed`). */
export function slugToStage(slug: string | null | undefined): IngestionStage | null {
  if (!slug) return null
  const match = /^ingestion-(.+)-failed$/.exec(slug)
  const name = match?.[1]
  return name && (INGESTION_STAGE_VALUES as readonly string[]).includes(name)
    ? (name as IngestionStage)
    : null
}

export function isRetryableSlug(slug: string | null | undefined): boolean {
  return slug !== null && slug !== undefined && RETRYABLE_SLUGS.has(slug)
}

export const _internals = { STAGE_DISPLAY, STATE_DISPLAY, ERROR_MESSAGE, TOTAL_STAGES }
