import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { THREADS_QUERY_KEY } from '@/hooks/useThreadCleanup'
import { listThreads } from '@/lib/api/threads'
import { fetchHealth } from '@/lib/health'
import { fetchLibraryCount } from '@/lib/library'
import { DialogusLanding } from './_components/DialogusLanding'

export default async function Page() {
  const [health, libraryCount] = await Promise.all([fetchHealth(), fetchLibraryCount()])
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: THREADS_QUERY_KEY,
    queryFn: listThreads,
  })
  const statusLine = `dIAlogus — api: ${health.api} / db: ${health.db} / pgboss: ${health.pgboss} / livros: ${libraryCount}`
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <span data-testid="dialogus-status">{statusLine}</span>
      <DialogusLanding />
    </HydrationBoundary>
  )
}
