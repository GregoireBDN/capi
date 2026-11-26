import { act, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACK_SWIPE_EDGE,
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
    // Slanting, up to 45°: still a swipe (the owner).
    expect(swipeIntent(30, 25)).toBe('sideways')
    expect(swipeIntent(20, -20)).toBe('sideways')
    // Steeper: the page's scroll.
    expect(swipeIntent(5, 40)).toBe('vertical')
    expect(swipeIntent(20, 30)).toBe('vertical')
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

/** Fires a touch event; false when the hook cancelled it. */
function touch(
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  target: Element,
  x: number,
  y = 300,
): boolean {
  const point = [{ clientX: x, clientY: y }]
  return fireEvent[type](target, {
    touches: type === 'touchEnd' ? [] : point,
    changedTouches: point,
  })
}

/** Media queries matching `matching` (the installed app, reduced motion). */
function mediaMatching(...matching: string[]) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: matching.some((part) => query.includes(part)),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  )
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

  it('opens for a slanting swipe and follows the finger back and forth', () => {
    const view = render(<Harness />)
    const page = view.getByTestId('page')
    touch('touchStart', page, 100, 300)
    // 40° from horizontal: a swipe, and the page no longer scrolls.
    expect(touch('touchMove', page, 112, 310)).toBe(false)
    const sheet = view.getByTestId('sheet')
    touch('touchMove', page, 250, 360)
    expect(sheet.style.transform).toBe('translateX(-50%)')
    // Pulled back, then out again, before letting go.
    touch('touchMove', page, 130, 370)
    expect(sheet.style.transform).toBe('translateX(-90%)')
    touch('touchMove', page, 220, 380)
    expect(sheet.style.transform).toBe('translateX(-60%)')
  })

  it('leaves a scroll to the page', () => {
    const view = render(<Harness />)
    const page = view.getByTestId('page')
    touch('touchStart', page, 100, 300)
    expect(touch('touchMove', page, 106, 340)).toBe(true)
    expect(touch('touchMove', page, 140, 380)).toBe(true)
    expect(view.queryByTestId('sheet')).toBeNull()
  })

  it('follows the finger with reduced motion too, then settles at once', () => {
    mediaMatching('prefers-reduced-motion')
    const view = render(<Harness />)
    const page = view.getByTestId('page')
    touch('touchStart', page, 100)
    touch('touchMove', page, 160)
    const sheet = view.getByTestId('sheet')
    expect(sheet.style.transform).toBe('translateX(-80%)')
    touch('touchMove', page, 280)
    touch('touchEnd', page, 280)
    expect(sheet.style.transform).toBe('')
    expect(sheet.hasAttribute('data-gesture-opened')).toBe(true)
  })

  it('keeps the installed app edge from iOS, a tap there still clicks', () => {
    mediaMatching('display-mode: standalone')
    const onClick = vi.fn()
    const view = render(
      <>
        <button type="button" onClick={onClick}>
          ☰
        </button>
        <Harness />
      </>,
    )
    const button = view.getByRole('button')
    // At the edge: cancelled (no back swipe), and clicked once let go.
    expect(touch('touchStart', button, BACK_SWIPE_EDGE - 4)).toBe(false)
    touch('touchEnd', button, BACK_SWIPE_EDGE - 4)
    expect(onClick).toHaveBeenCalledTimes(1)
    // A swipe from there opens the sheet, and is no click.
    touch('touchStart', button, 10)
    touch('touchMove', button, 160)
    expect(view.getByTestId('sheet')).toBeInTheDocument()
    touch('touchEnd', button, 160)
    expect(onClick).toHaveBeenCalledTimes(1)
    // Further in: left alone.
    expect(touch('touchStart', view.getByTestId('page'), 100)).toBe(true)
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
