import { DialogusError } from '@dialogus/shared/errors'
import { describe, expect, it } from 'vitest'
import {
  BookNotFoundError,
  DuplicateBookError,
  GutendexUpstreamError,
} from '../../../src/domain/book/BookError'

describe('DuplicateBookError', () => {
  it('hard-codes the DUPLICATE_GUTENDEX_ID code and surfaces the message', () => {
    const err = new DuplicateBookError('gutendex 996 exists as uuid abc')
    expect(err.code).toBe('DUPLICATE_GUTENDEX_ID')
    expect(err.message).toBe('gutendex 996 exists as uuid abc')
    expect(err.name).toBe('DuplicateBookError')
    expect(err.existingBookId).toBeNull()
  })

  it('extends DialogusError and Error', () => {
    const err = new DuplicateBookError('x')
    expect(err).toBeInstanceOf(DialogusError)
    expect(err).toBeInstanceOf(Error)
  })

  it('captures the existing book id when provided', () => {
    const err = new DuplicateBookError('exists', {
      existingBookId: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    })
    expect(err.existingBookId).toBe('a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0')
  })

  it('preserves the original cause when one is passed', () => {
    const original = new Error('db unique violation')
    const err = new DuplicateBookError('exists', { cause: original })
    expect(err.cause).toBe(original)
  })

  it('treats cause as undefined when omitted', () => {
    const err = new DuplicateBookError('no cause')
    expect(err.cause).toBeUndefined()
  })
})

describe('BookNotFoundError', () => {
  it('hard-codes the BOOK_NOT_FOUND code', () => {
    const err = new BookNotFoundError('uuid X')
    expect(err.code).toBe('BOOK_NOT_FOUND')
    expect(err.message).toBe('uuid X')
    expect(err.name).toBe('BookNotFoundError')
  })

  it('extends DialogusError and Error', () => {
    const err = new BookNotFoundError('missing')
    expect(err).toBeInstanceOf(DialogusError)
    expect(err).toBeInstanceOf(Error)
  })

  it('preserves the original cause when one is passed', () => {
    const original = new Error('row not in db')
    const err = new BookNotFoundError('missing', original)
    expect(err.cause).toBe(original)
  })
})

describe('GutendexUpstreamError', () => {
  it('hard-codes the GUTENDEX_UPSTREAM_ERROR code and carries the upstream status', () => {
    const err = new GutendexUpstreamError(503, 'timeout')
    expect(err.code).toBe('GUTENDEX_UPSTREAM_ERROR')
    expect(err.message).toBe('timeout')
    expect(err.name).toBe('GutendexUpstreamError')
    expect(err.upstreamStatus).toBe(503)
  })

  it('accepts a null upstream status when the failure was non-HTTP (e.g. timeout)', () => {
    const err = new GutendexUpstreamError(null, 'fetch aborted')
    expect(err.upstreamStatus).toBeNull()
  })

  it('extends DialogusError and Error', () => {
    const err = new GutendexUpstreamError(502, 'bad gateway')
    expect(err).toBeInstanceOf(DialogusError)
    expect(err).toBeInstanceOf(Error)
  })

  it('preserves the original cause when one is passed', () => {
    const original = new Error('socket hang up')
    const err = new GutendexUpstreamError(null, 'network', original)
    expect(err.cause).toBe(original)
  })
})

describe('catalog error hierarchy distinguishability', () => {
  it('keeps subclasses distinguishable via instanceof', () => {
    const dup = new DuplicateBookError('a')
    const nf = new BookNotFoundError('b')
    const up = new GutendexUpstreamError(500, 'c')

    expect(dup).toBeInstanceOf(DuplicateBookError)
    expect(dup).not.toBeInstanceOf(BookNotFoundError)
    expect(dup).not.toBeInstanceOf(GutendexUpstreamError)

    expect(nf).toBeInstanceOf(BookNotFoundError)
    expect(nf).not.toBeInstanceOf(DuplicateBookError)
    expect(nf).not.toBeInstanceOf(GutendexUpstreamError)

    expect(up).toBeInstanceOf(GutendexUpstreamError)
    expect(up).not.toBeInstanceOf(DuplicateBookError)
    expect(up).not.toBeInstanceOf(BookNotFoundError)
  })
})
