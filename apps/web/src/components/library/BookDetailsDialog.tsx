'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Book } from '@/lib/api/_schemas'
import { _internals as statusInternals } from './StatusBadge'

const TITLE_LABEL = 'Detalhes do livro'
const CLOSE_LABEL = 'Fechar'
const AUTHORS_LABEL = 'Autores'
const LANGUAGES_LABEL = 'Idiomas'
const SUBJECTS_LABEL = 'Assuntos'
const STATUS_LABEL = 'Status'
const NO_AUTHORS = 'Sem autores'
const NO_SUBJECTS = 'Sem assuntos'

function authorList(book: Book): string {
  if (book.authors.length === 0) return NO_AUTHORS
  return book.authors.map((author) => author.name).join(', ')
}

function languageList(book: Book): string {
  if (book.languages.length === 0) return '—'
  return book.languages.map((code) => code.toUpperCase()).join(', ')
}

function subjectList(book: Book): string {
  if (book.subjects.length === 0) return NO_SUBJECTS
  return book.subjects.slice(0, 6).join(' · ')
}

export interface BookDetailsDialogProps {
  readonly book: Book
  readonly open: boolean
  onOpenChange(open: boolean): void
}

export function BookDetailsDialog({ book, open, onOpenChange }: BookDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-slot="book-details-dialog" data-book-id={book.id}>
        <DialogHeader>
          <DialogTitle className="font-serif">{book.title}</DialogTitle>
          <DialogDescription>{TITLE_LABEL}</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {AUTHORS_LABEL}
            </dt>
            <dd>{authorList(book)}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {LANGUAGES_LABEL}
            </dt>
            <dd>{languageList(book)}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {STATUS_LABEL}
            </dt>
            <dd data-slot="book-details-status">
              {statusInternals.STATUS_LABEL[book.ingestion_status]}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {SUBJECTS_LABEL}
            </dt>
            <dd className="text-muted-foreground">{subjectList(book)}</dd>
          </div>
        </dl>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" data-slot="book-details-close">
              {CLOSE_LABEL}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const _internals = {
  TITLE_LABEL,
  CLOSE_LABEL,
  AUTHORS_LABEL,
  LANGUAGES_LABEL,
  SUBJECTS_LABEL,
  STATUS_LABEL,
}
