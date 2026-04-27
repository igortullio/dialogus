import { type ChatStreamRequest, chatStreamRequestSchema } from '@dialogus/shared/schemas/chat'
import { describe, expect, it } from 'vitest'

const BOOK_A = '11111111-1111-4111-8111-111111111111'
const BOOK_B = '22222222-2222-4222-8222-222222222222'

describe('chatStreamRequestSchema', () => {
  it('accepts a minimal request with a single book and a non-empty message', () => {
    const result = chatStreamRequestSchema.safeParse({
      message: 'Quem é o narrador?',
      book_ids: [BOOK_A],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const parsed: ChatStreamRequest = result.data
      expect(parsed.message).toBe('Quem é o narrador?')
      expect(parsed.book_ids).toEqual([BOOK_A])
      expect(parsed.spoiler_caps).toBeUndefined()
      expect(parsed.thread_id).toBeUndefined()
    }
  })

  it('accepts spoiler_caps mapping book uuids to non-negative integer chapter ordinals', () => {
    const result = chatStreamRequestSchema.safeParse({
      message: 'Resumo até o capítulo 3',
      book_ids: [BOOK_A, BOOK_B],
      spoiler_caps: { [BOOK_A]: 5, [BOOK_B]: 0 },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.spoiler_caps?.[BOOK_A]).toBe(5)
      expect(result.data.spoiler_caps?.[BOOK_B]).toBe(0)
    }
  })

  it('accepts an optional thread_id when continuing an existing thread', () => {
    const threadId = '33333333-3333-4333-8333-333333333333'
    const result = chatStreamRequestSchema.safeParse({
      message: 'continue',
      book_ids: [BOOK_A],
      thread_id: threadId,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.thread_id).toBe(threadId)
    }
  })

  it('rejects an empty message', () => {
    const result = chatStreamRequestSchema.safeParse({
      message: '',
      book_ids: [BOOK_A],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'message')
      expect(issue).toBeDefined()
    }
  })

  it('rejects an empty book_ids array', () => {
    const result = chatStreamRequestSchema.safeParse({
      message: 'oi',
      book_ids: [],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'book_ids')
      expect(issue).toBeDefined()
    }
  })

  it('rejects a non-uuid value inside book_ids', () => {
    const result = chatStreamRequestSchema.safeParse({
      message: 'oi',
      book_ids: ['not-a-uuid'],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'book_ids.0')
      expect(issue).toBeDefined()
    }
  })

  it('rejects a non-uuid thread_id', () => {
    const result = chatStreamRequestSchema.safeParse({
      message: 'oi',
      book_ids: [BOOK_A],
      thread_id: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'thread_id')
      expect(issue).toBeDefined()
    }
  })

  it('rejects spoiler_caps with a non-uuid key', () => {
    const result = chatStreamRequestSchema.safeParse({
      message: 'oi',
      book_ids: [BOOK_A],
      spoiler_caps: { 'not-a-uuid': 1 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects spoiler_caps with a negative chapter ordinal', () => {
    const result = chatStreamRequestSchema.safeParse({
      message: 'oi',
      book_ids: [BOOK_A],
      spoiler_caps: { [BOOK_A]: -1 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects spoiler_caps with a non-integer chapter ordinal', () => {
    const result = chatStreamRequestSchema.safeParse({
      message: 'oi',
      book_ids: [BOOK_A],
      spoiler_caps: { [BOOK_A]: 1.5 },
    })
    expect(result.success).toBe(false)
  })

  it('round-trips through JSON without loss', () => {
    const original: ChatStreamRequest = {
      message: 'Quem é o narrador?',
      book_ids: [BOOK_A],
      spoiler_caps: { [BOOK_A]: 3 },
      thread_id: '44444444-4444-4444-8444-444444444444',
    }
    const roundTripped = JSON.parse(JSON.stringify(original))
    const result = chatStreamRequestSchema.safeParse(roundTripped)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(original)
    }
  })
})
