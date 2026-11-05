import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no matchMedia; components such as the sidebar (`useIsMobile`) and
// the theme hook query it. Default to "no match" (desktop, light scheme).
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent in jsdom despite the DOM typings
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// jsdom does not implement scrolling; the router restores scroll on navigation.
window.scrollTo = vi.fn()

// Unmount any rendered tree between tests so the jsdom DOM stays isolated.
afterEach(() => {
  cleanup()
})
