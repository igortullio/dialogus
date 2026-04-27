'use client'

import { createContext, useContext } from 'react'

export const MAX_BOOKS_PER_THREAD = 3

export interface DialogusThreadContextValue {
  readonly threadId: string | null
  readonly bookIds: string[]
  setBookIds(ids: string[]): void
  readonly isExistingThread: boolean
  openAddBookDrawer(): void
}

const DialogusThreadContext = createContext<DialogusThreadContextValue | null>(null)

export const DialogusThreadContextProvider = DialogusThreadContext.Provider

export function useDialogusThreadContext(): DialogusThreadContextValue {
  const value = useContext(DialogusThreadContext)
  if (value === null) {
    throw new Error('useDialogusThreadContext must be used inside <DialogusThread>')
  }
  return value
}
