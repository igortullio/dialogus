import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/health', () => ({
  fetchHealth: vi.fn(),
}))

const { fetchHealth } = await import('../../src/lib/health')
const { default: Page } = await import('../../src/app/page')
const mockedFetchHealth = vi.mocked(fetchHealth)

describe('apps/web landing Page', () => {
  beforeEach(() => {
    mockedFetchHealth.mockReset()
  })

  it('renders the dIAlogus heading and the all-up status line when every probe is up', async () => {
    mockedFetchHealth.mockResolvedValueOnce({ api: 'up', db: 'up', pgboss: 'up' })

    const tree = await Page()
    const { container } = render(tree)

    const heading = container.querySelector('h1')
    expect(heading).not.toBeNull()
    expect(heading?.textContent).toBe('dIAlogus')
    expect(container.textContent).toContain('api: up')
    expect(container.textContent).toContain('db: up')
    expect(container.textContent).toContain('pgboss: up')
  })

  it('renders db: down when the db probe reports down', async () => {
    mockedFetchHealth.mockResolvedValueOnce({ api: 'up', db: 'down', pgboss: 'up' })

    const tree = await Page()
    const { container } = render(tree)

    expect(container.textContent).toContain('db: down')
  })

  it('renders pgboss: down when the pg-boss probe reports down', async () => {
    mockedFetchHealth.mockResolvedValueOnce({ api: 'up', db: 'up', pgboss: 'down' })

    const tree = await Page()
    const { container } = render(tree)

    expect(container.textContent).toContain('pgboss: down')
  })

  it('is an async function (Server Component) that calls fetchHealth at render time', async () => {
    expect(Page.constructor.name).toBe('AsyncFunction')

    mockedFetchHealth.mockResolvedValueOnce({ api: 'up', db: 'up', pgboss: 'up' })
    await Page()
    expect(mockedFetchHealth).toHaveBeenCalledTimes(1)
  })

  it('does not declare a "use client" directive (server component)', () => {
    const source = readFileSync(join(__dirname, '../../src/app/page.tsx'), 'utf8')
    expect(source).not.toMatch(/['"]use client['"]/)
  })
})
