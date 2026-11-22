import { act, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GESTURE_ATTRIBUTE,
  SWIPE_EDGE,
  dragProgress,
  settlesOpen,
  swipeIntent,
  swipeMayStart,
  useSidebarSwipe,
} from './sidebar-swipe'

describe('swipeIntent', () => {
  it('waits for a few pixels, then tells a swipe from a scroll', () => {
    expect(swipeIntent(4, 3)).toBeNull()
    expect(swipeIntent(40, 5)).toBe('sideways')
    expect(swipeIntent(-40, 10)).toBe('sideways')
    // Mostly vertical, or slanting: the page's scroll.
    expect(swipeIntent(5, 40)).toBe('vertical')
    expect(swipeIntent(30, 25)).toBe('vertical')
  })
})

describe('dragProgress', () => {
  it('follows the finger from shut and from open, within 0 and 1', () => {
    expect(dragProgress(150, 300, 'shut')).toBe(0.5)
    expect(dragProgress(-30, 300, 'shut')).toBe(0)
    expect(dragProgress(400, 300, 'shut')).toBe(1)
    expect(dragProgress(-75, 300, 'open')).toBe(0.75)
    expect(dragProgress(20, 300, 'open')).toBe(1)
  })
})

describe('settlesOpen', () => {
  it('goes past half way, or the way a fling goes', () => {
    expect(settlesOpen(0.6, 0)).toBe(true)
    expect(settlesOpen(0.4, 0)).toBe(false)
    // A quick flick opens or closes from anywhere.
    expect(settlesOpen(0.2, 0.8)).toBe(true)
    expect(settlesOpen(0.9, -0.8)).toBe(false)
  })
})

describe('swipeMayStart', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })
  const at = (id: string, x = 200, edgeIsFree = false) =>
    swipeMayStart(document.getElementById(id), x, edgeIsFree)

  it('takes a touch on the page, the left edge only in the installed app', () => {
    document.body.innerHTML = '<main><p id="t">Texte</p></main>'
    expect(at('t')).toBe(true)
    // Safari's back swipe in a tab.
    expect(at('t', 10)).toBe(false)
    expect(at('t', SWIPE_EDGE - 1)).toBe(false)
    expect(at('t', SWIPE_EDGE)).toBe(true)
    // No back swipe in the installed app.
    expect(at('t', 10, true)).toBe(true)
  })

  it('leaves what has its own sideways gesture or scrolls sideways', () => {
    document.body.innerHTML = `
      <div data-no-swipe><button id="day">12</button></div>
      <div style="touch-action: pan-y"><span id="strip">strip</span></div>
      <div style="touch-action: none"><span id="drag">drag</span></div>
      <div style="touch-action: manipulation"><span id="tap">tap</span></div>
      <div id="row" style="overflow-x: auto"><span id="chip">chip</span></div>
    `
    const row = document.getElementById('row')!
    Object.defineProperty(row, 'scrollWidth', { value: 800 })
    Object.defineProperty(row, 'clientWidth', { value: 390 })
    expect(at('day')).toBe(false)
    expect(at('strip')).toBe(false)
    expect(at('drag')).toBe(false)
    expect(at('chip')).toBe(false)
    expect(at('tap')).toBe(true)
  })

  it('leaves fields and an open panel alone', () => {
    document.body.innerHTML = `
      <input id="field" />
      <p id="text">Texte</p>
      <div role="dialog"><p>Menu</p></div>
    `
    expect(at('field')).toBe(false)
    expect(at('text')).toBe(false)
  })
})

/** The hook with a stand-in sheet, 300px wide, mounted while open. */
function Harness({ initial = false }: { initial?: boolean }) {
  const [open, setOpen] = useState(initial)
  useSidebarSwipe(true, open, setOpen)
  return (
    <>
      <main>
        <p data-testid="page">Page</p>
      </main>
      {open && (
        <>
          <div data-slot="sheet-overlay" data-testid="overlay" />
          <div data-slot="sidebar" data-mobile="true" data-testid="sheet">
            <a href="/budget">Budget</a>
          </div>
        </>
      )}
    </>
  )
}

function touch(
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  target: Element,
  x: number,
  y = 300,
) {
  const point = [{ clientX: x, clientY: y }]
  fireEvent[type](target, {
    touches: type === 'touchEnd' ? [] : point,
    changedTouches: point,
  })
}

describe('useSidebarSwipe (#446)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
    } as DOMRect)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('opens the sheet under the finger and keeps it open past half way', () => {
    const view = render(<Harness />)
    const page = view.getByTestId('page')
    touch('touchStart', page, 100)
    touch('touchMove', page, 130)
    // Mounted, drawn a tenth open, no keyframe animation meanwhile.
    const sheet = view.getByTestId('sheet')
    expect(document.documentElement.hasAttribute(GESTURE_ATTRIBUTE)).toBe(true)
    expect(sheet.style.transform).toBe('translateX(-90%)')
    touch('touchMove', page, 280)
    expect(sheet.style.transform).toBe('translateX(-40%)')
    expect(view.getByTestId('overlay').style.opacity).toBe('0.6')
    touch('touchEnd', page, 280)
    act(() => vi.runAllTimers())
    expect(view.getByTestId('sheet')).toBeInTheDocument()
    expect(sheet.style.transform).toBe('')
    expect(sheet.hasAttribute('data-gesture-opened')).toBe(true)
    expect(document.documentElement.hasAttribute(GESTURE_ATTRIBUTE)).toBe(false)
  })

  it('never opens for a scroll nor a swipe to the left', () => {
    const view = render(<Harness />)
    const page = view.getByTestId('page')
    touch('touchStart', page, 100, 300)
    touch('touchMove', page, 110, 380)
    touch('touchMove', page, 250, 390)
    touch('touchEnd', page, 250, 390)
    expect(view.queryByTestId('sheet')).toBeNull()
    touch('touchStart', page, 250)
    touch('touchMove', page, 100)
    touch('touchEnd', page, 100)
    expect(view.queryByTestId('sheet')).toBeNull()
  })

  it('closes the open sheet with a swipe to the left on it', () => {
    const view = render(<Harness initial />)
    const sheet = view.getByTestId('sheet')
    touch('touchStart', sheet, 250)
    touch('touchMove', sheet, 200)
    expect(sheet.style.transform).toMatch(/^translateX\(-16\.6+\d*%\)$/)
    touch('touchMove', sheet, 40)
    touch('touchEnd', sheet, 40)
    act(() => vi.runAllTimers())
    expect(view.queryByTestId('sheet')).toBeNull()
    expect(document.documentElement.hasAttribute(GESTURE_ATTRIBUTE)).toBe(false)
  })
})
