import { DialogusError } from '@dialogus/shared/errors'
import { describe, expect, it } from 'vitest'
import {
  ChunkError,
  CleanError,
  DownloadError,
  EmbedError,
  IndexError,
  ParseError,
} from '../../../src/domain/ingestion/IngestionError'

const STAGE_ERRORS = [
  {
    name: 'DownloadError',
    ctor: DownloadError,
    code: 'INGESTION_DOWNLOAD_FAILED',
    retryable: true,
  },
  { name: 'CleanError', ctor: CleanError, code: 'INGESTION_CLEAN_FAILED', retryable: false },
  { name: 'ParseError', ctor: ParseError, code: 'INGESTION_PARSE_FAILED', retryable: false },
  { name: 'ChunkError', ctor: ChunkError, code: 'INGESTION_CHUNK_FAILED', retryable: false },
  { name: 'EmbedError', ctor: EmbedError, code: 'INGESTION_EMBED_FAILED', retryable: true },
  { name: 'IndexError', ctor: IndexError, code: 'INGESTION_INDEX_FAILED', retryable: false },
] as const

describe('DownloadError', () => {
  it('exposes the INGESTION_DOWNLOAD_FAILED code and inherits DialogusError', () => {
    const err = new DownloadError('gutendex 503 timeout')
    expect(err).toBeInstanceOf(DialogusError)
    expect(err).toBeInstanceOf(DownloadError)
    expect(err.code).toBe('INGESTION_DOWNLOAD_FAILED')
    expect(err.message).toBe('gutendex 503 timeout')
    expect(err.retryable).toBe(true)
  })
})

describe('ParseError', () => {
  it('exposes the INGESTION_PARSE_FAILED code (non-retryable malformed input)', () => {
    const err = new ParseError('no chapters detected in EPUB spine')
    expect(err.code).toBe('INGESTION_PARSE_FAILED')
    expect(err).toBeInstanceOf(DialogusError)
    expect(err.retryable).toBe(false)
  })
})

describe('EmbedError', () => {
  it('exposes the INGESTION_EMBED_FAILED code with retryable: true metadata', () => {
    const err = new EmbedError('OpenAI 429 rate-limited')
    expect(err.code).toBe('INGESTION_EMBED_FAILED')
    expect(err.retryable).toBe(true)
    expect(err).toBeInstanceOf(DialogusError)
  })
})

describe.each(STAGE_ERRORS)('$name', ({ name, ctor, code, retryable }) => {
  it('inherits from DialogusError with the expected stage code and class name', () => {
    const err = new ctor('boom')
    expect(err).toBeInstanceOf(DialogusError)
    expect(err.code).toBe(code)
    expect(err.name).toBe(name)
  })

  it('exposes the default retryable flag for the stage', () => {
    const err = new ctor('boom')
    expect(err.retryable).toBe(retryable)
  })

  it('preserves the cause chain when provided', () => {
    const cause = new Error('underlying failure')
    const err = new ctor('boom', { cause })
    expect(err.cause).toBe(cause)
  })

  it('allows the retryable default to be overridden via options', () => {
    const flipped = new ctor('boom', { retryable: !retryable })
    expect(flipped.retryable).toBe(!retryable)
  })
})
