import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const replace = vi.fn()
let searchParams = new URLSearchParams('invitation=tok-123')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}))

vi.mock('../../src/lib/api/invitations', () => ({
  fetchInvitationInfo: vi.fn(),
  acceptInvitation: vi.fn(),
}))

vi.mock('../../src/lib/auth-client', () => ({
  authClient: { signIn: { email: vi.fn() } },
}))

import { AcceptInviteForm } from '../../src/app/(auth)/accept-invite/AcceptInviteForm'
import { acceptInvitation, fetchInvitationInfo } from '../../src/lib/api/invitations'
import { authClient } from '../../src/lib/auth-client'

const signInEmail = vi.mocked(authClient.signIn.email)

beforeEach(() => {
  replace.mockReset()
  searchParams = new URLSearchParams('invitation=tok-123')
  vi.mocked(fetchInvitationInfo).mockReset()
  vi.mocked(acceptInvitation).mockReset()
  signInEmail.mockReset()
})

afterEach(() => cleanup())

describe('AcceptInviteForm', () => {
  it('shows the invited email once the token resolves', async () => {
    vi.mocked(fetchInvitationInfo).mockResolvedValue({
      email: 'invitee@test.local',
      status: 'pending',
    })

    render(<AcceptInviteForm />)

    expect(await screen.findByText('invitee@test.local')).toBeTruthy()
  })

  it('shows an invalid state for a bad token', async () => {
    vi.mocked(fetchInvitationInfo).mockRejectedValue(new Error('gone'))

    render(<AcceptInviteForm />)

    expect(await screen.findByText(/convite inválido/i)).toBeTruthy()
  })

  it('accepts the invite, signs in, and redirects home', async () => {
    vi.mocked(fetchInvitationInfo).mockResolvedValue({
      email: 'invitee@test.local',
      status: 'pending',
    })
    vi.mocked(acceptInvitation).mockResolvedValue({ userId: 'u1' })
    signInEmail.mockResolvedValue({ error: null } as Awaited<ReturnType<typeof signInEmail>>)

    render(<AcceptInviteForm />)
    await screen.findByText('invitee@test.local')

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Invitee' } })
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'StrongPass123!' } })
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }))

    await waitFor(() =>
      expect(acceptInvitation).toHaveBeenCalledWith({
        invitation: 'tok-123',
        name: 'Invitee',
        password: 'StrongPass123!',
      }),
    )
    await waitFor(() => expect(signInEmail).toHaveBeenCalled())
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
  })

  it('rejects a too-short password before calling the API', async () => {
    vi.mocked(fetchInvitationInfo).mockResolvedValue({
      email: 'invitee@test.local',
      status: 'pending',
    })

    render(<AcceptInviteForm />)
    await screen.findByText('invitee@test.local')

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /criar conta/i }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(acceptInvitation).not.toHaveBeenCalled()
  })
})
