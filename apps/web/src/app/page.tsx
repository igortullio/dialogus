import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth-session'
import { fetchHealth } from '@/lib/health'
import { fetchLibraryCountByStatus } from '@/lib/library'
import { DialogusLanding } from './_components/DialogusLanding'

export default async function Page() {
  // Belt-and-suspenders gate alongside the proxy (FR-001): never render the
  // workspace for an unauthenticated request.
  const session = await getServerSession()
  if (!session) redirect('/sign-in')

  const [health, counts] = await Promise.all([fetchHealth(), fetchLibraryCountByStatus()])
  // Threads are loaded client-side through the authenticated proxy (scoped to
  // this user's resourceId), not prefetched on the server — so SSR never
  // hydrates another user's conversations.
  const queryClient = new QueryClient()
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
