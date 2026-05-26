import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BookPicker } from '../../../src/components/chat/BookPicker'
import { makeTestQueryClient, QueryWrapper } from './_helpers'

const BOOK_A_ID = '11111111-1111-4111-8111-111111111111'
const BOOK_B_ID = '22222222-2222-4222-8222-222222222222'
const BOOK_C_ID = '33333333-3333-4333-8333-333333333333'
const BOOK_D_ID = '44444444-4444-4444-8444-444444444444'

const FIXED_BOOKS = [
  {
    id: BOOK_A_ID,
    gutendex_id: 1,
    title: 'Memórias Póstumas de Brás Cubas',
    authors: [{ name: 'Machado de Assis', birth_year: 1839, death_year: 1908 }],
    languages: ['pt'],
    subjects: [],
    download_url_epub: null,
    download_url_txt: null,
    cover_url: null,
    raw_hash: null,
    ingestion_status: 'ready' as const,
    ingestion_error: null,
    tags: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: BOOK_B_ID,
    gutendex_id: 2,
    title: 'Crime e Castigo',
    authors: [{ name: 'Dostoiévski', birth_year: 1821, death_year: 1881 }],
    languages: ['ru'],
    subjects: [],
    download_url_epub: null,
    download_url_txt: null,
    cover_url: null,
    raw_hash: null,
    ingestion_status: 'ready' as const,
    ingestion_error: null,
    tags: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: BOOK_C_ID,
    gutendex_id: 3,
    title: 'O Conde de Monte Cristo',
    authors: [{ name: 'Alexandre Dumas', birth_year: 1802, death_year: 1870 }],
    languages: ['fr'],
    subjects: [],
    download_url_epub: null,
    download_url_txt: null,
    cover_url: null,
    raw_hash: null,
    ingestion_status: 'ready' as const,
    ingestion_error: null,
    tags: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: BOOK_D_ID,
    gutendex_id: 4,
    title: 'Dom Casmurro',
    authors: [{ name: 'Machado de Assis', birth_year: 1839, death_year: 1908 }],
    languages: ['pt'],
    subjects: [],
    download_url_epub: null,
    download_url_txt: null,
    cover_url: null,
    raw_hash: null,
    ingestion_status: 'ready' as const,
    ingestion_error: null,
    tags: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    deleted_at: null,
  },
]

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      return new Response(JSON.stringify({ data: FIXED_BOOKS, links: { next: null } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

interface RenderOptions {
  readonly value?: string[]
  onChange?: (value: string[]) => void
  readonly disabled?: boolean
  onOpenAddDrawer?: () => void
}

function renderPicker(opts: RenderOptions = {}) {
  const onChange = opts.onChange ?? vi.fn()
  const onOpenAddDrawer = opts.onOpenAddDrawer ?? vi.fn()
  const client = makeTestQueryClient()
  const utils = render(
    <QueryWrapper client={client}>
      <BookPicker
        value={opts.value ?? []}
        onChange={onChange}
        disabled={opts.disabled}
        onOpenAddDrawer={onOpenAddDrawer}
      />
    </QueryWrapper>,
  )
  return { ...utils, onChange, onOpenAddDrawer }
}

function clickTrigger() {
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar livros para a conversa' }))
}

describe('BookPicker', () => {
  it('renders a trigger labelled "Selecionar livros" when no books selected', () => {
    renderPicker({ value: [] })
    expect(screen.getByText('Selecionar livros')).toBeDefined()
  })

  it('shows the count when books are selected', () => {
    renderPicker({ value: [BOOK_A_ID] })
    expect(screen.getByText('1/3 livros')).toBeDefined()
  })

  it('opens the popover and lists ready books from the library API', async () => {
    renderPicker()
    clickTrigger()
    // Scope by data-book-id to avoid colliding with title text repeated inside
    // the SVG CoverFallback for books without a real cover URL.
    await waitFor(() => {
      expect(document.querySelector(`[data-book-id="${BOOK_A_ID}"]`)).not.toBeNull()
    })
    expect(document.querySelector(`[data-book-id="${BOOK_B_ID}"]`)).not.toBeNull()
    expect(document.querySelector(`[data-book-id="${BOOK_C_ID}"]`)).not.toBeNull()
  })

  it('selecting a book reports the new value via onChange', async () => {
    const { onChange } = renderPicker({ value: [] })
    clickTrigger()
    const row = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(`[data-book-id="${BOOK_A_ID}"]`)
      if (!el) throw new Error('row not yet rendered')
      return el
    })
    fireEvent.click(row)
    expect(onChange).toHaveBeenCalledWith([BOOK_A_ID])
  })

  it('clicking an already-selected book deselects it', async () => {
    const { onChange } = renderPicker({ value: [BOOK_A_ID] })
    clickTrigger()
    const row = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(`[data-book-id="${BOOK_A_ID}"]`)
      if (!el) throw new Error('row not yet rendered')
      return el
    })
    fireEvent.click(row)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('blocks selection of a 4th book when 3 are already selected (soft limit)', async () => {
    const onChange = vi.fn()
    renderPicker({ value: [BOOK_A_ID, BOOK_B_ID, BOOK_C_ID], onChange })
    clickTrigger()
    const dom = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(`[data-book-id="${BOOK_D_ID}"]`)
      if (!el) throw new Error('row not yet rendered')
      return el
    })
    expect(dom.getAttribute('aria-disabled')).toBe('true')
    await act(async () => {
      dom.click()
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('"Adicionar do Gutendex" link calls onOpenAddDrawer', async () => {
    const { onOpenAddDrawer } = renderPicker()
    clickTrigger()
    await waitFor(() => screen.getByText('+ Adicionar do Gutendex'))
    fireEvent.click(screen.getByText('+ Adicionar do Gutendex'))
    expect(onOpenAddDrawer).toHaveBeenCalledTimes(1)
  })

  it('disables the trigger when disabled prop is set', () => {
    renderPicker({ disabled: true })
    const trigger = screen.getByRole('button', { name: 'Selecionar livros para a conversa' })
    expect(trigger.hasAttribute('disabled')).toBe(true)
  })
})
