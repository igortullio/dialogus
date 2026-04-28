import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { THREADS_QUERY_KEY } from '@/hooks/useThreadCleanup'
import { listThreads } from '@/lib/api/threads'
import { DialogusLanding } from './_components/DialogusLanding'

export default async function Page() {
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: THREADS_QUERY_KEY,
    queryFn: listThreads,
  })
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DialogusLanding />
    </HydrationBoundary>
  )
}
