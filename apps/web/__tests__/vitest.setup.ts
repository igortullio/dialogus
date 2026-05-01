import { vi } from 'vitest'

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverPolyfill {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver
}

if (typeof globalThis.DOMRect === 'undefined') {
  class DOMRectPolyfill {
    bottom = 0
    height = 0
    left = 0
    right = 0
    top = 0
    width = 0
    x = 0
    y = 0
    toJSON() {
      return this
    }
  }
  globalThis.DOMRect = DOMRectPolyfill as unknown as typeof DOMRect
}

if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = vi.fn()
}

if (typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = vi.fn()
}

if (typeof Element !== 'undefined' && typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false)
}

if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.releasePointerCapture !== 'function'
) {
  Element.prototype.releasePointerCapture = vi.fn()
}

if (typeof Element !== 'undefined' && typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = vi.fn()
}
