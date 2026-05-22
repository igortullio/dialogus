import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderMessageBody } from '../../src/lib/render-message-markdown'
import { makeTestQueryClient, QueryWrapper } from '../components/chat/_helpers'

const UUID_1 = '01234567-89ab-cdef-0123-456789abcdef'
const UUID_2 = 'abcdef01-2345-6789-abcd-ef0123456789'

afterEach(() => {
  document.body.innerHTML = ''
})

function renderBody(text: string, opts?: { markdown?: boolean }) {
  const { nodes } = renderMessageBody(text, {
    threadId: 't',
    messageId: 'm',
    markdown: opts?.markdown ?? true,
  })
  const result = render(
    <QueryWrapper client={makeTestQueryClient()}>
      <div data-testid="body">{nodes}</div>
    </QueryWrapper>,
  )
  return result.getByTestId('body')
}

describe('renderMessageBody — markdown subset', () => {
  it('renders **bold** as <strong>', () => {
    const root = renderBody('A **palavra** muda tudo.')
    const strong = root.querySelector('strong')
    expect(strong?.textContent).toBe('palavra')
  })

  it('renders *italic* as <em>', () => {
    const root = renderBody('Trata-se de *Memórias Póstumas*.')
    const em = root.querySelector('em')
    expect(em?.textContent).toBe('Memórias Póstumas')
  })

  it('renders blockquote with > prefix', () => {
    const root = renderBody('> «defunto autor»\n> segunda linha')
    const bq = root.querySelector('blockquote')
    expect(bq).not.toBeNull()
    expect(bq?.textContent).toContain('defunto autor')
    expect(bq?.textContent).toContain('segunda linha')
  })

  it('renders bullet list with - prefix', () => {
    const root = renderBody('- primeiro item\n- segundo item')
    const items = root.querySelectorAll('li')
    expect(items.length).toBe(2)
    expect(items[0]?.textContent).toBe('primeiro item')
    expect(items[1]?.textContent).toBe('segundo item')
  })

  it('splits paragraphs on blank line', () => {
    const root = renderBody('Primeiro parágrafo.\n\nSegundo parágrafo.')
    const ps = root.querySelectorAll('p')
    expect(ps.length).toBe(2)
  })

  it('strips disallowed ## headings to plain prose', () => {
    const root = renderBody('## O narrador\n\nÉ Brás Cubas.')
    expect(root.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull()
    expect(root.textContent).toContain('O narrador')
    expect(root.textContent).toContain('É Brás Cubas.')
  })

  it('drops disallowed --- horizontal rule blocks', () => {
    const root = renderBody('Antes.\n\n---\n\nDepois.')
    expect(root.querySelector('hr')).toBeNull()
    expect(root.textContent).toContain('Antes.')
    expect(root.textContent).toContain('Depois.')
  })

  it('keeps citation badge inline among bold + paragraphs', () => {
    const root = renderBody(`O narrador é **Brás Cubas** {{cite:${UUID_1}}}.`)
    const strong = root.querySelector('strong')
    expect(strong?.textContent).toBe('Brás Cubas')
    const badge = root.querySelector('[data-slot="citation-badge"]')
    expect(badge?.getAttribute('data-chunk-id')).toBe(UUID_1)
    expect(badge?.getAttribute('data-citation-index')).toBe('1')
  })

  it('preserves citation order across multiple paragraphs', () => {
    const root = renderBody(
      `Primeira menção {{cite:${UUID_1}}}.\n\nSegunda menção {{cite:${UUID_2}}}.`,
    )
    const badges = Array.from(root.querySelectorAll('[data-slot="citation-badge"]'))
    expect(badges.map((el) => el.getAttribute('data-chunk-id'))).toEqual([UUID_1, UUID_2])
    expect(badges.map((el) => el.getAttribute('data-citation-index'))).toEqual(['1', '2'])
  })

  it('renders user-mode (markdown=false) as inline plain text', () => {
    const root = renderBody('**Não** deve virar bold.', { markdown: false })
    expect(root.querySelector('strong')).toBeNull()
    expect(root.textContent).toContain('**Não** deve virar bold.')
  })
})
