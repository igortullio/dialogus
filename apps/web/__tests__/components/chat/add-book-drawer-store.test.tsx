import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _resetAddBookDrawerForTests,
  closeAddBookDrawer,
  openAddBookDrawer,
  setAddBookDrawerOpen,
  useAddBookDrawerOpen,
} from '../../../src/components/chat/add-book-drawer-store'

afterEach(() => {
  _resetAddBookDrawerForTests()
})

describe('add-book drawer store', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useAddBookDrawerOpen())
    expect(result.current).toBe(false)
  })

  it('subscribers see updates when openAddBookDrawer fires', () => {
    const { result } = renderHook(() => useAddBookDrawerOpen())
    expect(result.current).toBe(false)
    act(() => {
      openAddBookDrawer()
    })
    expect(result.current).toBe(true)
  })

  it('multiple subscribers react to the same change', () => {
    const a = renderHook(() => useAddBookDrawerOpen())
    const b = renderHook(() => useAddBookDrawerOpen())
    act(() => {
      setAddBookDrawerOpen(true)
    })
    expect(a.result.current).toBe(true)
    expect(b.result.current).toBe(true)
  })

  it('closeAddBookDrawer toggles back', () => {
    const { result } = renderHook(() => useAddBookDrawerOpen())
    act(() => {
      openAddBookDrawer()
    })
    act(() => {
      closeAddBookDrawer()
    })
    expect(result.current).toBe(false)
  })
})
