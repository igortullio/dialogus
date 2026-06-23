'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { acceptInvitation, fetchInvitationInfo } from '@/lib/api/invitations'
import { authClient } from '@/lib/auth-client'

const MIN_PASSWORD_LENGTH = 8

type Phase = 'loading' | 'ready' | 'invalid'

/**
 * Accept-invite flow (US3, T048). Reads the invitation token from the URL,
 * confirms which email it is for, and lets the invitee set their name + password.
 * On submit it provisions the account (the API consumes the single-use invite)
 * then signs in and lands in the workspace.
 */
export function AcceptInviteForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('invitation')
  const nameId = useId()
  const passwordId = useId()

  const [phase, setPhase] = useState<Phase>('loading')
  const [email, setEmail] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!token) {
      setPhase('invalid')
      return
    }
    let active = true
    fetchInvitationInfo(token)
      .then((info) => {
        if (!active) return
        setEmail(info.email)
        setPhase('ready')
      })
      .catch(() => {
        if (active) setPhase('invalid')
      })
    return () => {
      active = false
    }
  }, [token])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !email) return
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      return
    }
    setPending(true)
    setError(null)
    try {
      await acceptInvitation({ invitation: token, name, password })
      const { error: signInError } = await authClient.signIn.email({ email, password })
      if (signInError) {
        // Account created but auto sign-in failed — send them to sign in manually.
        router.replace('/sign-in')
        return
      }
      router.replace('/')
    } catch {
      setError('Não foi possível aceitar o convite. Ele pode ter expirado ou já ter sido usado.')
      setPending(false)
    }
  }

  if (phase === 'loading') {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Convite</CardTitle>
          <CardDescription>Verificando seu convite…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (phase === 'invalid') {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Convite inválido</CardTitle>
          <CardDescription>Este convite não é válido, expirou ou já foi utilizado.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => router.replace('/sign-in')}>
            Ir para o login
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Criar sua conta</CardTitle>
        <CardDescription>
          Convite para <strong>{email}</strong>. Defina seu nome e senha.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className="text-sm font-medium">
              Nome
            </label>
            <Input
              id={nameId}
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={passwordId} className="text-sm font-medium">
              Senha
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
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Criando conta…' : 'Criar conta e entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
