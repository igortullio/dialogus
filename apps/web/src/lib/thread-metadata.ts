'use client'

import type { ThreadMetadata, ThreadMetadataUpdate } from '@dialogus/shared/schemas/thread'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchThreadMetadata, updateThreadMetadata } from './api/threads'

export interface UseThreadMetadataResult {
  readonly data: ThreadMetadata
  readonly isLoading: boolean
  mutateRename(newTitle: string): Promise<void>
  mutatePin(pinned: boolean): Promise<void>
}

const DEFAULT_METADATA: ThreadMetadata = { custom_title: null, pinned: false }
const ROLLBACK_TOAST_MESSAGE = 'Não foi possível atualizar os detalhes da conversa.'

export function threadMetadataQueryKey(threadId: string): readonly [string, string] {
  return ['thread-metadata', threadId] as const
}

interface MutationContext {
  readonly previous: ThreadMetadata | undefined
}

export function useThreadMetadata(threadId: string): UseThreadMetadataResult {
  const queryClient = useQueryClient()
  const queryKey = threadMetadataQueryKey(threadId)

  const query = useQuery<ThreadMetadata>({
    queryKey,
    queryFn: () => fetchThreadMetadata(threadId),
    enabled: threadId.length > 0,
  })

  const mutation = useMutation<ThreadMetadata, Error, ThreadMetadataUpdate, MutationContext>({
    mutationFn: (partial) => updateThreadMetadata(threadId, partial),
    onMutate: async (partial) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<ThreadMetadata>(queryKey)
      const base = previous ?? DEFAULT_METADATA
      const next: ThreadMetadata = { ...base, ...partial }
      queryClient.setQueryData(queryKey, next)
      return { previous }
    },
    onError: (_error, _variables, context) => {
      const rollback = context?.previous
      if (rollback === undefined) queryClient.removeQueries({ queryKey })
      else queryClient.setQueryData(queryKey, rollback)
      toast.error(ROLLBACK_TOAST_MESSAGE)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  async function runMutation(partial: ThreadMetadataUpdate): Promise<void> {
    try {
      await mutation.mutateAsync(partial)
    } catch {
      // Errors are already surfaced through the toast in onError; the caller
      // does not need to handle the rejection.
    }
  }

  return {
    data: query.data ?? DEFAULT_METADATA,
    isLoading: query.isLoading,
    mutateRename: (newTitle) => runMutation({ custom_title: newTitle }),
    mutatePin: (pinned) => runMutation({ pinned }),
  }
}
