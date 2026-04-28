import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DialogusThreadContextProvider,
  type DialogusThreadContextValue,
} from '../../../src/components/chat/DialogusContext'
import { ThreadHeader } from '../../../src/components/chat/ThreadHeader'
import type { Book } from '../../../src/lib/api/_schemas'
import { makeTestQueryClient, QueryWrapper } from './_helpers'

const THREAD_ID = 'thread-test-1'
const BOOK_A_ID = '11111111-1111-4111-8111-111111111111'
const BOOK_B_ID = '22222222-2222-4222-8222-222222222222'

function makeBook(overrides: Partial<Book> & Pick<Book, 'id' | 'title'>): Book {
  return {
    gutendex_id: 0,
    authors: [],
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
    chapter_count: 30,
    ...overrides,
  }
}

const BOOK_A = makeBook({
  id: BOOK_A_ID,
  title: 'Memórias Póstumas de Brás Cubas',
  languages: ['pt'],
  chapter_count: 160,
})

const BOOK_B = makeBook({
  id: BOOK_B_ID,
  title: 'The Count of Monte Cristo',
  languages: ['en'],
  chapter_count: 117,
})

const BOOKS_BY_ID: Record<string, Book> = {
  [BOOK_A_ID]: BOOK_A,
  [BOOK_B_ID]: BOOK_B,
}

function buildCapKey(bookId: string): string {
  return `dialogus:spoiler_cap:${THREAD_ID}:${bookId}`
}

