import { envelope } from '@dialogus/shared/http/envelope'
import { describe, expect, it } from 'vitest'

describe('envelope', () => {
  it('wraps an object payload with no meta or links', () => {
    const result = envelope({ x: 1 })
    expect(result).toEqual({ data: { x: 1 } })
    expect('meta' in result).toBe(false)
    expect('links' in result).toBe(false)
  })

  it('includes meta when provided', () => {
    const result = envelope({ x: 1 }, { meta: { count: 5 } })
    expect(result).toEqual({ data: { x: 1 }, meta: { count: 5 } })
    expect('links' in result).toBe(false)
  })

  it('includes links when provided', () => {
    const result = envelope([1, 2], { links: { next: '/?cursor=x' } })
    expect(result).toEqual({ data: [1, 2], links: { next: '/?cursor=x' } })
    expect('meta' in result).toBe(false)
  })

  it('includes both meta and links when provided together', () => {
    const result = envelope([1, 2], {
      meta: { count: 2, limit: 50 },
      links: { self: '/api/library/books', next: '/api/library/books?cursor=abc' },
    })
    expect(result).toEqual({
      data: [1, 2],
      meta: { count: 2, limit: 50 },
      links: { self: '/api/library/books', next: '/api/library/books?cursor=abc' },
    })
  })

  it('omits meta and links when their entries on opts are undefined', () => {
    const result = envelope({ x: 1 }, { meta: undefined, links: undefined })
    expect(result).toEqual({ data: { x: 1 } })
    expect('meta' in result).toBe(false)
    expect('links' in result).toBe(false)
  })

  it('preserves null and primitive payloads on data', () => {
    expect(envelope(null)).toEqual({ data: null })
    expect(envelope(0)).toEqual({ data: 0 })
    expect(envelope('')).toEqual({ data: '' })
  })

  it('does not mutate the meta or links references it receives', () => {
    const meta = { count: 1 }
    const links = { self: '/x' }
    const result = envelope({ x: 1 }, { meta, links })
    expect(result.meta).toBe(meta)
    expect(result.links).toBe(links)
  })
})
