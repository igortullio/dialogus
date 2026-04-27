import { act, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSpoilerCapsForThread,
  readAllSpoilerCaps,
  useSpoilerCap,
} from '../../src/lib/spoiler-cap'

const KEY_T1_B1 = 'dialogus:spoiler_cap:t1:b1'
const KEY_T1_B2 = 'dialogus:spoiler_cap:t1:b2'
const KEY_T2_B1 = 'dialogus:spoiler_cap:t2:b1'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('useSpoilerCap', () => {
  it('initial render exposes isLoaded:false, cap:null before useEffect hydrates', async () => {
    window.localStorage.setItem(KEY_T1_B1, '5')
    const seen: Array<{ isLoaded: boolean; cap: number | null }> = []

    function Probe() {
      const r = useSpoilerCap('t1', 'b1')
      seen.push({ isLoaded: r.isLoaded, cap: r.cap })
      return null
    }

    const { unmount } = render(<Probe />)
    await waitFor(() => expect(seen[seen.length - 1]?.isLoaded).toBe(true))
    expect(seen[0]).toEqual({ isLoaded: false, cap: null })
    expect(seen[seen.length - 1]).toEqual({ isLoaded: true, cap: 5 })
    unmount()
  })

  it('hydrates from localStorage on mount when the key is present', async () => {
    window.localStorage.setItem(KEY_T1_B1, '5')
    const { result } = renderHook(() => useSpoilerCap('t1', 'b1'))
    await waitFor(() => expect(result.current.isLoaded).toBe(true))
    expect(result.current.cap).toBe(5)
  })

  it('returns cap:null when the key is absent', async () => {
    const { result } = renderHook(() => useSpoilerCap('t1', 'b1'))
    await waitFor(() => expect(result.current.isLoaded).toBe(true))
    expect(result.current.cap).toBeNull()
  })

  it('setCap(10) writes "10" to localStorage and updates state synchronously', async () => {
    const { result } = renderHook(() => useSpoilerCap('t1', 'b1'))
    await waitFor(() => expect(result.current.isLoaded).toBe(true))

    act(() => result.current.setCap(10))

    expect(window.localStorage.getItem(KEY_T1_B1)).toBe('10')
    expect(result.current.cap).toBe(10)
  })

  it('setCap(null) removes the localStorage key (does not store the string "null")', async () => {
    window.localStorage.setItem(KEY_T1_B1, '5')
    const { result } = renderHook(() => useSpoilerCap('t1', 'b1'))
    await waitFor(() => expect(result.current.cap).toBe(5))

    act(() => result.current.setCap(null))

    expect(window.localStorage.getItem(KEY_T1_B1)).toBeNull()
    expect(window.localStorage.getItem(KEY_T1_B1)).not.toBe('null')
    expect(result.current.cap).toBeNull()
  })

  it('re-hydrates when the threadId or bookId changes', async () => {
    window.localStorage.setItem(KEY_T1_B1, '3')
    window.localStorage.setItem(KEY_T2_B1, '9')
    const { result, rerender } = renderHook(
      ({ threadId }: { threadId: string }) => useSpoilerCap(threadId, 'b1'),
      { initialProps: { threadId: 't1' } },
    )
    await waitFor(() => expect(result.current.cap).toBe(3))

    rerender({ threadId: 't2' })
    await waitFor(() => expect(result.current.cap).toBe(9))
  })

  it('ignores non-integer localStorage values', async () => {
    window.localStorage.setItem(KEY_T1_B1, 'abc')
    const { result } = renderHook(() => useSpoilerCap('t1', 'b1'))
    await waitFor(() => expect(result.current.isLoaded).toBe(true))
    expect(result.current.cap).toBeNull()
  })
})

describe('readAllSpoilerCaps', () => {
  it('returns the bookId → cap map for all keys belonging to the thread', () => {
    window.localStorage.setItem(KEY_T1_B1, '5')
    window.localStorage.setItem(KEY_T1_B2, '10')
    window.localStorage.setItem(KEY_T2_B1, '7')
    expect(readAllSpoilerCaps('t1')).toEqual({ b1: 5, b2: 10 })
  })

  it('returns an empty object when no keys match the thread', () => {
    window.localStorage.setItem(KEY_T2_B1, '7')
    expect(readAllSpoilerCaps('t1')).toEqual({})
  })

  it('skips entries whose stored value is not an integer', () => {
    window.localStorage.setItem(KEY_T1_B1, 'oops')
    window.localStorage.setItem(KEY_T1_B2, '4')
    expect(readAllSpoilerCaps('t1')).toEqual({ b2: 4 })
  })
})

describe('clearSpoilerCapsForThread', () => {
  it('removes only the keys for the given thread', () => {
    window.localStorage.setItem(KEY_T1_B1, '5')
    window.localStorage.setItem(KEY_T1_B2, '10')
    window.localStorage.setItem(KEY_T2_B1, '7')
    window.localStorage.setItem('dialogus:spoiler_cap:t10:b1', '99')

    clearSpoilerCapsForThread('t1')

    expect(window.localStorage.getItem(KEY_T1_B1)).toBeNull()
    expect(window.localStorage.getItem(KEY_T1_B2)).toBeNull()
    expect(window.localStorage.getItem(KEY_T2_B1)).toBe('7')
    expect(window.localStorage.getItem('dialogus:spoiler_cap:t10:b1')).toBe('99')
  })

  it('is a no-op when the thread has no entries', () => {
    window.localStorage.setItem(KEY_T2_B1, '7')
    clearSpoilerCapsForThread('t1')
    expect(window.localStorage.getItem(KEY_T2_B1)).toBe('7')
  })
})