function fetchMock(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString()
  const match = url.match(/\/api\/library\/books\/([0-9a-f-]+)(?:\?|$)/)
  if (match) {
    const id = match[1] as string
    const book = BOOKS_BY_ID[id]
    if (!book) {
      return Promise.resolve(
        new Response(JSON.stringify({ type: 'about:blank', title: 'not found' }), {
          status: 404,
          headers: { 'content-type': 'application/problem+json' },
        }),
      )
    }
    return Promise.resolve(
      new Response(JSON.stringify({ data: book, links: { next: null } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
  return Promise.resolve(
    new Response(JSON.stringify({ data: [], links: { next: null } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

function makeContext(
  overrides: Partial<DialogusThreadContextValue> = {},
): DialogusThreadContextValue {
  return {
    threadId: THREAD_ID,
    bookIds: [BOOK_A_ID],
    setBookIds: () => {},
    isExistingThread: true,
    openAddBookDrawer: () => {},
    ...overrides,
  }
}

function renderHeader(ctxOverrides: Partial<DialogusThreadContextValue> = {}) {
  const ctx = makeContext(ctxOverrides)
  const client = makeTestQueryClient()
  return render(
    <QueryWrapper client={client}>
      <DialogusThreadContextProvider value={ctx}>
        <ThreadHeader />
      </DialogusThreadContextProvider>
    </QueryWrapper>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(fetchMock))
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ThreadHeader', () => {
  it('renders one chip per book in the thread context, in order', async () => {
    renderHeader({ bookIds: [BOOK_A_ID, BOOK_B_ID] })
    await waitFor(() => {
      const chips = document.querySelectorAll('[data-slot="thread-header-chip"]')
      expect(chips.length).toBe(2)
    })
    const chips = document.querySelectorAll('[data-slot="thread-header-chip"]')
    expect((chips[0] as HTMLElement).getAttribute('data-book-id')).toBe(BOOK_A_ID)
    expect((chips[1] as HTMLElement).getAttribute('data-book-id')).toBe(BOOK_B_ID)
  })

  it('chip shows language flag and truncated title', async () => {
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => screen.getByText(/Memórias Póstumas/))
    const chip = document.querySelector('[data-slot="thread-header-chip"]')
    expect(chip).not.toBeNull()
    expect(chip?.textContent).toContain('🇧🇷')
    expect(chip?.textContent).toContain('Memórias Póstumas de Br…')
  })

  it('renders no spoiler badge when there is no cap in localStorage', async () => {
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => screen.getByText(/Memórias Póstumas/))
    expect(document.querySelector('[data-slot="thread-header-cap-badge"]')).toBeNull()
  })

  it('renders "Cap. ≤ 12" badge when localStorage cap is 12', async () => {
    window.localStorage.setItem(buildCapKey(BOOK_A_ID), '12')
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => {
      const badge = document.querySelector('[data-slot="thread-header-cap-badge"]')
      expect(badge?.textContent).toBe('Cap. ≤ 12')
    })
  })

  it('clicking a chip opens the popover with the book full title', async () => {
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => screen.getByText(/Memórias Póstumas de Br…/))
    const chip = document.querySelector('[data-slot="thread-header-chip"]') as HTMLButtonElement
    fireEvent.click(chip)
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-header-popover"]')).not.toBeNull()
    })
    const heading = document.querySelector(
      '[data-slot="thread-header-popover-body"] h3',
    ) as HTMLElement
    expect(heading?.textContent).toBe('Memórias Póstumas de Brás Cubas')
  })

  it('slider readout matches the existing cap when one is set', async () => {
    window.localStorage.setItem(buildCapKey(BOOK_A_ID), '7')
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => screen.getByText(/Memórias Póstumas/))
    const chip = document.querySelector('[data-slot="thread-header-chip"]') as HTMLButtonElement
    fireEvent.click(chip)
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-header-popover"]')).not.toBeNull()
    })
    const readout = document.querySelector('[data-slot="thread-header-cap-readout"]')
    expect(readout?.textContent).toBe('7')
  })

  it('slider readout defaults to chapter_count when no cap is set', async () => {
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => screen.getByText(/Memórias Póstumas/))
    const chip = document.querySelector('[data-slot="thread-header-chip"]') as HTMLButtonElement
    fireEvent.click(chip)
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-header-popover"]')).not.toBeNull()
    })
    const readout = document.querySelector('[data-slot="thread-header-cap-readout"]')
    expect(readout?.textContent).toBe(String(BOOK_A.chapter_count))
  })

  it('slider keyboard change writes the new value to localStorage after the debounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    window.localStorage.setItem(buildCapKey(BOOK_A_ID), '10')
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => screen.getByText(/Memórias Póstumas/))
    const chip = document.querySelector('[data-slot="thread-header-chip"]') as HTMLButtonElement
    fireEvent.click(chip)
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-header-popover"]')).not.toBeNull()
    })
    const thumb = document.querySelector('[data-slot="slider-thumb"]') as HTMLElement
    expect(thumb).not.toBeNull()
    // Wait for the slider to hydrate with the persisted cap of 10.
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-header-cap-readout"]')?.textContent).toBe(
        '10',
      )
    })
    // ArrowLeft moves the slider down by 1 step.
    fireEvent.keyDown(thumb, { key: 'ArrowLeft' })
    expect(document.querySelector('[data-slot="thread-header-cap-readout"]')?.textContent).toBe('9')
    // Before debounce flush, localStorage still holds the old value.
    expect(window.localStorage.getItem(buildCapKey(BOOK_A_ID))).toBe('10')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(window.localStorage.getItem(buildCapKey(BOOK_A_ID))).toBe('9')
  })

  it('toggling "Sem cap" off (cap was set) clears localStorage immediately', async () => {
    window.localStorage.setItem(buildCapKey(BOOK_A_ID), '5')
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => screen.getByText(/Memórias Póstumas/))
    const chip = document.querySelector('[data-slot="thread-header-chip"]') as HTMLButtonElement
    fireEvent.click(chip)
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-header-popover"]')).not.toBeNull()
    })
    // Initial state: switch is unchecked (cap exists → noCap=false). Click to enable Sem cap.
    const switchButton = document.querySelector(
      '[data-slot="thread-header-no-cap-switch"]',
    ) as HTMLButtonElement
    expect(switchButton).not.toBeNull()
    expect(switchButton.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(switchButton)
    await waitFor(() => {
      expect(window.localStorage.getItem(buildCapKey(BOOK_A_ID))).toBeNull()
    })
  })

  it('toggling "Sem cap" on (no cap was set) writes a fresh cap at chapter_count', async () => {
    // Start with no cap in storage. Switch is currently checked (noCap=true). Click to disable.
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => screen.getByText(/Memórias Póstumas/))
    const chip = document.querySelector('[data-slot="thread-header-chip"]') as HTMLButtonElement
    fireEvent.click(chip)
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-header-popover"]')).not.toBeNull()
    })
    const switchButton = document.querySelector(
      '[data-slot="thread-header-no-cap-switch"]',
    ) as HTMLButtonElement
    expect(switchButton.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(switchButton)
    await waitFor(() => {
      expect(window.localStorage.getItem(buildCapKey(BOOK_A_ID))).toBe(String(BOOK_A.chapter_count))
    })
  })

  it('returns null when threadId is null', () => {
    renderHeader({ threadId: null, bookIds: [BOOK_A_ID] })
    expect(document.querySelector('[data-slot="thread-header"]')).toBeNull()
  })

  it('returns null when bookIds is empty', () => {
    renderHeader({ bookIds: [] })
    expect(document.querySelector('[data-slot="thread-header"]')).toBeNull()
  })

  it('chip exposes "Trocar livros = nova conversa" via the tooltip on focus', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => screen.getByText(/Memórias Póstumas/))
    const chip = document.querySelector('[data-slot="thread-header-chip"]') as HTMLButtonElement
    fireEvent.focus(chip)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    await waitFor(() => {
      const tooltips = screen.queryAllByRole('tooltip')
      expect(tooltips.length).toBeGreaterThan(0)
      const labels = tooltips.map((t) => t.textContent ?? '')
      expect(labels).toContain('Trocar livros = nova conversa')
    })
  })

  it('outside pointer dismisses the popover', async () => {
    renderHeader({ bookIds: [BOOK_A_ID] })
    await waitFor(() => screen.getByText(/Memórias Póstumas/))
    const chip = document.querySelector('[data-slot="thread-header-chip"]') as HTMLButtonElement
    fireEvent.click(chip)
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-header-popover"]')).not.toBeNull()
    })
    fireEvent.pointerDown(document.body, {
      bubbles: true,
      pointerType: 'mouse',
      button: 0,
    })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="thread-header-popover"]')).toBeNull()
    })
  })

  it('falls back to a "Capítulos disponíveis em breve" notice when chapter_count is undefined', async () => {
    const bookNoChapters = makeBook({
      id: BOOK_A_ID,
      title: 'Sem capítulos',
      languages: ['pt'],
    })
    bookNoChapters.chapter_count = undefined
    BOOKS_BY_ID[BOOK_A_ID] = bookNoChapters
    try {
      renderHeader({ bookIds: [BOOK_A_ID] })
      await waitFor(() => screen.getByText(/Sem capítulos/))
      const chip = document.querySelector('[data-slot="thread-header-chip"]') as HTMLButtonElement
      fireEvent.click(chip)
      await waitFor(() => {
        expect(document.querySelector('[data-slot="thread-header-popover"]')).not.toBeNull()
      })
      expect(
        document.querySelector('[data-slot="thread-header-no-chapters"]')?.textContent,
      ).toContain('em breve')
      expect(document.querySelector('[data-slot="slider-thumb"]')).toBeNull()
    } finally {
      BOOKS_BY_ID[BOOK_A_ID] = BOOK_A
    }
  })
})
