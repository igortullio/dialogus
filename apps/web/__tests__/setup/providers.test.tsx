/**
 * Smoke test for the root <RootLayout> providers contract (task_01 ADR-009).
 * Asserts:
 *   - The layout exports the dIAlogus metadata.
 *   - The provider tree includes ThemeProvider, QueryClientProvider, and Toaster.
 *   - QueryClientProvider exposes the configured staleTime (30s default).
 *   - <ThemeProvider> + <QueryClientProvider> render their children when mounted.
 */
import { useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ElementType, ReactElement, ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import RootLayout, { metadata } from '../../src/app/layout'
import { ThemeProvider } from '../../src/components/theme-provider'
import { Toaster } from '../../src/components/ui/sonner'
import { createQueryClient, QueryClientProvider } from '../../src/lib/query-client'

function findElement(node: ReactNode, target: ElementType): ReactElement | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, target)
      if (match) return match
    }
    return null
  }
  const el = node as ReactElement<{ children?: ReactNode }>
  if (el.type === target) return el
  return findElement(el.props?.children ?? null, target)
}

describe('apps/web RootLayout providers', () => {
  it('exposes the dIAlogus title metadata', () => {
    expect(metadata.title).toBe('dIAlogus')
  })

  it('returns an <html lang="pt-BR" suppressHydrationWarning> shell', () => {
    const tree = RootLayout({ children: 'CHILD-CONTENT' }) as ReactElement<{
      lang: string
      suppressHydrationWarning: boolean
      children: ReactElement
    }>
    expect(tree.type).toBe('html')
    expect(tree.props.lang).toBe('pt-BR')
    expect(tree.props.suppressHydrationWarning).toBe(true)
  })

  it('wraps children in ThemeProvider, QueryClientProvider, and renders Toaster', () => {
    const tree = RootLayout({ children: 'CHILD-CONTENT' }) as ReactElement
    expect(findElement(tree, ThemeProvider)).not.toBeNull()
    expect(findElement(tree, QueryClientProvider)).not.toBeNull()
    expect(findElement(tree, Toaster)).not.toBeNull()
  })

  it('configures ThemeProvider with attribute="class" + system default + transition disabled', () => {
    const tree = RootLayout({ children: 'CHILD-CONTENT' }) as ReactElement
    const themeProvider = findElement(tree, ThemeProvider) as ReactElement<{
      attribute?: string
      defaultTheme?: string
      enableSystem?: boolean
      disableTransitionOnChange?: boolean
    }>
    expect(themeProvider?.props.attribute).toBe('class')
    expect(themeProvider?.props.defaultTheme).toBe('system')
    expect(themeProvider?.props.enableSystem).toBe(true)
    expect(themeProvider?.props.disableTransitionOnChange).toBe(true)
  })

  it('mounts QueryClientProvider with a 30s default staleTime', () => {
    let observed = -1
    function Probe() {
      const client = useQueryClient()
      observed = (client.getDefaultOptions().queries?.staleTime as number) ?? -1
      return <span data-testid="probe">ready</span>
    }

    render(
      <QueryClientProvider>
        <Probe />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('probe')).toBeDefined()
    expect(observed).toBe(30_000)
  })

  it('createQueryClient default options match the QueryClientProvider contract', () => {
    const client = createQueryClient()
    const queries = client.getDefaultOptions().queries
    expect(queries?.staleTime).toBe(30_000)
    expect(queries?.refetchOnWindowFocus).toBe(false)
  })

  it('ThemeProvider renders children unchanged on mount', () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <div data-testid="theme-child">themed</div>
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme-child').textContent).toBe('themed')
  })
})
