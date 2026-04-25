import { PROBLEM_TYPE_PREFIX, problemDetails } from '@dialogus/shared/http/problem'
import { describe, expect, it } from 'vitest'

describe('problemDetails', () => {
  it('returns an RFC 9457 minimum shape with derived title', () => {
    const result = problemDetails('validation-failed', 400, 'body is malformed')
    expect(result).toEqual({
      type: 'urn:dialogus:problems:validation-failed',
      title: 'Validation Failed',
      status: 400,
      detail: 'body is malformed',
    })
    expect('errors' in result).toBe(false)
  })

  it('omits detail when not provided', () => {
    const result = problemDetails('book-not-found', 404)
    expect(result).toEqual({
      type: 'urn:dialogus:problems:book-not-found',
      title: 'Book Not Found',
      status: 404,
    })
    expect('detail' in result).toBe(false)
    expect('errors' in result).toBe(false)
  })

  it('includes the errors extension when provided', () => {
    const result = problemDetails('book-not-found', 404, undefined, [
      { field: 'id', message: 'not a uuid' },
    ])
    expect(result).toEqual({
      type: 'urn:dialogus:problems:book-not-found',
      title: 'Book Not Found',
      status: 404,
      errors: [{ field: 'id', message: 'not a uuid' }],
    })
    expect('detail' in result).toBe(false)
  })

  it('always emits a type URI under the urn:dialogus:problems: namespace', () => {
    for (const slug of [
      'duplicate-gutendex-id',
      'gutendex-upstream-error',
      'idempotency-key-conflict',
      'invalid-cursor',
    ]) {
      const result = problemDetails(slug, 400)
      expect(result.type.startsWith(PROBLEM_TYPE_PREFIX)).toBe(true)
      expect(result.type).toBe(`${PROBLEM_TYPE_PREFIX}${slug}`)
    }
  })

  it('exposes the namespace prefix as a public constant', () => {
    expect(PROBLEM_TYPE_PREFIX).toBe('urn:dialogus:problems:')
  })

  it('always populates the RFC 9457 required fields', () => {
    const result = problemDetails('x', 500)
    expect(typeof result.type).toBe('string')
    expect(typeof result.title).toBe('string')
    expect(result.title.length).toBeGreaterThan(0)
    expect(typeof result.status).toBe('number')
  })

  it('preserves the errors reference passed in', () => {
    const errors = [{ field: 'gutendex_id', message: 'must be a positive integer' }]
    const result = problemDetails('validation-failed', 422, 'invalid request', errors)
    expect(result.errors).toBe(errors)
    expect(result.detail).toBe('invalid request')
  })
})
