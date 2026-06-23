'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = params.get('redirect') || '/'
  const resetDone = params.get('reset') === 'success'
  const { data: session } = authClient.useSession()
  const emailId = useId()
  const passwordId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Already signed in → leave the sign-in page.
  useEffect(() => {
    if (session) router.replace(redirectTo)
  }, [session, redirectTo, router])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const { error: signInError } = await authClient.signIn.email({ email, password })
    setPending(false)
    if (signInError) {
      setError('E-mail ou senha inválidos.')
      return
    }
    router.replace(redirectTo)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Entrar no dIAlogus</CardTitle>
        <CardDescription>Acesse seu espaço de leitura e conversas.</CardDescription>
      </CardHeader>
      <CardContent>
        {resetDone ? (
          <p className="mb-4 text-sm text-muted-foreground" role="status">
            Senha redefinida. Faça login com sua nova senha.
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor={emailId} className="text-sm font-medium">
              E-mail
            </label>
            <Input
              id={emailId}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={passwordId} className="text-sm font-medium">
              Senha
            </label>
            <Input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Entrando…' : 'Entrar'}
          </Button>
          <Link
            href="/reset-password"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Esqueci minha senha
          </Link>
        </form>
      </CardContent>
    </Card>
  )
}

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </main>
  )
}
