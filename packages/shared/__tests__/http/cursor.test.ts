import { DialogusError, InvalidCursorError } from '@dialogus/shared/errors'
import { decodeCursor, encodeCursor } from '@dialogus/shared/http/cursor'
import { describe, expect, it } from 'vitest'

const VALID_ID = '11111111-1111-4111-8111-111111111111'
const VALID_DATE = new Date('2026-04-25T12:34:56.789Z')

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a position with an ISO date and UUID id', () => {
    const cursor = encodeCursor({ createdAt: VALID_DATE, id: VALID_ID })
    const decoded = decodeCursor(cursor)
    expect(decoded.id).toBe(VALID_ID)
    expect(decoded.createdAt).toBeInstanceOf(Date)
    expect(decoded.createdAt.toISOString()).toBe(VALID_DATE.toISOString())
  })

  it('produces a URL-safe token with no +, /, or = characters', () => {
    const cursor = encodeCursor({ createdAt: VALID_DATE, id: VALID_ID })
    expect(cursor).not.toMatch(/[+/=]/)
  })

  it('produces deterministic output for the same input', () => {
    const a = encodeCursor({ createdAt: VALID_DATE, id: VALID_ID })
    const b = encodeCursor({ createdAt: new Date(VALID_DATE.getTime()), id: VALID_ID })
    expect(a).toBe(b)
  })

  it('throws InvalidCursorError when input is not valid base64-encoded JSON', () => {
    expect(() => decodeCursor('not-base64')).toThrow(InvalidCursorError)
    try {
      decodeCursor('not-base64')
    } catch (err) {
      expect(err).toBeInstanceOf(DialogusError)
      const e = err as InvalidCursorError
      expect(e.code).toBe('INVALID_CURSOR')
      expect(e.cursor).toBe('not-base64')
    }
  })

  it('throws InvalidCursorError on a payload with an invalid datetime', () => {
    const cursor = base64url(JSON.stringify({ createdAt: 'bad', id: VALID_ID }))
    expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError)
  })

  it('throws InvalidCursorError on a payload missing the id field', () => {
    const cursor = base64url(JSON.stringify({ createdAt: VALID_DATE.toISOString() }))
    expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError)
  })

  it('throws InvalidCursorError on a payload missing both required fields', () => {
    const cursor = base64url(JSON.stringify({}))
    expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError)
  })

  it('accepts a non-UUID string id (Better Auth member ids are text, US3)', () => {
    const cursor = base64url(
      JSON.stringify({ createdAt: VALID_DATE.toISOString(), id: 'kQ7t9nanoid-member-id' }),
    )
    expect(decodeCursor(cursor).id).toBe('kQ7t9nanoid-member-id')
  })

  it('throws InvalidCursorError when id is an empty string', () => {
    const cursor = base64url(JSON.stringify({ createdAt: VALID_DATE.toISOString(), id: '' }))
    expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError)
  })

  it('throws InvalidCursorError when the decoded bytes are not valid JSON', () => {
    const cursor = base64url('not-json')
    expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError)
  })

  it('throws InvalidCursorError on an empty cursor string', () => {
    expect(() => decodeCursor('')).toThrow(InvalidCursorError)
  })

  it('preserves the original cause on the thrown InvalidCursorError', () => {
    try {
      decodeCursor('not-base64')
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidCursorError)
      expect((err as InvalidCursorError).cause).toBeDefined()
    }
  })

  it('does not accept extra non-minimal fields like limit or direction on encoder input (type check)', () => {
    // @ts-expect-error encodeCursor must reject `limit` (ADR-005 Alternative 2 rejection)
    encodeCursor({ createdAt: VALID_DATE, id: VALID_ID, limit: 10 })
    // @ts-expect-error encodeCursor must reject `direction` (ADR-005 Alternative 2 rejection)
    encodeCursor({ createdAt: VALID_DATE, id: VALID_ID, direction: 'next' })
  })
})
