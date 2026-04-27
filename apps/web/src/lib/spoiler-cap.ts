'use client'

import { useCallback, useEffect, useState } from 'react'

const KEY_PREFIX = 'dialogus:spoiler_cap'

export interface UseSpoilerCapResult {
  readonly cap: number | null
  readonly isLoaded: boolean
  setCap(value: number | null): void
}

function buildKey(threadId: string, bookId: string): string {
  return `${KEY_PREFIX}:${threadId}:${bookId}`
}

function parseCap(raw: string | null): number | null {
  if (raw === null) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function readCap(key: string): number | null {
  if (typeof window === 'undefined') return null
  try {
    return parseCap(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

function writeCap(key: string, value: number | null): void {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, String(value))
  } catch {
    // localStorage may be unavailable (private mode, quota); silently ignore.
  }
}

function threadKeyPrefix(threadId: string): string {
  return `${KEY_PREFIX}:${threadId}:`
}

function enumerateThreadKeys(threadId: string): string[] {
  if (typeof window === 'undefined') return []
  const prefix = threadKeyPrefix(threadId)
  const keys: string[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(prefix)) keys.push(key)
    }
  } catch {
    return []
  }
  return keys
}

export function useSpoilerCap(threadId: string, bookId: string): UseSpoilerCapResult {
  const [cap, setCapState] = useState<number | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setCapState(readCap(buildKey(threadId, bookId)))
    setIsLoaded(true)
  }, [threadId, bookId])

  const setCap = useCallback(
    (value: number | null) => {
      writeCap(buildKey(threadId, bookId), value)
      setCapState(value)
    },
    [threadId, bookId],
  )

  return { cap, isLoaded, setCap }
}

export function readAllSpoilerCaps(threadId: string): Record<string, number> {
  const prefix = threadKeyPrefix(threadId)
  const out: Record<string, number> = {}
  for (const key of enumerateThreadKeys(threadId)) {
    const bookId = key.slice(prefix.length)
    if (bookId.length === 0) continue
    const value = readCap(key)
    if (value !== null) out[bookId] = value
  }
  return out
}

export function clearSpoilerCapsForThread(threadId: string): void {
  if (typeof window === 'undefined') return
  const keys = enumerateThreadKeys(threadId)
  try {
    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}
