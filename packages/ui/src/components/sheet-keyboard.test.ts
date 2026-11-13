import { describe, expect, it } from 'vitest'
import {
  isKeyboardOpen,
  keyboardInset,
  revealEndScrollTop,
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
