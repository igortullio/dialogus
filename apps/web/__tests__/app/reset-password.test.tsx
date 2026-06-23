import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const replace = vi.fn()
let searchParams = new URLSearchParams('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}))

vi.mock('../../src/lib/auth-client', () => ({
  authClient: {
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
  },
}))

import { ResetPasswordForm } from '../../src/app/(auth)/reset-password/ResetPasswordForm'
import { authClient } from '../../src/lib/auth-client'

const requestPasswordReset = vi.mocked(authClient.requestPasswordReset)
const resetPassword = vi.mocked(authClient.resetPassword)

beforeEach(() => {
  replace.mockReset()
  searchParams = new URLSearchParams('')
  requestPasswordReset.mockReset()
  resetPassword.mockReset()
})

afterEach(() => cleanup())

describe('ResetPasswordForm — request mode (no token)', () => {
  it('requests a reset link for the entered email and confirms', async () => {
    requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null } as never)

    render(<ResetPasswordForm />)

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'me@test.local' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    await waitFor(() =>
      expect(requestPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'me@test.local' }),
      ),
    )
    // The redirectTo points back at the reset-password page.
    expect(requestPasswordReset.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') }),
    )
    expect(await screen.findByText(/enviamos um link/i)).toBeTruthy()
  })
})

describe('ResetPasswordForm — confirm mode (token present)', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams('token=valid-token')
  })

  it('sets the new password and redirects to sign-in', async () => {
    resetPassword.mockResolvedValue({ data: { status: true }, error: null } as never)

    render(<ResetPasswordForm />)

    fireEvent.change(screen.getByLabelText(/nova senha/i), {
      target: { value: 'BrandNewPass123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /redefinir/i }))

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith({
        token: 'valid-token',
        newPassword: 'BrandNewPass123!',
      }),
    )
    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringContaining('/sign-in')))
  })

  it('rejects a too-short password before calling the API', async () => {
    render(<ResetPasswordForm />)

    fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /redefinir/i }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('shows an error when the reset call fails', async () => {
    resetPassword.mockResolvedValue({ data: null, error: { message: 'invalid' } } as never)

    render(<ResetPasswordForm />)

    fireEvent.change(screen.getByLabelText(/nova senha/i), {
      target: { value: 'BrandNewPass123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /redefinir/i }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('ResetPasswordForm — invalid token', () => {
  it('shows an invalid-link state when redirected with ?error=INVALID_TOKEN', async () => {
    searchParams = new URLSearchParams('error=INVALID_TOKEN')

    render(<ResetPasswordForm />)

    expect(await screen.findByText('Link inválido')).toBeTruthy()
    expect(screen.getByRole('button', { name: /solicitar novo link/i })).toBeTruthy()
  })
})
