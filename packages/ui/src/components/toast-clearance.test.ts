import { describe, expect, it } from 'vitest'
import { bottomBarClearance, TOAST_BAR_GAP } from './toast-clearance'

describe('bottomBarClearance', () => {
  it('is 0 without a bar', () => {
    expect(bottomBarClearance([], 812)).toBe(0)
  })

  it('puts the toasts just above a bar pinned to the bottom', () => {
    // A bar 85px high, 22px above the bottom of an 812px screen.
    expect(bottomBarClearance([{ top: 705, bottom: 790 }], 812)).toBe(
      812 - 705 + TOAST_BAR_GAP,
    )
  })

  it('ignores a bar higher up the page, out of the toasts’ way', () => {
    expect(bottomBarClearance([{ top: 300, bottom: 380 }], 812)).toBe(0)
  })

  it('ignores a bar still below the screen', () => {
    expect(bottomBarClearance([{ top: 900, bottom: 980 }], 812)).toBe(0)
  })

  it('ignores a hidden bar', () => {
    expect(bottomBarClearance([{ top: 0, bottom: 0 }], 812)).toBe(0)
  })

  it('clears the tallest of several bars', () => {
    expect(
      bottomBarClearance(
        [
          { top: 740, bottom: 790 },
          { top: 690, bottom: 790 },
        ],
        812,
      ),
    ).toBe(812 - 690 + TOAST_BAR_GAP)
  })
})
