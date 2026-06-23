import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InvitationsPanel } from '../../../src/components/admin/InvitationsPanel'
import { makeTestQueryClient, QueryWrapper } from '../chat/_helpers'

vi.mock('../../../src/lib/api/admin', () => ({
  fetchInvitations: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}))

import { createInvitation, fetchInvitations, revokeInvitation } from '../../../src/lib/api/admin'

const PENDING = {
  id: 'inv-1',
  email: 'invitee@test.local',
  status: 'pending' as const,
  invited_by: 'admin-1',
  consumed_by_user_id: null,
  expires_at: '2026-07-01T00:00:00.000Z',
  created_at: '2026-06-20T00:00:00.000Z',
  updated_at: '2026-06-20T00:00:00.000Z',
}

function renderPanel() {
  return render(
    <QueryWrapper client={makeTestQueryClient()}>
      <InvitationsPanel />
    </QueryWrapper>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('InvitationsPanel', () => {
  it('lists existing invitations', async () => {
    vi.mocked(fetchInvitations).mockResolvedValue({ invitations: [PENDING], nextCursor: null })

    renderPanel()

    expect(await screen.findByText('invitee@test.local')).toBeTruthy()
  })

  it('creates an invitation from the email form and refetches', async () => {
    vi.mocked(fetchInvitations)
      .mockResolvedValueOnce({ invitations: [], nextCursor: null })
      .mockResolvedValueOnce({ invitations: [PENDING], nextCursor: null })
    vi.mocked(createInvitation).mockResolvedValue(PENDING)

    renderPanel()
    await screen.findByLabelText(/e-mail/i)

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'invitee@test.local' },
    })
    fireEvent.click(screen.getByRole('button', { name: /convidar/i }))

    await waitFor(() =>
      expect(createInvitation).toHaveBeenCalledWith({ email: 'invitee@test.local' }),
    )
  })

  it('revokes a pending invitation', async () => {
    vi.mocked(fetchInvitations).mockResolvedValue({ invitations: [PENDING], nextCursor: null })
    vi.mocked(revokeInvitation).mockResolvedValue(undefined)

    renderPanel()
    await screen.findByText('invitee@test.local')

    fireEvent.click(screen.getByRole('button', { name: /revogar/i }))

    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith('inv-1'))
  })
})
