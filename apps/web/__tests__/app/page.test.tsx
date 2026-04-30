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

const { listThreads } = await import('../../src/lib/api/threads')
const { fetchHealth } = await import('../../src/lib/health')
const { fetchLibraryCount } = await import('../../src/lib/library')
const { default: Page } = await import('../../src/app/page')

const mockedListThreads = vi.mocked(listThreads)
const mockedFetchHealth = vi.mocked(fetchHealth)
const mockedFetchLibraryCount = vi.mocked(fetchLibraryCount)

const HEALTH_UP = { api: 'up', db: 'up', pgboss: 'up', mastra: 'up' } as const

beforeEach(() => {
  mockedListThreads.mockReset()
  mockedListThreads.mockResolvedValue([])
  mockedFetchHealth.mockReset()
  mockedFetchHealth.mockResolvedValue(HEALTH_UP)
  mockedFetchLibraryCount.mockReset()
  mockedFetchLibraryCount.mockResolvedValue(0)
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
    expect(mockedFetchLibraryCount).toHaveBeenCalledTimes(1)
  })

  it('renders "livros: 3" in the status line when count is 3', async () => {
    mockedFetchLibraryCount.mockResolvedValueOnce(3)
    const tree = await Page()
    expect(JSON.stringify(tree)).toContain('livros: 3')
  })

  it('renders "livros: 0" in the status line when library count fetch fails (returns 0)', async () => {
    mockedFetchLibraryCount.mockResolvedValueOnce(0)
    const tree = await Page()
    expect(JSON.stringify(tree)).toContain('livros: 0')
  })
})
