import { afterEach, describe, expect, it } from 'vitest'
import { SWIPE_EDGE, swipeMayStart } from './month-swipe'

const WIDTH = 390

function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body
}

describe('swipeMayStart (#419)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('takes a touch in the middle of the page', () => {
    mount('<main><p id="t">Texte</p></main>')
    expect(swipeMayStart(document.getElementById('t'), 200, WIDTH)).toBe(true)
  })

  it('leaves the screen edges to Safari (back and forward swipes)', () => {
    mount('<main><p id="t">Texte</p></main>')
    const target = document.getElementById('t')
    expect(swipeMayStart(target, 10, WIDTH)).toBe(false)
    expect(swipeMayStart(target, SWIPE_EDGE - 1, WIDTH)).toBe(false)
    expect(swipeMayStart(target, WIDTH - 10, WIDTH)).toBe(false)
    expect(swipeMayStart(target, WIDTH - SWIPE_EDGE + 1, WIDTH)).toBe(false)
    expect(swipeMayStart(target, SWIPE_EDGE, WIDTH)).toBe(true)
  })

  it('leaves the header and the sidebar alone', () => {
    mount(`
      <header data-app-header><button id="menu">☰</button></header>
      <div data-sidebar="sidebar"><a id="link" href="/budget">Budget</a></div>
    `)
    expect(swipeMayStart(document.getElementById('menu'), 200, WIDTH)).toBe(
      false,
    )
    expect(swipeMayStart(document.getElementById('link'), 200, WIDTH)).toBe(
      false,
    )
  })

  it('leaves what has its own sideways gesture', () => {
    mount(`
      <div data-no-swipe><button id="day">12</button></div>
      <div style="touch-action: pan-y"><span id="strip">strip</span></div>
      <div style="touch-action: none"><span id="drag">drag</span></div>
      <div style="touch-action: manipulation"><span id="tap">tap</span></div>
    `)
    const at = (id: string) =>
      swipeMayStart(document.getElementById(id), 200, WIDTH)
    expect(at('day')).toBe(false)
    expect(at('strip')).toBe(false)
    expect(at('drag')).toBe(false)
    expect(at('tap')).toBe(true)
  })

  it('leaves what scrolls sideways (chips, tables)', () => {
    mount(
      '<div id="row" style="overflow-x: auto"><span id="chip">chip</span></div>',
    )
    const row = document.getElementById('row')!
    Object.defineProperty(row, 'scrollWidth', { value: 800 })
    Object.defineProperty(row, 'clientWidth', { value: 390 })
    expect(swipeMayStart(document.getElementById('chip'), 200, WIDTH)).toBe(
      false,
    )
  })

  it('leaves fields and an open panel alone', () => {
    mount(`
      <input id="field" />
      <p id="text">Texte</p>
      <div role="dialog"><p>Menu</p></div>
    `)
    expect(swipeMayStart(document.getElementById('field'), 200, WIDTH)).toBe(
      false,
    )
    // A panel open anywhere (the sidebar sheet, a dialog).
    expect(swipeMayStart(document.getElementById('text'), 200, WIDTH)).toBe(
      false,
    )
  })
})
