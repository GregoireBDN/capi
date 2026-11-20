import { describe, expect, it } from 'vitest'
import { swipeDirection } from './month-swipe'

describe('swipeDirection', () => {
  it('reads a quick sideways swipe', () => {
    expect(swipeDirection({ dx: 120, dy: 10, duration: 200 })).toBe('previous')
    expect(swipeDirection({ dx: -90, dy: -20, duration: 300 })).toBe('next')
  })

  it('ignores taps, scrolls, slanting and slow drags', () => {
    // Too short.
    expect(swipeDirection({ dx: 30, dy: 0, duration: 100 })).toBeNull()
    // Mostly vertical: a scroll.
    expect(swipeDirection({ dx: 80, dy: 60, duration: 200 })).toBeNull()
    // Slow: reading or selecting.
    expect(swipeDirection({ dx: 200, dy: 0, duration: 900 })).toBeNull()
  })
})
