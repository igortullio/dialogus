import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/api/threads', () => ({
  listThreads: vi.fn(),
}))

vi.mock('../../src/app/_components/DialogusLanding', () => ({
  DialogusLanding: () => <div data-testid="dialogus-landing-mock" />,
}))

const { listThreads } = await import('../../src/lib/api/threads')
const { default: Page } = await import('../../src/app/page')

const mockedListThreads = vi.mocked(listThreads)

beforeEach(() => {
  mockedListThreads.mockReset()
  mockedListThreads.mockResolvedValue([])
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
})
