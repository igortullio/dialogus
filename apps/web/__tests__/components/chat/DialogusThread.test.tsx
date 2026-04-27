import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDialogusThreadContext } from '../../../src/components/chat/DialogusContext'
import { DialogusThread } from '../../../src/components/chat/DialogusThread'
import { makeTestQueryClient, QueryWrapper } from './_helpers'

const BOOK_A_ID = '11111111-1111-4111-8111-111111111111'
const BOOK_B_ID = '22222222-2222-4222-8222-222222222222'
const BOOK_C_ID = '33333333-3333-4333-8333-333333333333'
const BOOK_D_ID = '44444444-4444-4444-8444-444444444444'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      return new Response(JSON.stringify({ data: [], links: { next: null } }), {
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
  window.localStorage.clear()
})

interface ProbeProps {
  onResolved?(value: ReturnType<typeof useDialogusThreadContext>): void
}

function ContextProbe({ onResolved }: ProbeProps) {
  const value = useDialogusThreadContext()
  onResolved?.(value)
  return (
    <div>
      <span data-testid="thread-id">{value.threadId ?? 'null'}</span>
      <span data-testid="is-existing">{String(value.isExistingThread)}</span>
      <span data-testid="book-count">{value.bookIds.length}</span>
      <span data-testid="book-ids">{value.bookIds.join(',')}</span>
    </div>
  )
}

describe('DialogusThread', () => {
  it('provides default thread context to children when threadId is null', () => {
    render(
      <QueryWrapper client={makeTestQueryClient()}>
        <DialogusThread>
          <ContextProbe />
        </DialogusThread>
      </QueryWrapper>,
    )
    expect(screen.getByTestId('thread-id').textContent).toBe('null')
    expect(screen.getByTestId('is-existing').textContent).toBe('false')
    expect(screen.getByTestId('book-count').textContent).toBe('0')
  })

  it('exposes the provided threadId + isExistingThread = true', () => {
    render(
      <QueryWrapper client={makeTestQueryClient()}>
        <DialogusThread threadId="thread-42" initialBookIds={[BOOK_A_ID]}>
          <ContextProbe />
        </DialogusThread>
      </QueryWrapper>,
    )
    expect(screen.getByTestId('thread-id').textContent).toBe('thread-42')
    expect(screen.getByTestId('is-existing').textContent).toBe('true')
    expect(screen.getByTestId('book-count').textContent).toBe('1')
  })

  it('truncates initialBookIds beyond the 3-book soft limit', () => {
    render(
      <QueryWrapper client={makeTestQueryClient()}>
        <DialogusThread initialBookIds={[BOOK_A_ID, BOOK_B_ID, BOOK_C_ID, BOOK_D_ID]}>
          <ContextProbe />
        </DialogusThread>
      </QueryWrapper>,
    )
    expect(screen.getByTestId('book-count').textContent).toBe('3')
    expect(screen.getByTestId('book-ids').textContent).toBe(
      [BOOK_A_ID, BOOK_B_ID, BOOK_C_ID].join(','),
    )
  })

  it('exposes a setBookIds callback that mutates context state', () => {
    let captured: ReturnType<typeof useDialogusThreadContext> | null = null
    render(
      <QueryWrapper client={makeTestQueryClient()}>
        <DialogusThread>
          <ContextProbe
            onResolved={(value) => {
              captured = value
            }}
          />
        </DialogusThread>
      </QueryWrapper>,
    )
    expect(captured).not.toBeNull()
    if (!captured) throw new Error('context probe missed')
    act(() => {
      captured?.setBookIds([BOOK_A_ID, BOOK_B_ID])
    })
    expect(screen.getByTestId('book-count').textContent).toBe('2')
  })

  it('throws if useDialogusThreadContext is used outside the provider', () => {
    const renderOutside = () =>
      render(
        <QueryWrapper client={makeTestQueryClient()}>
          <ContextProbe />
        </QueryWrapper>,
      )
    expect(renderOutside).toThrow(/useDialogusThreadContext/)
  })
})
