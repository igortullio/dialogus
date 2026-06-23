'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSpoilerCaps, updateSpoilerCap } from './api/preferences'
import { BOOK_PREFERENCE_QUERY_KEY } from './query-keys'

export interface UseSpoilerCapResult {
  readonly cap: number | null
  readonly isLoaded: boolean
  setCap(value: number | null): void
}

interface SetCapContext {
  readonly previous: number | null | undefined
}

/**
 * Account-scoped, per-book spoiler cap backed by the preferences API
 * (`user_book_preferences`). The cap follows the user across threads and devices
 * (FR-008/FR-009/SC-008) — there is no `threadId` anymore. `cap === null` means
 * no cap. Writes are optimistic so the chip badge stays responsive.
 */
export function useSpoilerCap(bookId: string): UseSpoilerCapResult {
  const queryClient = useQueryClient()
  const queryKey = BOOK_PREFERENCE_QUERY_KEY(bookId)

  const query = useQuery<number | null>({
    queryKey,
    queryFn: async () => {
      const caps = await fetchSpoilerCaps([bookId])
      return caps[bookId] ?? null
    },
  })

  const mutation = useMutation<number | null, Error, number | null, SetCapContext>({
    mutationFn: (value) => updateSpoilerCap(bookId, value),
    onMutate: (value) => {
      const previous = queryClient.getQueryData<number | null>(queryKey)
      queryClient.setQueryData<number | null>(queryKey, value)
      return { previous }
    },
    onError: (_error, _value, context) => {
      if (context) queryClient.setQueryData<number | null>(queryKey, context.previous ?? null)
    },
    onSuccess: (value) => {
      queryClient.setQueryData<number | null>(queryKey, value)
    },
  })

  return {
    cap: query.data ?? null,
    isLoaded: query.isFetched,
    setCap: (value) => mutation.mutate(value),
  }
}
