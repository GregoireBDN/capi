import { useEffect, useRef } from 'react'

/** Least sideways travel of a swipe, in px. */
export const SWIPE_MIN_DISTANCE = 64
/** A swipe takes less than this, in ms (a slow drag reads text). */
export const SWIPE_MAX_DURATION = 600
/** Touches starting this close to a screen edge are the system's (iOS back). */
export const SWIPE_EDGE = 24

export interface SwipeTrack {
  dx: number
  dy: number
  /** ms */
  duration: number
}

/**
 * The month a finished touch moves to: `previous` for a swipe to the right
 * (the page before slides in), `next` to the left, null for anything else
 * (a tap, a scroll, a slow or slanting drag).
 */
export function swipeDirection({
  dx,
  dy,
  duration,
}: SwipeTrack): 'previous' | 'next' | null {
  if (duration > SWIPE_MAX_DURATION) return null
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null
  // Mostly sideways: a vertical scroll with some drift is not a swipe.
  if (Math.abs(dy) * 2 > Math.abs(dx)) return null
  return dx > 0 ? 'previous' : 'next'
}

/** Where a swipe must not change the month. */
const IGNORED =
  'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="slider"], [data-radix-popper-content-wrapper], [data-no-swipe], .recharts-wrapper'

/** Whether an element, or one around it, scrolls sideways (a strip, a table). */
function scrollsSideways(element: Element | null): boolean {
  for (let node = element; node && node !== document.body; ) {
    if (node instanceof HTMLElement && node.scrollWidth > node.clientWidth) {
      const overflow = getComputedStyle(node).overflowX
      if (overflow === 'auto' || overflow === 'scroll') return true
    }
    node = node.parentElement
  }
  return false
}

/**
 * Swiping the page sideways on a touch screen moves the month (#401): to
 * the right the month before, to the left the next one. Not from a field,
 * a dialog or popover, a chart, something that scrolls sideways, nor while
 * a panel is open, and not from the screen's edges (the system's gestures).
 */
export function useMonthSwipe(
  enabled: boolean,
  onSwipe: (direction: 'previous' | 'next') => void,
) {
  const latest = useRef(onSwipe)
  latest.current = onSwipe

  useEffect(() => {
    if (!enabled) return
    let start: { x: number; y: number; at: number } | null = null

    const onStart = (event: TouchEvent) => {
      start = null
      // A list of one touch (a plain array in tests).
      const touch = event.touches[0] as Touch | undefined
      if (event.touches.length !== 1 || !touch) return
      const target = event.target instanceof Element ? event.target : null
      if (
        touch.clientX < SWIPE_EDGE ||
        touch.clientX > window.innerWidth - SWIPE_EDGE ||
        target?.closest(IGNORED) ||
        document.querySelector('[role="dialog"]') ||
        scrollsSideways(target)
      ) {
        return
      }
      start = { x: touch.clientX, y: touch.clientY, at: event.timeStamp }
    }
    const onEnd = (event: TouchEvent) => {
      const from = start
      start = null
      const touch = event.changedTouches[0] as Touch | undefined
      if (!from || !touch) return
      const direction = swipeDirection({
        dx: touch.clientX - from.x,
        dy: touch.clientY - from.y,
        duration: event.timeStamp - from.at,
      })
      if (direction) latest.current(direction)
    }
    const onCancel = () => {
      start = null
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onCancel)
    }
  }, [enabled])
}
