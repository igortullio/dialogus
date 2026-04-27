'use client'

import { useSyncExternalStore } from 'react'

type Listener = () => void

let isOpen = false
const listeners = new Set<Listener>()

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function getSnapshot(): boolean {
  return isOpen
}

function getServerSnapshot(): boolean {
  return false
}

export function openAddBookDrawer(): void {
  if (isOpen) return
  isOpen = true
  emit()
}

export function closeAddBookDrawer(): void {
  if (!isOpen) return
  isOpen = false
  emit()
}

export function setAddBookDrawerOpen(open: boolean): void {
  if (open === isOpen) return
  isOpen = open
  emit()
}

export function useAddBookDrawerOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Test-only reset: keep tests isolated. Used by __tests__ to clear state.
export function _resetAddBookDrawerForTests(): void {
  isOpen = false
  listeners.clear()
}
