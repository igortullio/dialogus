import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IngestionMonitor } from '../../../src/components/library/IngestionMonitor'
import { makeTestQueryClient, QueryWrapper } from '../chat/_helpers'

vi.mock('../../../src/lib/api/library', () => ({ fetchLibrary: vi.fn() }))
vi.mock('../../../src/lib/auth-client', () => ({ authClient: { useSession: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { fetchLibrary } from '../../../src/lib/api/library'
import { authClient } from '../../../src/lib/auth-client'

const useSession = vi.mocked(authClient.useSession)

function renderMonitor() {
  return render(
    <QueryWrapper client={makeTestQueryClient()}>
      <IngestionMonitor />
    </QueryWrapper>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchLibrary).mockResolvedValue({ books: [], nextCursor: null })
})
afterEach(() => cleanup())

describe('IngestionMonitor session gate', () => {
  it('does NOT poll the library when unauthenticated (no 401 loop on /sign-in)', async () => {
    useSession.mockReturnValue({ data: null } as never)

    renderMonitor()

    // Give React Query a few ticks; the disabled query must never fetch.
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchLibrary).not.toHaveBeenCalled()
  })

  it('polls the library once a session exists', async () => {
    useSession.mockReturnValue({ data: { user: { id: 'u1' } } } as never)

    renderMonitor()

    await waitFor(() => expect(fetchLibrary).toHaveBeenCalled())
  })
})
