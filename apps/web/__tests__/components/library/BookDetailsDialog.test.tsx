import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BookDetailsDialog } from '../../../src/components/library/BookDetailsDialog'
import type { Book } from '../../../src/lib/api/_schemas'

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    gutendex_id: 1184,
    title: 'The Count of Monte Cristo',
    authors: [{ name: 'Alexandre Dumas', birth_year: null, death_year: null }],
    languages: ['en'],
    subjects: ['Adventure', 'Classics'],
    download_url_epub: null,
    download_url_txt: null,
    cover_url: null,
    raw_hash: null,
    ingestion_status: 'ready',
    ingestion_error: null,
    tags: [],
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

describe('BookDetailsDialog', () => {
  it('renders nothing visible when open=false', () => {
    render(<BookDetailsDialog book={makeBook()} open={false} onOpenChange={() => {}} />)
    expect(document.querySelector('[data-slot="book-details-dialog"]')).toBeNull()
  })

  it('renders the title, authors, languages, status, and subjects when open', () => {
    render(<BookDetailsDialog book={makeBook()} open={true} onOpenChange={() => {}} />)
    expect(screen.getByText('The Count of Monte Cristo')).toBeDefined()
    expect(screen.getByText('Alexandre Dumas')).toBeDefined()
    expect(screen.getByText('EN')).toBeDefined()
    // feature 002: the raw English status is now localized (gap #9).
    expect(screen.getByText('Pronto')).toBeDefined()
    expect(screen.getByText(/Adventure · Classics/)).toBeDefined()
  })

  it('falls back to "Sem autores" / "Sem assuntos" / dash when fields are empty', () => {
    render(
      <BookDetailsDialog
        book={makeBook({ authors: [], subjects: [], languages: [] })}
        open={true}
        onOpenChange={() => {}}
      />,
    )
    expect(screen.getByText('Sem autores')).toBeDefined()
    expect(screen.getByText('Sem assuntos')).toBeDefined()
    expect(screen.getByText('—')).toBeDefined()
  })

  it('clicking the close button calls onOpenChange(false)', () => {
    const onOpenChange = vi.fn()
    render(<BookDetailsDialog book={makeBook()} open={true} onOpenChange={onOpenChange} />)
    const close = document.querySelector('[data-slot="book-details-close"]') as HTMLButtonElement
    fireEvent.click(close)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
