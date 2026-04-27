import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/health', () => ({
  fetchHealth: vi.fn(),
}))
vi.mock('../../src/lib/library', () => ({
  fetchLibraryCountByStatus: vi.fn(),
}))

const { fetchHealth } = await import('../../src/lib/health')
const { fetchLibraryCountByStatus } = await import('../../src/lib/library')
const { default: Page } = await import('../../src/app/page')
const mockedFetchHealth = vi.mocked(fetchHealth)
const mockedFetchLibraryCountByStatus = vi.mocked(fetchLibraryCountByStatus)

describe('apps/web landing Page', () => {
  beforeEach(() => {
    mockedFetchHealth.mockReset()
    mockedFetchLibraryCountByStatus.mockReset()
  })

  it('renders the dIAlogus heading and the all-up status line when every probe is up', async () => {
    mockedFetchHealth.mockResolvedValueOnce({ api: 'up', db: 'up', pgboss: 'up', mastra: 'up' })
    mockedFetchLibraryCountByStatus.mockResolvedValueOnce({ total: 3, ready: 2 })

    const tree = await Page()
    const { container } = render(tree)

    const heading = container.querySelector('h1')
    expect(heading).not.toBeNull()
    expect(heading?.textContent).toBe('dIAlogus')
    expect(container.textContent).toContain('api: up')
    expect(container.textContent).toContain('db: up')
    expect(container.textContent).toContain('pgboss: up')
    expect(container.textContent).toContain('mastra: up')
    expect(container.textContent).toContain('livros: 3 (prontos: 2)')
  })

  it('renders mastra: down when the mastra probe reports down', async () => {
    mockedFetchHealth.mockResolvedValueOnce({ api: 'up', db: 'up', pgboss: 'up', mastra: 'down' })
    mockedFetchLibraryCountByStatus.mockResolvedValueOnce({ total: 0, ready: 0 })

    const tree = await Page()
    const { container } = render(tree)

    expect(container.textContent).toContain('mastra: down')
  })

  it('renders db: down when the db probe reports down', async () => {
    mockedFetchHealth.mockResolvedValueOnce({ api: 'up', db: 'down', pgboss: 'up', mastra: 'up' })
    mockedFetchLibraryCountByStatus.mockResolvedValueOnce({ total: 1, ready: 0 })

    const tree = await Page()
    const { container } = render(tree)

    expect(container.textContent).toContain('db: down')
  })

  it('renders pgboss: down when the pg-boss probe reports down', async () => {
    mockedFetchHealth.mockResolvedValueOnce({ api: 'up', db: 'up', pgboss: 'down', mastra: 'up' })
    mockedFetchLibraryCountByStatus.mockResolvedValueOnce({ total: 0, ready: 0 })

    const tree = await Page()
    const { container } = render(tree)

    expect(container.textContent).toContain('pgboss: down')
  })

  it('renders "livros: 0 (prontos: 0)" when the library count fetch falls back', async () => {
    mockedFetchHealth.mockResolvedValueOnce({
      api: 'up',
      db: 'down',
      pgboss: 'down',
      mastra: 'down',
    })
    mockedFetchLibraryCountByStatus.mockResolvedValueOnce({ total: 0, ready: 0 })

    const tree = await Page()
    const { container } = render(tree)

    expect(container.textContent).toContain('livros: 0 (prontos: 0)')
  })

  it('is an async function (Server Component) that calls fetchHealth and fetchLibraryCountByStatus at render time', async () => {
    expect(Page.constructor.name).toBe('AsyncFunction')

    mockedFetchHealth.mockResolvedValueOnce({ api: 'up', db: 'up', pgboss: 'up', mastra: 'up' })
    mockedFetchLibraryCountByStatus.mockResolvedValueOnce({ total: 5, ready: 4 })
    await Page()
    expect(mockedFetchHealth).toHaveBeenCalledTimes(1)
    expect(mockedFetchLibraryCountByStatus).toHaveBeenCalledTimes(1)
  })

  it('does not declare a "use client" directive (server component)', () => {
    const source = readFileSync(join(__dirname, '../../src/app/page.tsx'), 'utf8')
    expect(source).not.toMatch(/['"]use client['"]/)
  })
})
