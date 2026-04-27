'use client'

import { useSyncExternalStore } from 'react'

type Listener = () => void

interface State {
  openChunkId: string | null
  unresolvedOpen: boolean
}

let state: State = { openChunkId: null, unresolvedOpen: false }
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

function setState(next: State): void {
  if (next.openChunkId === state.openChunkId && next.unresolvedOpen === state.unresolvedOpen) return
  state = next
  emit()
}

function getOpenChunkIdSnapshot(): string | null {
  return state.openChunkId
}

function getOpenChunkIdServerSnapshot(): null {
  return null
}

function getUnresolvedSnapshot(): boolean {
  return state.unresolvedOpen
}

function getUnresolvedServerSnapshot(): false {
  return false
}

export function openCitationPanel(chunkId: string): void {
  setState({ openChunkId: chunkId, unresolvedOpen: false })
}

export function closeCitationPanel(): void {
  setState({ openChunkId: null, unresolvedOpen: false })
}

export function openUnresolvedPanel(): void {
  setState({ openChunkId: null, unresolvedOpen: true })
}

export function closeUnresolvedPanel(): void {
  if (!state.unresolvedOpen) return
  setState({ openChunkId: state.openChunkId, unresolvedOpen: false })
}

export interface UseCitationPanelResult {
  readonly openChunkId: string | null
  open(chunkId: string): void
  close(): void
}

export function useCitationPanel(): UseCitationPanelResult {
  const openChunkId = useSyncExternalStore(
    subscribe,
    getOpenChunkIdSnapshot,
    getOpenChunkIdServerSnapshot,
  )
  return {
    openChunkId,
    open: openCitationPanel,
    close: closeCitationPanel,
  }
}

export interface UseUnresolvedPanelResult {
  readonly isOpen: boolean
  open(): void
  close(): void
}

export function useUnresolvedPanel(): UseUnresolvedPanelResult {
  const isOpen = useSyncExternalStore(subscribe, getUnresolvedSnapshot, getUnresolvedServerSnapshot)
  return {
    isOpen,
    open: openUnresolvedPanel,
    close: closeUnresolvedPanel,
  }
}

export function _resetCitationPanelForTests(): void {
  state = { openChunkId: null, unresolvedOpen: false }
  listeners.clear()
}
