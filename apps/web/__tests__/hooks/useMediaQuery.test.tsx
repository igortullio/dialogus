import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from '../../src/hooks/useMediaQuery'

interface MockMql {
  matches: boolean
  media: string
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  addListener: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  dispatchEvent: ReturnType<typeof vi.fn>
  onchange: null
}

let originalMatchMedia: typeof window.matchMedia | undefined

function installMatchMedia(matches: boolean): MockMql {
  const mql: MockMql = {
    matches,
    media: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((q: string) => {
      mql.media = q
      return mql
    }),
  })
  return mql
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia
})

afterEach(() => {
  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
  }
  vi.restoreAllMocks()
})

describe('useMediaQuery', () => {
  it('returns true when matchMedia matches', () => {
    installMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(true)
  })

  it('returns false when matchMedia does not match', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(false)
  })

  it('subscribes to change events with the change listener', () => {
    const mql = installMatchMedia(false)
    renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('unsubscribes on unmount', () => {
    const mql = installMatchMedia(false)
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    unmount()
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
