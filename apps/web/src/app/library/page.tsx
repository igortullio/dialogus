import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { type FetchLibraryResult, fetchLibrary } from '@/lib/api/library'
import { LIBRARY_QUERY_KEY, LibraryGrid } from './LibraryGrid'

export default async function LibraryPage() {
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => fetchLibrary(),
  })
  const initialData = queryClient.getQueryData<FetchLibraryResult>(LIBRARY_QUERY_KEY)
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LibraryGrid initialData={initialData} />
    </HydrationBoundary>
  )
}
