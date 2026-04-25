import {
  type ChunkReadDto,
  chunkReadDtoSchema,
  INGESTION_STAGE_VALUES,
  INGESTION_STATUS_VALUES,
  type IngestionEnqueueResponseDto,
  type IngestionStatusDto,
  ingestionEnqueueResponseDtoSchema,
  ingestionStageEnum,
  ingestionStatusDtoSchema,
  ingestionStatusEnum,
} from '@dialogus/shared/schemas/ingestion'
import { describe, expect, it } from 'vitest'

const BOOK_ID = '11111111-1111-4111-8111-111111111111'
const CHAPTER_ID = '22222222-2222-4222-8222-222222222222'
const CHUNK_ID = '33333333-3333-4333-8333-333333333333'

describe('ingestionStatusEnum', () => {
  it('contains the post-ADR-008 ten-status set in pipeline order', () => {
    expect(INGESTION_STATUS_VALUES).toEqual([
      'discovered',
      'downloading',
      'cleaning',
      'parsing',
      'chunking',
      'summarizing',
      'embedding',
      'indexing',
      'ready',
      'failed',
    ])
  })

  it('rejects values outside the literal set', () => {
    const result = ingestionStatusEnum.safeParse('bogus')
    expect(result.success).toBe(false)
  })
})

describe('ingestionStageEnum', () => {
  it('contains the seven stages in pipeline order (download → … → index)', () => {
    expect(INGESTION_STAGE_VALUES).toEqual([
      'download',
      'clean',
      'parse',
      'chunk',
      'summarize',
      'embed',
      'index',
    ])
  })

  it('rejects unknown stages', () => {
    const result = ingestionStageEnum.safeParse('upload')
    expect(result.success).toBe(false)
  })
})

describe('ingestionStatusDtoSchema', () => {
  const baseDiscovered: IngestionStatusDto = {
    book_id: BOOK_ID,
    status: 'discovered',
    stage: null,
    progress: 0,
    started_at: null,
    indexed_at: null,
    last_stage: null,
    error: null,
  }

  it('parses a freshly-added book with status=discovered, stage=null, progress=0', () => {
    const result = ingestionStatusDtoSchema.safeParse(baseDiscovered)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('discovered')
      expect(result.data.stage).toBeNull()
      expect(result.data.progress).toBe(0)
    }
  })

  it('parses a mid-pipeline embedding state with stage=embed and progress=34', () => {
    const dto: IngestionStatusDto = {
      ...baseDiscovered,
      status: 'embedding',
      stage: 'embed',
      progress: 34,
      started_at: '2026-04-25T15:30:00.000Z',
      last_stage: 'embed',
    }
    const result = ingestionStatusDtoSchema.safeParse(dto)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('embedding')
      expect(result.data.stage).toBe('embed')
      expect(result.data.progress).toBe(34)
    }
  })

  it('rejects an unknown status enum value', () => {
    const result = ingestionStatusDtoSchema.safeParse({ ...baseDiscovered, status: 'bogus' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const statusIssue = result.error.issues.find((issue) => issue.path.join('.') === 'status')
      expect(statusIssue).toBeDefined()
    }
  })

  it('rejects a progress outside the 0..100 range', () => {
    const result = ingestionStatusDtoSchema.safeParse({ ...baseDiscovered, progress: 101 })
    expect(result.success).toBe(false)
  })

  it('rejects a non-uuid book_id', () => {
    const result = ingestionStatusDtoSchema.safeParse({ ...baseDiscovered, book_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('parses a failed state with a structured error object', () => {
    const dto: IngestionStatusDto = {
      ...baseDiscovered,
      status: 'failed',
      stage: 'embed',
      progress: 80,
      started_at: '2026-04-25T15:30:00.000Z',
      last_stage: 'embed',
      error: {
        message: 'OpenAI 503 upstream timeout',
        retryable: true,
        slug: 'ingestion-embed-failed',
      },
    }
    const result = ingestionStatusDtoSchema.safeParse(dto)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.error?.slug).toBe('ingestion-embed-failed')
      expect(result.data.error?.retryable).toBe(true)
    }
  })

  it('rejects a malformed error object missing a required field', () => {
    const result = ingestionStatusDtoSchema.safeParse({
      ...baseDiscovered,
      status: 'failed',
      error: { message: 'oops', retryable: true },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const slugIssue = result.error.issues.find((issue) => issue.path.join('.') === 'error.slug')
      expect(slugIssue).toBeDefined()
    }
  })

  it('strips unknown fields rather than failing (tolerant strip mode)', () => {
    const result = ingestionStatusDtoSchema.safeParse({
      ...baseDiscovered,
      _ignore_me: 'extra',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('_ignore_me')
    }
  })
})

describe('chunkReadDtoSchema', () => {
  const baseChunk: ChunkReadDto = {
    id: CHUNK_ID,
    book_id: BOOK_ID,
    chapter_id: CHAPTER_ID,
    chapter_title: 'Chapter 1',
    chapter_ordinal: 0,
    ordinal: 0,
    text: 'Call me Ishmael.',
    token_count: 4,
    start_char: 0,
    end_char: 16,
  }

  it('parses a valid chunk envelope', () => {
    const result = chunkReadDtoSchema.safeParse(baseChunk)
    expect(result.success).toBe(true)
  })

  it('rejects when text is missing', () => {
    const { text: _text, ...withoutText } = baseChunk
    const result = chunkReadDtoSchema.safeParse(withoutText)
    expect(result.success).toBe(false)
    if (!result.success) {
      const textIssue = result.error.issues.find((issue) => issue.path.join('.') === 'text')
      expect(textIssue).toBeDefined()
    }
  })

  it('rejects negative ordinals', () => {
    const result = chunkReadDtoSchema.safeParse({ ...baseChunk, ordinal: -1 })
    expect(result.success).toBe(false)
  })
})

describe('ingestionEnqueueResponseDtoSchema', () => {
  it('parses a valid enqueue response', () => {
    const dto: IngestionEnqueueResponseDto = {
      book_id: BOOK_ID,
      status: 'downloading',
      stage: 'download',
      job_id: 'job-abc-123',
    }
    const result = ingestionEnqueueResponseDtoSchema.safeParse(dto)
    expect(result.success).toBe(true)
  })

  it('rejects an empty job_id', () => {
    const result = ingestionEnqueueResponseDtoSchema.safeParse({
      book_id: BOOK_ID,
      status: 'downloading',
      stage: 'download',
      job_id: '',
    })
    expect(result.success).toBe(false)
  })
})
