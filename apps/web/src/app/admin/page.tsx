import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import { buttonVariants } from '@/components/ui/button'
import { getServerSession } from '@/lib/auth-session'

/**
 * Owner/admin console (US3). Gated server-side: unauthenticated → sign-in,
 * non-admins → home. The session is validated by the API (the single authority),
 * so a revoked/demoted admin loses access on their next visit.
 */
export default async function AdminPage() {
  const session = await getServerSession()
  if (!session) redirect('/sign-in')
  if (session.user.role !== 'admin') redirect('/')

  return (
    <main className="mx-auto w-full max-w-3xl p-6 pt-16">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Administração</h1>
        <Link href="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          ← Voltar ao início
        </Link>
      </div>
      <AdminDashboard />
    </main>
  )
}
