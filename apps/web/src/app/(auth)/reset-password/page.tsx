import { Suspense } from 'react'
import { ResetPasswordForm } from './ResetPasswordForm'

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}
