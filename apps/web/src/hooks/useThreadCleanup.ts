'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Thread } from '@/lib/api/_schemas'
import { deleteThread } from '@/lib/api/threads'
import { clearSpoilerCapsForThread } from '@/lib/spoiler-cap'

const ROLLBACK_TOAST_MESSAGE = 'Não foi possível excluir a conversa.'

export const THREADS_QUERY_KEY = ['threads'] as const

interface DeleteContext {
  readonly previous: Thread[] | undefined
}

export interface UseThreadCleanupResult {
  readonly isDeleting: boolean
  delete(): Promise<void>
}

export function useThreadCleanup(threadId: string): UseThreadCleanupResult {
  const queryClient = useQueryClient()

  const mutation = useMutation<void, Error, void, DeleteContext>({
    mutationFn: () => deleteThread(threadId),
    onMutate: async () => {
      clearSpoilerCapsForThread(threadId)
      await queryClient.cancelQueries({ queryKey: THREADS_QUERY_KEY })
      const previous = queryClient.getQueryData<Thread[]>(THREADS_QUERY_KEY)
      if (previous !== undefined) {
        queryClient.setQueryData<Thread[]>(
          THREADS_QUERY_KEY,
          previous.filter((thread) => thread.id !== threadId),
        )
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(THREADS_QUERY_KEY, context.previous)
      }
      toast.error(ROLLBACK_TOAST_MESSAGE)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEY })
    },
  })

  async function runDelete(): Promise<void> {
    try {
      await mutation.mutateAsync()
    } catch {
      // surfaced via toast in onError
    }
  }

  return {
    isDeleting: mutation.isPending,
    delete: runDelete,
  }
}
