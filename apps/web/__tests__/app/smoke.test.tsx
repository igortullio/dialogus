/**
 * Smoke render check for `_smoke/page.tsx` (task_06):
 *   - Renders the page component (private folder, not a runtime route).
 *   - Asserts the full primitive set mounts without throwing.
 *   - Asserts no console.error / console.warn fire during render.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SmokePage from '../../src/app/_smoke/page'

describe('apps/web /_smoke page', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('renders the smoke page header', () => {
    render(<SmokePage />)
    expect(screen.getByRole('heading', { level: 1, name: /dIAlogus primitive smoke/ })).toBeTruthy()
  })

  it('mounts each primitive section heading', () => {
    render(<SmokePage />)
    for (const title of [
      'Typography',
      'Status palette',
      'Atoms',
      'Card',
      'Overlays',
      'Menus & popovers',
      'Forms',
      'Tabs',
      'Custom anchors',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeTruthy()
    }
  })

  it('renders status palette badges for ready / progress / failed / scholarly', () => {
    render(<SmokePage />)
    expect(screen.getByText('ready')).toBeTruthy()
    expect(screen.getByText('in progress')).toBeTruthy()
    expect(screen.getByText('failed')).toBeTruthy()
    expect(screen.getByText('scholarly accent')).toBeTruthy()
  })

  it('exposes the core triggers for overlay primitives', () => {
    render(<SmokePage />)
    expect(screen.getByRole('button', { name: 'Open dialog' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open sheet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Thread menu' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Spoiler popover' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hover me' })).toBeTruthy()
  })

  it('renders the slider, select, and tabs surfaces', () => {
    render(<SmokePage />)
    expect(screen.getByRole('slider')).toBeTruthy()
    expect(screen.getByRole('combobox')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Recentes' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Fixadas' })).toBeTruthy()
  })

  it('does not log console.error / console.warn during render', () => {
    render(<SmokePage />)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
