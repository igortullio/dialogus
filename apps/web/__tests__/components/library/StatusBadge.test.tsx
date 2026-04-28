import type { IngestionStatus } from '@dialogus/shared/schemas/ingestion'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { _internals, isInProgress, StatusBadge } from '../../../src/components/library/StatusBadge'

afterEach(() => {
  cleanup()
})

function getBadge(): HTMLElement {
  const badge = document.querySelector('[data-slot="status-badge"]')
  if (!(badge instanceof HTMLElement)) throw new Error('badge not found')
  return badge
}

describe('isInProgress', () => {
  it('returns true for active ingestion stages', () => {
    for (const status of [
      'downloading',
      'cleaning',
      'parsing',
      'chunking',
      'summarizing',
      'embedding',
      'indexing',
    ] as const) {
      expect(isInProgress(status)).toBe(true)
    }
  })

  it('returns false for terminal/discovered statuses', () => {
    for (const status of ['discovered', 'ready', 'failed'] as const) {
      expect(isInProgress(status)).toBe(false)
    }
  })
})

describe('StatusBadge', () => {
  it('renders the discovered (neutral) variant without progress', () => {
    render(<StatusBadge status="discovered" progress={50} />)
    const badge = getBadge()
    expect(badge.getAttribute('data-variant')).toBe('neutral')
    expect(badge.querySelector('[data-slot="status-badge-percent"]')).toBeNull()
  })

  it('renders the ready variant with the check glyph', () => {
    render(<StatusBadge status="ready" />)
    const badge = getBadge()
    expect(badge.getAttribute('data-variant')).toBe('ready')
    expect(badge.querySelector('[data-slot="status-badge-check"]')).not.toBeNull()
    expect(badge.querySelector('[data-slot="status-badge-percent"]')).toBeNull()
    expect(screen.getByText(_internals.STATUS_LABEL.ready)).toBeDefined()
  })

  it('renders the failed variant with the warning glyph', () => {
    render(<StatusBadge status="failed" />)
    const badge = getBadge()
    expect(badge.getAttribute('data-variant')).toBe('failed')
    expect(badge.querySelector('[data-slot="status-badge-warning"]')).not.toBeNull()
    expect(badge.className).toContain('bg-status-failed')
  })

  it('renders the in-progress variant with the spinner and percent', () => {
    render(<StatusBadge status="embedding" progress={42} />)
    const badge = getBadge()
    expect(badge.getAttribute('data-variant')).toBe('progress')
    expect(badge.querySelector('[data-slot="status-badge-spinner"]')).not.toBeNull()
    const percent = badge.querySelector('[data-slot="status-badge-percent"]')
    expect(percent?.textContent).toBe('42%')
    expect(badge.getAttribute('aria-label')).toBe(`${_internals.STATUS_LABEL.embedding} 42%`)
  })

  it('clamps and rounds the percent value into 0-100', () => {
    render(<StatusBadge status="downloading" progress={130.6} />)
    const badge = getBadge()
    const percent = badge.querySelector('[data-slot="status-badge-percent"]')
    expect(percent?.textContent).toBe('100%')
  })

  it('omits the percent when progress is undefined for in-progress states', () => {
    render(<StatusBadge status="downloading" />)
    const badge = getBadge()
    expect(badge.querySelector('[data-slot="status-badge-percent"]')).toBeNull()
  })

  it('renders a distinct variant per ingestion status', () => {
    const seen = new Map<string, IngestionStatus>()
    const all: IngestionStatus[] = [
      'discovered',
      'downloading',
      'cleaning',
      'parsing',
      'chunking',
      'summarizing',
      'embedding',
      'indexing',
      'ready',
      'failed',
    ]
    for (const status of all) {
      cleanup()
      render(<StatusBadge status={status} progress={50} />)
      const badge = getBadge()
      const variant = badge.getAttribute('data-variant') ?? ''
      const previous = seen.get(`${variant}:${status}`)
      expect(previous).toBeUndefined()
      seen.set(`${variant}:${status}`, status)
    }
  })
})
