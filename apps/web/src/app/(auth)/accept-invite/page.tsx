import { Suspense } from 'react'
import { AcceptInviteForm } from './AcceptInviteForm'

export default function AcceptInvitePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Suspense fallback={null}>
        <AcceptInviteForm />
      </Suspense>
    </main>
  )
}
