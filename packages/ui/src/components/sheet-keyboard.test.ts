import { describe, expect, it } from 'vitest'
import {
  isKeyboardOpen,
  keyboardAccessoryAllowance,
  keyboardInset,
  revealEndScrollTop,
  revealFieldScrollTop,
  scrollParentWithin,
} from './sheet-keyboard'

describe('keyboardInset', () => {
  it('is 0 without a keyboard', () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0)
  })

  it('is the height the keyboard takes from the visual viewport', () => {
    expect(keyboardInset(844, { height: 426.4, offsetTop: 0 })).toBe(418)
  })

  it('leaves out how far the visual viewport is scrolled down', () => {
    expect(keyboardInset(844, { height: 426, offsetTop: 100 })).toBe(318)
  })

  it('is never negative', () => {
    expect(keyboardInset(800, { height: 844, offsetTop: 0 })).toBe(0)
  })
})

describe('isKeyboardOpen', () => {
  it('ignores the small insets of collapsing browser toolbars', () => {
    expect(isKeyboardOpen(0)).toBe(false)
    expect(isKeyboardOpen(60)).toBe(false)
  })

  it('is true for a keyboard', () => {
    expect(isKeyboardOpen(300)).toBe(true)
  })
})

describe('revealEndScrollTop', () => {
  it('scrolls to the end when the focused field stays visible', () => {
    expect(
      revealEndScrollTop({
        scrollTop: 0,
        scrollHeight: 600,
        clientHeight: 420,
        focusTop: 250,
      }),
    ).toBe(180)
  })

  it('stops so that the focused field stays at the top', () => {
    expect(
      revealEndScrollTop({
        scrollTop: 0,
        scrollHeight: 900,
        clientHeight: 420,
        focusTop: 116,
      }),
    ).toBe(100)
  })

  it('never scrolls back up', () => {
    expect(
      revealEndScrollTop({
        scrollTop: 200,
        scrollHeight: 900,
        clientHeight: 420,
        focusTop: 5,
      }),
    ).toBe(200)
  })

  it('brings back a field scrolled above the top (#205)', () => {
    // The keyboard shrank the body that scrolls under a sticky footer: the
    // amount field, first in it, is partly above the visible top.
    expect(
      revealEndScrollTop({
        scrollTop: 300,
        scrollHeight: 900,
        clientHeight: 200,
        focusTop: -40,
      }),
    ).toBe(244)
    expect(
      revealEndScrollTop({
        scrollTop: 10,
        scrollHeight: 900,
        clientHeight: 200,
        focusTop: -40,
      }),
    ).toBe(0)
  })

  it('stays put when nothing scrolls', () => {
    expect(
      revealEndScrollTop({
        scrollTop: 0,
        scrollHeight: 400,
        clientHeight: 420,
        focusTop: 200,
      }),
    ).toBe(0)
  })
})

describe('keyboardAccessoryAllowance', () => {
  it('keeps room for the accessory bar and the address pill in Safari', () => {
    expect(keyboardAccessoryAllowance(false)).toBe(84)
  })

  it('keeps room for the accessory bar only in the installed app (#205)', () => {
    expect(keyboardAccessoryAllowance(true)).toBe(50)
  })
})

describe('scrollParentWithin', () => {
  type Box = {
    name: string
    parentElement: Box | null
    scrollHeight: number
    clientHeight: number
    overflowY: string
  }
  const box = (
    name: string,
    parentElement: Box | null,
    overflowY: string,
    scrollHeight = 100,
    clientHeight = 100,
  ): Box => ({ name, parentElement, overflowY, scrollHeight, clientHeight })
  const overflow = (element: Box) => element.overflowY

  it('finds the body that scrolls inside the sheet (sticky footer)', () => {
    const page = box('page', null, 'auto', 2000, 800)
    const sheet = box('sheet', page, 'hidden', 300, 300)
    const body = box('body', box('form', sheet, 'visible'), 'auto', 600, 200)
    const field = box('amount', box('label', body, 'visible'), 'visible')
    expect(scrollParentWithin(field, sheet, overflow)?.name).toBe('body')
  })

  it('falls back to the sheet when it is what scrolls', () => {
    const sheet = box('sheet', null, 'auto', 700, 300)
    const field = box('amount', box('form', sheet, 'visible'), 'visible')
    expect(scrollParentWithin(field, sheet, overflow)?.name).toBe('sheet')
  })

  it('never looks past the sheet, and is null when nothing overflows', () => {
    const page = box('page', null, 'auto', 2000, 800)
    const sheet = box('sheet', page, 'auto', 300, 300)
    const body = box('body', sheet, 'auto', 200, 200)
    const field = box('amount', body, 'visible')
    expect(scrollParentWithin(field, sheet, overflow)).toBeNull()
  })
})

describe('revealFieldScrollTop', () => {
  it('leaves a field already above the keyboard where it is', () => {
    expect(
      revealFieldScrollTop({
        scrollTop: 0,
        focusTop: 120,
        focusBottom: 164,
        visibleHeight: 400,
      }),
    ).toBe(0)
  })

  it('scrolls a field hidden by the keyboard just above it', () => {
    expect(
      revealFieldScrollTop({
        scrollTop: 40,
        focusTop: 500,
        focusBottom: 544,
        visibleHeight: 400,
      }),
    ).toBe(40 + 544 + 16 - 400)
  })

  it('keeps the top of a field taller than the room left in view', () => {
    expect(
      revealFieldScrollTop({
        scrollTop: 0,
        focusTop: 300,
        focusBottom: 800,
        visibleHeight: 400,
      }),
    ).toBe(300 - 16)
  })

  it('brings back a field scrolled above the top', () => {
    expect(
      revealFieldScrollTop({
        scrollTop: 200,
        focusTop: -50,
        focusBottom: -6,
        visibleHeight: 400,
      }),
    ).toBe(200 - 50 - 16)
  })
})
