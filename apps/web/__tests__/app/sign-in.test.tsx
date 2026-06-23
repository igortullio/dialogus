import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let searchParams = new URLSearchParams('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => searchParams,
}))

vi.mock('../../src/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: null }),
    signIn: { email: vi.fn() },
  },
}))

import SignInPage from '../../src/app/(auth)/sign-in/page'

beforeEach(() => {
  searchParams = new URLSearchParams('')
})
afterEach(() => cleanup())

describe('sign-in page', () => {
  it('confirms a completed password reset when redirected with ?reset=success', async () => {
    searchParams = new URLSearchParams('reset=success')

    render(<SignInPage />)

    expect(await screen.findByText(/senha redefinida/i)).toBeTruthy()
  })

  it('shows no reset banner on a normal visit', () => {
    render(<SignInPage />)

    expect(screen.queryByText(/senha redefinida/i)).toBeNull()
  })

  it('links to the password-recovery page', () => {
    render(<SignInPage />)

    const link = screen.getByRole('link', { name: /esqueci minha senha/i })
    expect(link.getAttribute('href')).toBe('/reset-password')
  })
})
