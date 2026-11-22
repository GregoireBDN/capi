import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MouseEvent } from 'react'
import {
  INSTANT_CLOSE_ATTRIBUTE,
  closeSheetThenNavigate,
} from './close-then-navigate'

function click(
  init: Partial<MouseEvent<HTMLAnchorElement>> = {},
  href: string | null = '/budget?month=2026-10',
) {
  const anchor = document.createElement('a')
  if (href !== null) anchor.setAttribute('href', href)
  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    currentTarget: anchor,
    preventDefault: vi.fn(),
    ...init,
  }
  return event as unknown as MouseEvent<HTMLAnchorElement> & {
    preventDefault: ReturnType<typeof vi.fn>
  }
}

describe('closeSheetThenNavigate (#419)', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.removeAttribute(INSTANT_CLOSE_ATTRIBUTE)
  })

  it('closes the sheet at once, then changes the page after a paint', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] })
    const order: string[] = []
    const close = vi.fn(() => {
      order.push('close')
      // The closing animation is off while the sheet closes.
      expect(
        document.documentElement.hasAttribute(INSTANT_CLOSE_ATTRIBUTE),
      ).toBe(true)
    })
    const navigate = vi.fn((href: string) => order.push(`go ${href}`))
    const event = click()

    closeSheetThenNavigate(event, close, navigate)

    // The router does not push the page with the sheet still open.
    expect(event.preventDefault).toHaveBeenCalled()
    expect(order).toEqual(['close'])
    vi.advanceTimersToNextFrame()
    expect(navigate).not.toHaveBeenCalled()
    vi.advanceTimersToNextFrame()
    expect(order).toEqual(['close', 'go /budget?month=2026-10'])
    expect(document.documentElement.hasAttribute(INSTANT_CLOSE_ATTRIBUTE)).toBe(
      false,
    )
  })

  it('leaves a click that opens the link elsewhere to the browser', () => {
    for (const init of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { button: 1 },
      { defaultPrevented: true },
    ]) {
      const close = vi.fn()
      const navigate = vi.fn()
      const event = click(init)
      closeSheetThenNavigate(event, close, navigate)
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(close).toHaveBeenCalledOnce()
      expect(navigate).not.toHaveBeenCalled()
    }
  })
})
