import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountMenu } from '../../../src/components/auth/AccountMenu'
import { makeTestQueryClient, QueryWrapper } from '../chat/_helpers'

vi.mock('../../../src/lib/auth-client', () => ({
  authClient: { useSession: vi.fn(), signOut: vi.fn() },
}))

import { authClient } from '../../../src/lib/auth-client'

const useSession = vi.mocked(authClient.useSession)

function renderMenu() {
  return render(
    <QueryWrapper client={makeTestQueryClient()}>
      <AccountMenu />
    </QueryWrapper>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('AccountMenu', () => {
  it('renders nothing when unauthenticated', () => {
    useSession.mockReturnValue({ data: null } as never)

    renderMenu()

    expect(screen.queryByTestId('account-email')).toBeNull()
  })

  it('shows the email + Admin link for an admin (after client mount)', async () => {
    useSession.mockReturnValue({
      data: { user: { id: 'u1', email: 'owner@test.local', role: 'admin' } },
    } as never)

    renderMenu()

    // Mounted guard: appears after the client mount effect runs.
    expect((await screen.findByTestId('account-email')).textContent).toBe('owner@test.local')
    const adminLink = screen.getByRole('link', { name: /admin/i })
    expect(adminLink.getAttribute('href')).toBe('/admin')
    expect(screen.getByRole('button', { name: /sair/i })).toBeTruthy()
  })

  it('hides the Admin link for a non-admin member', async () => {
    useSession.mockReturnValue({
      data: { user: { id: 'u2', email: 'member@test.local', role: 'member' } },
    } as never)

    renderMenu()

    await waitFor(() => expect(screen.getByTestId('account-email')).toBeTruthy())
    expect(screen.queryByRole('link', { name: /admin/i })).toBeNull()
  })
})
