import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/lib/api/library', () => ({
  retryIngestion: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { _internals, RetryButton } from '../../../src/components/library/RetryButton'
import { retryIngestion } from '../../../src/lib/api/library'

const mockedRetry = vi.mocked(retryIngestion)

import { toast } from 'sonner'

const mockedToastError = vi.mocked(toast.error)

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

function Wrap({
  client,
  children,
}: {
  readonly client: QueryClient
  readonly children: ReactNode
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockedRetry.mockReset()
  mockedToastError.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('RetryButton', () => {
  it('renders the trigger and keeps the dialog closed by default', () => {
    render(
      <Wrap client={makeClient()}>
        <RetryButton bookId="book-1" lastError={null} />
      </Wrap>,
    )
    expect(document.querySelector('[data-slot="book-card-action-retry"]')).not.toBeNull()
    expect(document.querySelector('[data-slot="retry-button-dialog"]')).toBeNull()
  })

  it('clicking the trigger opens the dialog with the last error message visible', async () => {
    render(
      <Wrap client={makeClient()}>
        <RetryButton bookId="book-1" lastError="Falha ao processar capítulos." />
      </Wrap>,
    )
    await act(async () => {
      fireEvent.click(
        document.querySelector('[data-slot="book-card-action-retry"]') as HTMLButtonElement,
      )
    })
    const errorPanel = await waitFor(() => {
      const node = document.querySelector('[data-slot="retry-button-last-error"]')
      if (!node) throw new Error('error panel not found')
      return node
    })
    expect(errorPanel.textContent).toBe('Falha ao processar capítulos.')
  })

  it('falls back to a placeholder message when no error is provided', async () => {
    render(
      <Wrap client={makeClient()}>
        <RetryButton bookId="book-1" lastError={null} />
      </Wrap>,
    )
    await act(async () => {
      fireEvent.click(
        document.querySelector('[data-slot="book-card-action-retry"]') as HTMLButtonElement,
      )
    })
    const errorPanel = await waitFor(() => {
      const node = document.querySelector('[data-slot="retry-button-last-error"]')
      if (!node) throw new Error('error panel not found')
      return node
    })
    expect(errorPanel.textContent).toBe(_internals.NO_ERROR_FALLBACK)
  })

  it('confirm calls retryIngestion with the book id and an idempotency key', async () => {
    mockedRetry.mockResolvedValueOnce({ jobId: 'job-1', resumingStage: 'download' })
    render(
      <Wrap client={makeClient()}>
        <RetryButton bookId="book-2" lastError="boom" />
      </Wrap>,
    )
    await act(async () => {
      fireEvent.click(
        document.querySelector('[data-slot="book-card-action-retry"]') as HTMLButtonElement,
      )
    })
    const confirm = await waitFor(() => {
      const node = document.querySelector(
        '[data-slot="retry-button-dialog-confirm"]',
      ) as HTMLButtonElement | null
      if (!node) throw new Error('confirm not found')
      return node
    })
    await act(async () => {
      fireEvent.click(confirm)
    })
    await waitFor(() => {
      expect(mockedRetry).toHaveBeenCalledTimes(1)
    })
    expect(mockedRetry.mock.calls[0]?.[0]).toBe('book-2')
    expect(mockedRetry.mock.calls[0]?.[1]).toEqual(expect.any(String))
  })

  it('cancel does not call retryIngestion', async () => {
    render(
      <Wrap client={makeClient()}>
        <RetryButton bookId="book-3" lastError="boom" />
      </Wrap>,
    )
    await act(async () => {
      fireEvent.click(
        document.querySelector('[data-slot="book-card-action-retry"]') as HTMLButtonElement,
      )
    })
    const cancel = await waitFor(() => {
      const node = document.querySelector(
        '[data-slot="retry-button-dialog-cancel"]',
      ) as HTMLButtonElement | null
      if (!node) throw new Error('cancel not found')
      return node
    })
    await act(async () => {
      fireEvent.click(cancel)
    })
    expect(mockedRetry).not.toHaveBeenCalled()
  })

  it('on retry error: shows toast and keeps the dialog open', async () => {
    mockedRetry.mockRejectedValueOnce(new Error('boom'))
    render(
      <Wrap client={makeClient()}>
        <RetryButton bookId="book-4" lastError="boom" />
      </Wrap>,
    )
    await act(async () => {
      fireEvent.click(
        document.querySelector('[data-slot="book-card-action-retry"]') as HTMLButtonElement,
      )
    })
    const confirm = await waitFor(() => {
      const node = document.querySelector(
        '[data-slot="retry-button-dialog-confirm"]',
      ) as HTMLButtonElement | null
      if (!node) throw new Error('confirm not found')
      return node
    })
    await act(async () => {
      fireEvent.click(confirm)
    })
    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalled()
    })
    expect(document.querySelector('[data-slot="retry-button-dialog"]')).not.toBeNull()
  })
})
