'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { fetchChunkById } from '@/lib/api/chunks'

const CHUNK_QUERY_PREFIX = 'chunk' as const

export function chunkQueryKey(chunkId: string): readonly [typeof CHUNK_QUERY_PREFIX, string] {
  return [CHUNK_QUERY_PREFIX, chunkId]
}

interface UsePrefetchCitationsOptions {
  readonly chunkIds: readonly string[]
  readonly enabled: boolean
}

export function usePrefetchCitations({ chunkIds, enabled }: UsePrefetchCitationsOptions): void {
  const queryClient = useQueryClient()
  const dedupedKey = enabled ? Array.from(new Set(chunkIds)).sort().join(',') : ''
  // dedupedKey changes only when the set of chunks changes; flipping `enabled`
  // off to on with the same chunks triggers exactly one prefetch wave.

  useEffect(() => {
    if (!enabled || dedupedKey.length === 0) return
    const ids = dedupedKey.split(',')
    for (const id of ids) {
      queryClient.prefetchQuery({
        queryKey: chunkQueryKey(id),
        queryFn: () => fetchChunkById(id),
      })
    }
  }, [enabled, dedupedKey, queryClient])
}
