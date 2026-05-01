import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { listThreads } from '@/lib/api/threads'
import { fetchHealth } from '@/lib/health'
import { fetchLibraryCountByStatus } from '@/lib/library'
import { THREADS_QUERY_KEY } from '@/lib/query-keys'
import { DialogusLanding } from './_components/DialogusLanding'

export default async function Page() {
  const [health, counts] = await Promise.all([fetchHealth(), fetchLibraryCountByStatus()])
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: THREADS_QUERY_KEY,
    queryFn: listThreads,
  })
  const livrosLabel =
    counts.ready > 0 ? `${counts.total} (prontos: ${counts.ready})` : `${counts.total}`
  const statusLine = `dIAlogus — api: ${health.api} / db: ${health.db} / pgboss: ${health.pgboss} / livros: ${livrosLabel}`
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <span data-testid="dialogus-status" className="sr-only">
        {statusLine}
      </span>
      <DialogusLanding />
    </HydrationBoundary>
  )
}
