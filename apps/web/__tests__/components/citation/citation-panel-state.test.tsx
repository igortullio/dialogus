import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _resetCitationPanelForTests,
  closeCitationPanel,
  closeUnresolvedPanel,
  openCitationPanel,
  openUnresolvedPanel,
  useCitationPanel,
  useUnresolvedPanel,
} from '../../../src/components/citation/citation-panel-state'

afterEach(() => {
  _resetCitationPanelForTests()
})

describe('useCitationPanel', () => {
  it('starts with openChunkId === null', () => {
    const { result } = renderHook(() => useCitationPanel())
    expect(result.current.openChunkId).toBeNull()
  })

  it('open(id) sets the openChunkId for subscribers', () => {
    const { result } = renderHook(() => useCitationPanel())
    act(() => {
      result.current.open('chunk-A')
    })
    expect(result.current.openChunkId).toBe('chunk-A')
  })

  it('opening another chunk replaces the previous one (only one panel at a time)', () => {
    const { result } = renderHook(() => useCitationPanel())
    act(() => {
      result.current.open('chunk-A')
    })
    act(() => {
      result.current.open('chunk-B')
    })
    expect(result.current.openChunkId).toBe('chunk-B')
  })

  it('close() clears the open chunk', () => {
    const { result } = renderHook(() => useCitationPanel())
    act(() => {
      result.current.open('chunk-A')
    })
    act(() => {
      result.current.close()
    })
    expect(result.current.openChunkId).toBeNull()
  })

  it('module-level openCitationPanel/closeCitationPanel match the hook surface', () => {
    const { result } = renderHook(() => useCitationPanel())
    act(() => {
      openCitationPanel('chunk-X')
    })
    expect(result.current.openChunkId).toBe('chunk-X')
    act(() => {
      closeCitationPanel()
    })
    expect(result.current.openChunkId).toBeNull()
  })
})

describe('useUnresolvedPanel', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useUnresolvedPanel())
    expect(result.current.isOpen).toBe(false)
  })

  it('open() flips isOpen to true', () => {
    const { result } = renderHook(() => useUnresolvedPanel())
    act(() => {
      result.current.open()
    })
    expect(result.current.isOpen).toBe(true)
  })

  it('close() flips back to false', () => {
    const { result } = renderHook(() => useUnresolvedPanel())
    act(() => {
      result.current.open()
    })
    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)
  })
})

describe('mutual exclusion between chunk and unresolved panels', () => {
  it('opening unresolved closes any open chunk panel', () => {
    const chunk = renderHook(() => useCitationPanel())
    const unresolved = renderHook(() => useUnresolvedPanel())
    act(() => {
      chunk.result.current.open('chunk-A')
    })
    expect(chunk.result.current.openChunkId).toBe('chunk-A')
    act(() => {
      unresolved.result.current.open()
    })
    expect(unresolved.result.current.isOpen).toBe(true)
    expect(chunk.result.current.openChunkId).toBeNull()
  })

  it('opening a chunk panel closes the unresolved panel', () => {
    const chunk = renderHook(() => useCitationPanel())
    const unresolved = renderHook(() => useUnresolvedPanel())
    act(() => {
      openUnresolvedPanel()
    })
    expect(unresolved.result.current.isOpen).toBe(true)
    act(() => {
      chunk.result.current.open('chunk-Y')
    })
    expect(chunk.result.current.openChunkId).toBe('chunk-Y')
    expect(unresolved.result.current.isOpen).toBe(false)
  })

  it('closeUnresolvedPanel does not affect openChunkId', () => {
    const chunk = renderHook(() => useCitationPanel())
    const unresolved = renderHook(() => useUnresolvedPanel())
    act(() => {
      chunk.result.current.open('chunk-Z')
    })
    act(() => {
      closeUnresolvedPanel()
    })
    expect(chunk.result.current.openChunkId).toBe('chunk-Z')
    expect(unresolved.result.current.isOpen).toBe(false)
  })
})
