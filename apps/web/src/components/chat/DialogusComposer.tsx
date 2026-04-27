'use client'

import { ComposerPrimitive, useThread } from '@assistant-ui/react'
import { SendHorizonal, Square } from 'lucide-react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { BookPicker } from './BookPicker'
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
          <BookPicker
            value={bookIds}
            onChange={setBookIds}
            disabled={pickerDisabled}
            onOpenAddDrawer={openAddBookDrawer}
          />
          {isExistingThread && (
            <span className="text-muted-foreground text-xs">Trocar livros = nova conversa</span>
          )}
        </div>
        <ComposerPrimitive.Input
          aria-label="Mensagem"
          placeholder={placeholder}
          disabled={composerDisabled}
          submitMode="ctrlEnter"
          className={cn(
            'min-h-[60px] w-full resize-none rounded-md border bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        />
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">⌘+Enter para enviar</span>
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

export const _internals = {
  NO_BOOKS_HINT,
}
