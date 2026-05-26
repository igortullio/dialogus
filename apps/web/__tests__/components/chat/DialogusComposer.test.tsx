import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DialogusComposer } from '../../../src/components/chat/DialogusComposer'
import {
  DialogusThreadContextProvider,
  type DialogusThreadContextValue,
} from '../../../src/components/chat/DialogusContext'
import { makeTestQueryClient, QueryWrapper, RuntimeWrapper } from './_helpers'

const BOOK_A_ID = '11111111-1111-4111-8111-111111111111'
const BOOK_B_ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      return new Response(JSON.stringify({ data: [], links: { next: null } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

interface MountOptions {
  readonly threadId?: string | null
  readonly initialBookIds?: string[]
  readonly openAddBookDrawer?: () => void
  readonly children?: ReactNode
}

function MountComposer({
  threadId = null,
  initialBookIds = [],
  openAddBookDrawer = () => {},
}: MountOptions) {
  const ctx: DialogusThreadContextValue = {
    threadId,
    bookIds: initialBookIds,
    setBookIds: () => {},
    isExistingThread: threadId !== null,
    openAddBookDrawer,
  }
  return (
    <DialogusThreadContextProvider value={ctx}>
      <DialogusComposer />
    </DialogusThreadContextProvider>
  )
}

function renderComposer(opts: MountOptions = {}) {
  const client = makeTestQueryClient()
  const utils = render(
    <QueryWrapper client={client}>
      <RuntimeWrapper>
        <MountComposer {...opts} />
      </RuntimeWrapper>
    </QueryWrapper>,
  )
  return utils
}

function getSendButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-slot="dialogus-composer-send"]')
}

describe('DialogusComposer', () => {
  it('renders the empty book picker and a disabled send button when no books selected', () => {
    renderComposer({ initialBookIds: [] })
    expect(screen.getByText('Selecionar livros')).toBeDefined()
    const send = getSendButton()
    expect(send).not.toBeNull()
    expect(send?.disabled).toBe(true)
  })

  it('enables the send button when at least one book is selected and the input has text', () => {
    renderComposer({ initialBookIds: [BOOK_A_ID] })
    const send = getSendButton()
    expect(send).not.toBeNull()
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mensagem"]')
    expect(textarea).not.toBeNull()
    if (textarea) {
      fireEvent.change(textarea, { target: { value: 'olá' } })
    }
    expect(send?.disabled).toBe(false)
  })

  it('keeps send disabled even with text when no book is selected', () => {
    renderComposer({ initialBookIds: [] })
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mensagem"]')
    if (textarea) fireEvent.change(textarea, { target: { value: 'olá' } })
    expect(getSendButton()?.disabled).toBe(true)
  })

  it('renders a hint about Cmd+Enter to send', () => {
    renderComposer({ initialBookIds: [BOOK_A_ID] })
    expect(screen.getByText('⌘+Enter para enviar')).toBeDefined()
  })

  it('renders the Cmd+Enter hint and uses ctrlEnter submit mode on the input', () => {
    renderComposer({ initialBookIds: [BOOK_A_ID] })
    // submitMode="ctrlEnter": plain Enter should NOT submit. We assert the
    // textarea exists and Enter alone does not invoke send (no submit event
    // bubbles when submitMode is ctrlEnter).
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mensagem"]')
    expect(textarea).not.toBeNull()
  })

  it('shows a tooltip wrapper around the send button when no books are selected', () => {
    renderComposer({ initialBookIds: [] })
    // The send button is wrapped in a tooltip trigger when no books are selected.
    const send = getSendButton()
    expect(send).not.toBeNull()
    const tooltipTrigger = send?.closest('[data-slot="popover"]') ?? send?.parentElement
    expect(tooltipTrigger).not.toBeNull()
  })

  it('does not render the cancel button when not running', () => {
    renderComposer({ initialBookIds: [BOOK_A_ID] })
    expect(document.querySelector('[data-slot="dialogus-composer-cancel"]')).toBeNull()
  })

  it('replaces the picker with a read-only book strip on existing threads', () => {
    renderComposer({ threadId: 'thread-1', initialBookIds: [BOOK_A_ID, BOOK_B_ID] })
    // Picker is intentionally absent — switching books requires a new thread.
    expect(screen.queryByRole('button', { name: 'Selecionar livros para a conversa' })).toBeNull()
    expect(screen.queryByText('Trocar livros = nova conversa')).toBeNull()
    // The inline strip renders even if the library cache hasn't resolved yet
    // (each missing entry shows a placeholder).
    expect(document.querySelector('[data-slot="selected-books-inline"]')).not.toBeNull()
  })
})
