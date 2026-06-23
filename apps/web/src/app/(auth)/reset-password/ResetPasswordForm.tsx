'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

const MIN_PASSWORD_LENGTH = 8

/**
 * Account recovery (US4, T052). One page, two modes:
 * - **request** (no token): enter the account email → Better Auth emails a
 *   single-use, time-limited link back to this page (FR-019).
 * - **confirm** (`?token=`): set a new password via `resetPassword`.
 * A consumed/expired link redirects back here with `?error=INVALID_TOKEN`.
 */
export function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')
  const linkError = params.get('error')
  const emailId = useId()
  const passwordId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [requested, setRequested] = useState(false)

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const redirectTo = `${window.location.origin}/reset-password`
    const { error: reqError } = await authClient.requestPasswordReset({ email, redirectTo })
    setPending(false)
    if (reqError) {
      setError('Não foi possível enviar o link. Tente novamente.')
      return
    }
    setRequested(true)
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      return
    }
    setPending(true)
    setError(null)
    const { error: resetError } = await authClient.resetPassword({ token, newPassword: password })
    setPending(false)
    if (resetError) {
      setError('Não foi possível redefinir a senha. O link pode ter expirado.')
      return
    }
    router.replace('/sign-in?reset=success')
  }

  // Consumed/expired link.
  if (linkError) {
    return (
      <Card className="w-full max-w-sm" role="alert">
        <CardHeader>
          <CardTitle>Link inválido</CardTitle>
          <CardDescription>
            Este link de redefinição é inválido ou expirou. Solicite um novo abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => router.replace('/reset-password')}>
            Solicitar novo link
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Confirm mode: set a new password.
  if (token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Definir nova senha</CardTitle>
          <CardDescription>Escolha uma nova senha para sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleConfirm} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <label htmlFor={passwordId} className="text-sm font-medium">
                Nova senha
              </label>
              <Input
                id={passwordId}
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <div role="alert" className="flex flex-col gap-1">
                <p className="text-sm text-destructive">{error}</p>
                <button
                  type="button"
                  className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => router.replace('/reset-password')}
                >
                  Solicitar novo link
                </button>
              </div>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Redefinindo…' : 'Redefinir senha'}
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  // Request mode.
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Recuperar acesso</CardTitle>
        <CardDescription>
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {requested ? (
          <p className="text-sm" role="status" aria-live="polite">
            Se houver uma conta para esse e-mail, enviamos um link de redefinição. Verifique sua
            caixa de entrada.
          </p>
        ) : (
          <form onSubmit={handleRequest} className="flex flex-col gap-4" noValidate>
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
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Enviando…' : 'Enviar link'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
