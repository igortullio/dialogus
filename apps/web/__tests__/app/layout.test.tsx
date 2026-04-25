import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import RootLayout, { metadata } from '../../src/app/layout'

describe('apps/web RootLayout', () => {
  it('returns an <html> element with lang="pt-BR"', () => {
    const tree = RootLayout({ children: 'placeholder' }) as ReactElement<{
      lang: string
      children: ReactElement
    }>
    expect(tree.type).toBe('html')
    expect(tree.props.lang).toBe('pt-BR')
  })

  it('wraps the children in a <body> element', () => {
    const tree = RootLayout({ children: 'CHILD-CONTENT' }) as ReactElement<{
      children: ReactElement<{ children: unknown }>
    }>
    const body = tree.props.children
    expect(body.type).toBe('body')
    expect(body.props.children).toBe('CHILD-CONTENT')
  })

  it('exports metadata with title "dIAlogus"', () => {
    expect(metadata.title).toBe('dIAlogus')
  })
})
