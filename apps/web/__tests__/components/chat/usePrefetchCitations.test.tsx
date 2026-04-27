import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chunkQueryKey,
  usePrefetchCitations,
} from '../../../src/components/chat/usePrefetchCitations'
import { makeTestQueryClient, QueryWrapper } from './_helpers'

const UUID_1 = '01234567-89ab-cdef-0123-456789abcdef'
const UUID_2 = 'abcdef01-2345-6789-abcd-ef0123456789'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const id = String(url).split('/').pop() ?? ''
      return new Response(
        JSON.stringify({
          data: {
            id,
            book_id: '00000000-0000-0000-0000-000000000000',
            chunk_index: 0,
            content: 'sample',
            char_count: 6,
            chapter_title: null,
            chapter_ordinal: null,
            chunking_method: 'paragraph',
            metadata: {},
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }),
  )
})

function wrapperFactory() {
  const client = makeTestQueryClient()
  const spy = vi.spyOn(client, 'prefetchQuery')
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryWrapper client={client}>{children}</QueryWrapper>
  }
  return { client, spy, wrapper }
}

describe('chunkQueryKey', () => {
  it('returns the [chunk, id] tuple', () => {
    expect(chunkQueryKey(UUID_1)).toEqual(['chunk', UUID_1])
  })
})

describe('usePrefetchCitations', () => {
  it('does not prefetch when disabled', () => {
    const { spy, wrapper } = wrapperFactory()
    renderHook(() => usePrefetchCitations({ chunkIds: [UUID_1, UUID_2], enabled: false }), {
      wrapper,
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not prefetch when chunkIds is empty', () => {
    const { spy, wrapper } = wrapperFactory()
    renderHook(() => usePrefetchCitations({ chunkIds: [], enabled: true }), { wrapper })
    expect(spy).not.toHaveBeenCalled()
  })

  it('prefetches once per unique chunk id', () => {
    const { spy, wrapper } = wrapperFactory()
    renderHook(() => usePrefetchCitations({ chunkIds: [UUID_1, UUID_2, UUID_1], enabled: true }), {
      wrapper,
    })
    expect(spy).toHaveBeenCalledTimes(2)
    const calledKeys = spy.mock.calls.map((call) => call[0].queryKey)
    expect(calledKeys).toEqual(
      expect.arrayContaining([chunkQueryKey(UUID_1), chunkQueryKey(UUID_2)]),
    )
  })

  it('does not re-prefetch when re-rendered with the same chunk set', () => {
    const { spy, wrapper } = wrapperFactory()
    const { rerender } = renderHook(
      (props: { ids: string[]; on: boolean }) =>
        usePrefetchCitations({ chunkIds: props.ids, enabled: props.on }),
      { wrapper, initialProps: { ids: [UUID_1, UUID_2], on: true } },
    )
    expect(spy).toHaveBeenCalledTimes(2)
    rerender({ ids: [UUID_2, UUID_1], on: true })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('triggers a fresh wave when enabled flips false → true', () => {
    const { spy, wrapper } = wrapperFactory()
    const { rerender } = renderHook(
      (props: { ids: string[]; on: boolean }) =>
        usePrefetchCitations({ chunkIds: props.ids, enabled: props.on }),
      { wrapper, initialProps: { ids: [UUID_1], on: false } },
    )
    expect(spy).not.toHaveBeenCalled()
    rerender({ ids: [UUID_1], on: true })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
