import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/api/threads', () => ({
  listThreads: vi.fn(),
}))

vi.mock('../../src/app/_components/DialogusLanding', () => ({
  DialogusLanding: () => <div data-testid="dialogus-landing-mock" />,
}))

vi.mock('../../src/lib/health', () => ({
  fetchHealth: vi.fn(),
}))

vi.mock('../../src/lib/library', () => ({
  fetchLibraryCount: vi.fn(),
  fetchLibraryCountByStatus: vi.fn(),
}))

vi.mock('../../src/lib/auth-session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

const { listThreads } = await import('../../src/lib/api/threads')
const { fetchHealth } = await import('../../src/lib/health')
const { fetchLibraryCount, fetchLibraryCountByStatus } = await import('../../src/lib/library')
const { getServerSession } = await import('../../src/lib/auth-session')
const { redirect } = await import('next/navigation')
const { default: Page } = await import('../../src/app/page')

const mockedListThreads = vi.mocked(listThreads)
const mockedFetchHealth = vi.mocked(fetchHealth)
const mockedFetchLibraryCount = vi.mocked(fetchLibraryCount)
const mockedFetchLibraryCountByStatus = vi.mocked(fetchLibraryCountByStatus)
const mockedGetServerSession = vi.mocked(getServerSession)
const mockedRedirect = vi.mocked(redirect)

const HEALTH_UP = { api: 'up', db: 'up', pgboss: 'up', mastra: 'up' } as const

beforeEach(() => {
  mockedListThreads.mockReset()
  mockedListThreads.mockResolvedValue([])
  mockedFetchHealth.mockReset()
  mockedFetchHealth.mockResolvedValue(HEALTH_UP)
  mockedFetchLibraryCount.mockReset()
  mockedFetchLibraryCount.mockResolvedValue(0)
  mockedFetchLibraryCountByStatus.mockReset()
  mockedFetchLibraryCountByStatus.mockResolvedValue({ ready: 0, total: 0 })
  mockedGetServerSession.mockReset()
  mockedGetServerSession.mockResolvedValue({
    user: { id: 'u1', email: 'owner@dialogus.test', name: 'Owner', role: 'admin' },
  })
  mockedRedirect.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apps/web landing Page (Server Component shell)', () => {
  it('is an async function (Server Component)', () => {
    expect(Page.constructor.name).toBe('AsyncFunction')
  })

  it('does not declare a "use client" directive', () => {
    const source = readFileSync(join(__dirname, '../../src/app/page.tsx'), 'utf8')
    expect(source).not.toMatch(/['"]use client['"]/)
  })

  it('redirects to /sign-in when there is no authenticated session (FR-001)', async () => {
    mockedGetServerSession.mockResolvedValueOnce(null)
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockedRedirect).toHaveBeenCalledWith('/sign-in')
    expect(mockedListThreads).not.toHaveBeenCalled()
  })

  it('renders without throwing and prefetches the threads query', async () => {
    const tree = await Page()
    expect(tree).toBeTruthy()
    expect(mockedListThreads).toHaveBeenCalledTimes(1)
  })

  it('still renders when the prefetch rejects (TanStack swallows errors)', async () => {
    mockedListThreads.mockRejectedValueOnce(new Error('boom'))
    const tree = await Page()
    expect(tree).toBeTruthy()
  })

  it('wraps DialogusLanding in HydrationBoundary', async () => {
    const tree = await Page()
    expect(tree).toBeTruthy()
    const props = (tree as unknown as { props: { state?: unknown; children?: unknown } }).props
    expect(props.state).toBeDefined()
    expect(props.children).toBeDefined()
  })

  it('fetches health and library count in parallel before rendering', async () => {
    await Page()
    expect(mockedFetchHealth).toHaveBeenCalledTimes(1)
    expect(mockedFetchLibraryCountByStatus).toHaveBeenCalledTimes(1)
  })

  it('renders "livros: 3 (prontos: 3)" in the status line when 3 books are ready', async () => {
    mockedFetchLibraryCountByStatus.mockResolvedValueOnce({ ready: 3, total: 3 })
    const tree = await Page()
    expect(JSON.stringify(tree)).toContain('livros: 3 (prontos: 3)')
  })

  it('renders "livros: 0" in the status line when library count fetch returns 0 ready', async () => {
    mockedFetchLibraryCountByStatus.mockResolvedValueOnce({ ready: 0, total: 0 })
    const tree = await Page()
    expect(JSON.stringify(tree)).toContain('livros: 0')
  })
})
