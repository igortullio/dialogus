'use client'

import { ComposerPrimitive, useAui, useAuiState, useThread } from '@assistant-ui/react'
import { SendHorizonal, Square } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, type ReactElement, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { BookPicker, SelectedBooksInline } from './BookPicker'
import { useDialogusThreadContext } from './DialogusContext'

const NO_BOOKS_HINT = 'Selecione ao menos um livro para enviar'

export interface DialogusComposerProps {
  readonly className?: string
  readonly placeholder?: string
}

export function DialogusComposer({
  className,
  placeholder = 'Pergunte algo sobre os livros selecionados…',
}: DialogusComposerProps) {
  const { bookIds, setBookIds, isExistingThread, openAddBookDrawer } = useDialogusThreadContext()
  const isRunning = useThread((state) => state.isRunning)

  const noBooksSelected = bookIds.length === 0
  const sendDisabled = noBooksSelected || isRunning
  const composerDisabled = isRunning
  const pickerDisabled = isExistingThread || isRunning

  return (
    <TooltipProvider delayDuration={200}>
      <ComposerPrimitive.Root
        data-slot="dialogus-composer"
        className={cn(
          'flex flex-col gap-2 border-t bg-background p-3',
          isRunning && 'opacity-90',
          className,
        )}
      >
        <div className="flex items-center gap-2">
          {isExistingThread ? (
            <SelectedBooksInline bookIds={bookIds} />
          ) : (
            <BookPicker
              value={bookIds}
              onChange={setBookIds}
              disabled={pickerDisabled}
              onOpenAddDrawer={openAddBookDrawer}
            />
          )}
        </div>
        <UncontrolledComposerInput
          aria-label="Mensagem"
          placeholder={placeholder}
          disabled={composerDisabled}
          canSubmit={!sendDisabled}
          submitMode="ctrlEnter"
          className={cn(
            'min-h-[60px] w-full resize-none rounded-md border bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        />
        <div className="flex items-center justify-between">
          {/* Hidden on touch devices, where there is no ⌘/Enter to press —
              users tap the send button instead. */}
          <span className="text-muted-foreground text-xs [@media(pointer:coarse)]:hidden">
            ⌘+Enter para enviar
          </span>
          <div className="flex items-center gap-2">
            {renderCancelButton(isRunning)}
            {renderSendButton(sendDisabled, noBooksSelected)}
          </div>
        </div>
      </ComposerPrimitive.Root>
    </TooltipProvider>
  )
}

function renderSendButton(disabled: boolean, noBooksSelected: boolean): ReactElement {
  const button = (
    <ComposerPrimitive.Send asChild>
      <Button
        type="submit"
        size="sm"
        disabled={disabled}
        aria-label="Enviar mensagem"
        data-slot="dialogus-composer-send"
      >
        <SendHorizonal aria-hidden className="h-4 w-4" />
        Enviar
      </Button>
    </ComposerPrimitive.Send>
  )
  if (!noBooksSelected) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent role="tooltip">{NO_BOOKS_HINT}</TooltipContent>
    </Tooltip>
  )
}

function renderCancelButton(isRunning: boolean): ReactElement | null {
  if (!isRunning) return null
  return (
    <ComposerPrimitive.Cancel asChild>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="Cancelar transmissão"
        data-slot="dialogus-composer-cancel"
      >
        <Square aria-hidden className="h-4 w-4" />
        Parar
      </Button>
    </ComposerPrimitive.Cancel>
  )
}

type SubmitMode = 'enter' | 'ctrlEnter' | 'none'

function shouldSubmitOnKey(e: KeyboardEvent<HTMLTextAreaElement>, mode: SubmitMode): boolean {
  if (e.nativeEvent.isComposing) return false
  if (e.key !== 'Enter') return false
  if (e.shiftKey) return false
  if (mode === 'enter') return true
  if (mode === 'ctrlEnter') return e.ctrlKey || e.metaKey
  return false
}

interface UncontrolledComposerInputProps {
  readonly className?: string
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly canSubmit?: boolean
  readonly submitMode?: SubmitMode
  readonly 'aria-label'?: string
}

/**
 * Uncontrolled replacement for ComposerPrimitive.Input.
 * Avoids the IME bug where the controlled `value` prop conflicts with
 * macOS dead-key composition (typing accents) and freezes the textarea.
 * Syncs DOM ↔ store via ref + useEffect, only forcing a DOM update when
 * the store text diverges (e.g., reset to '' after send).
 */
function UncontrolledComposerInput({
  className,
  placeholder,
  disabled,
  canSubmit = true,
  submitMode = 'enter',
  'aria-label': ariaLabel,
}: UncontrolledComposerInputProps) {
  const aui = useAui()
  const ref = useRef<HTMLTextAreaElement>(null)
  const storeText = useAuiState((s) => (s.composer.isEditing ? s.composer.text : '')) as string

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (node.value !== storeText) {
      node.value = storeText
    }
  }, [storeText])

  const handleInput = (e: FormEvent<HTMLTextAreaElement>) => {
    aui.composer().setText(e.currentTarget.value)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!shouldSubmitOnKey(e, submitMode)) return
    e.preventDefault()
    // Mirror the send button's disabled state. Without this, a keyboard
    // shortcut bypasses the same guard the button enforces (e.g., empty
    // book selection or in-flight stream).
    if (!canSubmit) return
    ref.current?.closest('form')?.requestSubmit()
  }

  return (
    <textarea
      ref={ref}
      defaultValue=""
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      data-slot="dialogus-composer-input"
      className={className}
    />
  )
}

export const _internals = {
  NO_BOOKS_HINT,
}
