import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/lib/api/library', () => ({
  fetchLibrary: vi.fn(),
}))

vi.mock('../../../src/app/library/LibraryGrid', () => ({
  LIBRARY_QUERY_KEY: ['library'] as const,
  LibraryGrid: () => <div data-testid="library-grid-mock" />,
}))

const { fetchLibrary } = await import('../../../src/lib/api/library')
const { default: LibraryPage } = await import('../../../src/app/library/page')

const mockedFetchLibrary = vi.mocked(fetchLibrary)

beforeEach(() => {
  mockedFetchLibrary.mockReset()
  mockedFetchLibrary.mockResolvedValue({ books: [], nextCursor: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apps/web /library Page (Server Component shell)', () => {
  it('is an async function (Server Component)', () => {
    expect(LibraryPage.constructor.name).toBe('AsyncFunction')
  })

  it('does not declare a "use client" directive', () => {
    const source = readFileSync(join(__dirname, '../../../src/app/library/page.tsx'), 'utf8')
    expect(source).not.toMatch(/['"]use client['"]/)
  })

  it('prefetches the library query and wraps the grid in HydrationBoundary', async () => {
    const tree = await LibraryPage()
    expect(mockedFetchLibrary).toHaveBeenCalledTimes(1)
    const props = (tree as unknown as { props: { state?: unknown; children?: unknown } }).props
    expect(props.state).toBeDefined()
    expect(props.children).toBeDefined()
  })

  it('still renders when prefetch rejects (TanStack swallows errors)', async () => {
    mockedFetchLibrary.mockRejectedValueOnce(new Error('boom'))
    const tree = await LibraryPage()
    expect(tree).toBeTruthy()
  })

  it('passes initialData from the prefetched cache to LibraryGrid', async () => {
    mockedFetchLibrary.mockResolvedValueOnce({
      books: [],
      nextCursor: 'next-cursor-value',
    })
    const tree = await LibraryPage()
    type ChildProps = { initialData?: { nextCursor: string | null } }
    const props = (tree as unknown as { props: { children: { props: ChildProps } } }).props
    const initialData = props.children.props.initialData
    expect(initialData).toBeDefined()
    expect(initialData?.nextCursor).toBe('next-cursor-value')
  })
})
