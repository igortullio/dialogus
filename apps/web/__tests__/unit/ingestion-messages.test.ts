import { INGESTION_STAGE_VALUES } from '@dialogus/shared/schemas/ingestion'
import { describe, expect, it } from 'vitest'
import {
  friendlyErrorMessage,
  isRetryableSlug,
  parseErrorSlug,
  slugToStage,
  stageDisplayName,
} from '@/lib/ingestion/messages'

describe('friendlyErrorMessage', () => {
  it('maps every error slug to a localized message that never leaks the slug', () => {
    for (const stage of INGESTION_STAGE_VALUES) {
      const slug = `ingestion-${stage}-failed`
      const msg = friendlyErrorMessage(slug, { stage })
      expect(msg).not.toContain(slug)
      expect(msg).not.toMatch(/ingestion-.*-failed/)
      expect(msg.length).toBeGreaterThan(0)
    }
  })

  it('names the failing stage and position, and adds a retry hint when retryable', () => {
    const msg = friendlyErrorMessage('ingestion-embed-failed', {
      stage: 'embed',
      stageIndex: 5,
      retryable: true,
    })
    expect(msg).toContain('Embeddings')
    expect(msg).toContain('etapa')
    expect(msg).toContain('6 de 7')
    expect(msg).toContain('Tente novamente')
  })

  it('falls back to a generic message for an unknown slug', () => {
    const msg = friendlyErrorMessage('something-weird')
    expect(msg).toBe('A ingestão falhou.')
  })

  it('omits the retry hint when not retryable', () => {
    const msg = friendlyErrorMessage('ingestion-parse-failed', { stage: 'parse', retryable: false })
    expect(msg).not.toContain('Tente novamente')
  })
})

describe('parseErrorSlug', () => {
  it('extracts the slug from a raw `<slug>: <message>` field', () => {
    expect(parseErrorSlug('ingestion-embed-failed: boom')).toBe('ingestion-embed-failed')
    expect(parseErrorSlug('no-colon')).toBe('no-colon')
    expect(parseErrorSlug(null)).toBeNull()
    expect(parseErrorSlug(undefined)).toBeNull()
  })
})

describe('slugToStage', () => {
  it('infers the failing stage from the slug', () => {
    expect(slugToStage('ingestion-embed-failed')).toBe('embed')
    expect(slugToStage('ingestion-download-failed')).toBe('download')
    expect(slugToStage('ingestion-failed')).toBeNull()
    expect(slugToStage(null)).toBeNull()
  })
})

describe('isRetryableSlug', () => {
  it('flags only the transient stages as retryable', () => {
    expect(isRetryableSlug('ingestion-download-failed')).toBe(true)
    expect(isRetryableSlug('ingestion-embed-failed')).toBe(true)
    expect(isRetryableSlug('ingestion-summarize-failed')).toBe(true)
    expect(isRetryableSlug('ingestion-parse-failed')).toBe(false)
    expect(isRetryableSlug(null)).toBe(false)
  })
})

describe('stageDisplayName', () => {
  it('returns a non-empty display name for every stage', () => {
    for (const stage of INGESTION_STAGE_VALUES) {
      expect(stageDisplayName(stage).length).toBeGreaterThan(0)
    }
  })
})
