/**
 * Tailwind v4 + shadcn smoke check (task_01 success criterion):
 *   - The cn() helper resolves Tailwind utility class strings.
 *   - <Button> renders with the default-variant utility classes.
 *   - <Card>, <Badge>, <Input>, <Skeleton>, <Separator> mount without errors.
 *
 * The shadcn primitives are scanned by Tailwind only at build time; this test
 * proves the shipped className strings reach the DOM unchanged.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from '../../src/components/ui/badge'
import { Button } from '../../src/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../src/components/ui/card'
import { Input } from '../../src/components/ui/input'
import { Separator } from '../../src/components/ui/separator'
import { Skeleton } from '../../src/components/ui/skeleton'
import { cn } from '../../src/lib/utils'

describe('Tailwind v4 + shadcn smoke', () => {
  it('cn() resolves Tailwind utility classes (clsx + tailwind-merge)', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
    expect(cn('text-foreground', undefined, false, 'bg-background')).toBe(
      'text-foreground bg-background',
    )
  })

  it('<Button> renders with the default-variant + size utility classes', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button', { name: 'Click me' })
    expect(button.className).toContain('bg-primary')
    expect(button.className).toContain('text-primary-foreground')
    expect(button.className).toContain('h-9')
    expect(button.className).toContain('rounded-md')
  })

  it('<Button variant="outline" size="sm"> swaps utility classes via cva', () => {
    render(
      <Button variant="outline" size="sm">
        Cancel
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Cancel' })
    expect(button.className).toContain('border')
    expect(button.className).toContain('h-8')
    expect(button.className).not.toContain('bg-primary')
  })

  it('<Card>, <CardHeader>, <CardTitle>, <CardContent> mount with semantic classes', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>body</CardContent>
      </Card>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).toContain('rounded-lg')
    expect(card.className).toContain('bg-card')
    expect(screen.getByText('Title').className).toContain('font-semibold')
  })

  it('<Badge variant="secondary"> applies the secondary variant', () => {
    render(<Badge variant="secondary">tag</Badge>)
    const badge = screen.getByText('tag')
    expect(badge.className).toContain('bg-secondary')
  })

  it('<Input>, <Skeleton>, <Separator> render without errors', () => {
    render(
      <div>
        <Input placeholder="search" />
        <Skeleton data-testid="skeleton" className="h-4 w-32" />
        <Separator />
      </div>,
    )
    expect(screen.getByPlaceholderText('search').className).toContain('flex')
    expect(screen.getByTestId('skeleton').className).toContain('animate-pulse')
  })
})
