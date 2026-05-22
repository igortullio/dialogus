import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DialogusMessage } from '../../../src/components/chat/DialogusMessage'
import { makeTestQueryClient, QueryWrapper } from './_helpers'

afterEach(() => {
  cleanup()
})

const UUID_1 = '01234567-89ab-cdef-0123-456789abcdef'
const UUID_2 = 'abcdef01-2345-6789-abcd-ef0123456789'
const UUID_3 = 'fedcba98-7654-3210-fedc-ba9876543210'

function renderMessage(props: Parameters<typeof DialogusMessage>[0]) {
  const client = makeTestQueryClient()
  return render(
    <QueryWrapper client={client}>
      <DialogusMessage {...props} />
    </QueryWrapper>,
  )
}

describe('DialogusMessage', () => {
  it('renders text-only content cleanly', () => {
    renderMessage({ messageId: 'm-1', text: 'Olá, mundo.', status: 'complete' })
    const root = screen.getByText('Olá, mundo.')
    expect(root).toBeDefined()
    expect(document.querySelectorAll('[data-slot="citation-badge"]').length).toBe(0)
  })

  it('renders text + citation badge for a single marker', () => {
    renderMessage({
      messageId: 'm-2',
      text: `Brás Cubas começa pelo fim {{cite:${UUID_1}}}.`,
      status: 'complete',
    })
    const badges = Array.from(document.querySelectorAll('[data-slot="citation-badge"]'))
    expect(badges.length).toBe(1)
    const [first] = badges
    expect(first?.getAttribute('data-chunk-id')).toBe(UUID_1)
    expect(first?.getAttribute('data-citation-index')).toBe('1')
  })

  it('indexes multiple citations 1, 2, 3 in order', () => {
    renderMessage({
      messageId: 'm-3',
      text: `a {{cite:${UUID_1}}} b {{cite:${UUID_2}}} c {{cite:${UUID_3}}} d`,
      status: 'complete',
    })
    const badges = Array.from(document.querySelectorAll('[data-slot="citation-badge"]'))
    expect(badges.map((el) => el.getAttribute('data-citation-index'))).toEqual(['1', '2', '3'])
    expect(badges.map((el) => el.getAttribute('data-chunk-id'))).toEqual([UUID_1, UUID_2, UUID_3])
  })

  it('resets parser state on a new messageId', () => {
    const { rerender } = renderMessage({
      messageId: 'm-4',
      text: `first {{cite:${UUID_1}}} second {{cite:${UUID_2}}}`,
      status: 'complete',
    })
    const badges = document.querySelectorAll('[data-slot="citation-badge"]')
    expect(badges.length).toBe(2)

    rerender(
      <QueryWrapper client={makeTestQueryClient()}>
        <DialogusMessage messageId="m-5" text={`x {{cite:${UUID_3}}}`} status="complete" />
      </QueryWrapper>,
    )
    const badgesAfter = Array.from(document.querySelectorAll('[data-slot="citation-badge"]'))
    expect(badgesAfter.length).toBe(1)
    const [only] = badgesAfter
    expect(only?.getAttribute('data-citation-index')).toBe('1')
    expect(only?.getAttribute('data-chunk-id')).toBe(UUID_3)
  })

  it('renders unresolved markers as raw text', () => {
    renderMessage({
      messageId: 'm-6',
      text: 'antes {{cite:not-a-uuid}} depois',
      status: 'complete',
    })
    expect(screen.getByText(/antes/)).toBeDefined()
    expect(document.body.textContent).toContain('{{cite:not-a-uuid}}')
    expect(document.querySelectorAll('[data-slot="citation-badge"]').length).toBe(0)
  })

  it('flushes a dangling marker_pending as unresolved', () => {
    renderMessage({
      messageId: 'm-7',
      text: `parcial {{cite:${UUID_1}`,
      status: 'incomplete',
    })
    expect(document.body.textContent).toContain(`{{cite:${UUID_1}`)
    expect(document.querySelectorAll('[data-slot="citation-badge"]').length).toBe(0)
  })

  it('exposes role + status as data attributes', () => {
    renderMessage({ messageId: 'm-8', text: 'x', role: 'user', status: 'streaming' })
    const root = document.querySelector('[data-slot="dialogus-message"]')
    expect(root).not.toBeNull()
    expect(root?.getAttribute('data-role')).toBe('user')
    expect(root?.getAttribute('data-message-status')).toBe('streaming')
    expect(root?.getAttribute('data-message-id')).toBe('m-8')
  })

  it('shows "Pensando…" when assistant is streaming with no text yet', () => {
    renderMessage({
      messageId: 'm-9',
      text: '',
      role: 'assistant',
      status: 'streaming',
      activity: [],
    })
    const activity = document.querySelector('[data-slot="dialogus-message-activity"]')
    expect(activity?.textContent).toContain('Pensando')
    // No caret while there is no body to anchor it to.
    expect(document.querySelector('[data-slot="dialogus-message-caret"]')).toBeNull()
  })

  it('humanises a running tool name into the activity label', () => {
    renderMessage({
      messageId: 'm-10',
      text: '',
      role: 'assistant',
      status: 'streaming',
      activity: [{ id: 't1', toolName: 'semantic_search', running: true }],
    })
    const activity = document.querySelector('[data-slot="dialogus-message-activity"]')
    expect(activity?.textContent).toContain('Buscando passagens')
  })

  it('shows a streaming caret once text starts arriving', () => {
    renderMessage({
      messageId: 'm-11',
      text: 'Pierre é o filho ilegítimo',
      role: 'assistant',
      status: 'streaming',
      activity: [{ id: 't1', toolName: 'semantic_search', running: false }],
    })
    expect(document.querySelector('[data-slot="dialogus-message-caret"]')).not.toBeNull()
    // Activity hides once body is present and no tool is still running.
    expect(document.querySelector('[data-slot="dialogus-message-activity"]')).toBeNull()
  })

  it('hides activity and caret once message is complete', () => {
    renderMessage({
      messageId: 'm-12',
      text: 'Resposta final.',
      role: 'assistant',
      status: 'complete',
      activity: [{ id: 't1', toolName: 'semantic_search', running: false }],
    })
    expect(document.querySelector('[data-slot="dialogus-message-activity"]')).toBeNull()
    expect(document.querySelector('[data-slot="dialogus-message-caret"]')).toBeNull()
  })
})
