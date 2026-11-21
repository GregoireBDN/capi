import { useEffect, useRef } from 'react'

/** Least sideways travel of a swipe, in px. */
export const SWIPE_MIN_DISTANCE = 64
/** A swipe takes less than this, in ms (a slow drag reads text). */
export const SWIPE_MAX_DURATION = 600
/**
 * Touches starting this close to a screen edge are the system's: Safari's
 * back and forward swipes (#419). iOS takes them from a little over 20pt in;
 * a margin of a touch target keeps a month swipe from starting in that band.
 */
export const SWIPE_EDGE = 44

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

/**
 * Where a swipe must not change the month: a field, a dialog or popover, a
 * slider, a chart, the app's frame (the header and the sidebar, #419) and
 * anything marked `data-no-swipe` (a strip with its own swipe).
 */
const IGNORED = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="dialog"]',
  '[role="slider"]',
  '[data-radix-popper-content-wrapper]',
  '[data-no-swipe]',
  '[data-app-header]',
  '[data-sidebar]',
  '.recharts-wrapper',
].join(', ')

/** Whether a `touch-action` leaves sideways moves to the page. */
function pansSideways(touchAction: string): boolean {
  return (
    touchAction === '' ||
    touchAction === 'auto' ||
    touchAction === 'manipulation' ||
    touchAction.includes('pan-x')
  )
}

/**
 * Whether an element, or one around it, takes sideways moves for itself:
 * it scrolls sideways (a strip, a table, a row of chips) or its
 * `touch-action` keeps them from the page (`touch-pan-y`, `touch-none`: a
 * swipe or a drag of its own, like the day strip or a rule being moved).
 */
function ownsSidewaysMoves(element: Element | null): boolean {
  for (let node = element; node && node !== document.body; ) {
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node)
      if (!pansSideways(style.touchAction)) return true
      if (
        node.scrollWidth > node.clientWidth &&
        (style.overflowX === 'auto' || style.overflowX === 'scroll')
      ) {
        return true
      }
    }
    node = node.parentElement
  }
  return false
}

/**
 * Whether a touch starting at `x` on `target` may become a month swipe (#419):
 * not from the screen's edges (Safari's back and forward swipes), not from
 * the app's frame or anything with a sideways gesture of its own, and not
 * while a panel is open.
 */
export function swipeMayStart(
  target: Element | null,
  x: number,
  viewportWidth: number,
): boolean {
  if (x < SWIPE_EDGE || x > viewportWidth - SWIPE_EDGE) return false
  if (target?.closest(IGNORED)) return false
  if (document.querySelector('[role="dialog"]')) return false
  return !ownsSidewaysMoves(target)
}

/**
 * Swiping the page sideways on a touch screen moves the month (#401): to
 * the right the month before, to the left the next one, where
 * `swipeMayStart` allows it.
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
      if (!swipeMayStart(target, touch.clientX, window.innerWidth)) return
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
