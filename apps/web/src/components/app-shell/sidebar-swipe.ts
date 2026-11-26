import { useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'

/**
 * Swiping the phone's navigation sheet open and closed (#446, the owner:
 * the sidebar opens without tapping ☰, and the sheet follows the finger;
 * the owner again: a slanting swipe still opens it, the sheet follows the
 * finger both ways until it is let go, even with reduced motion, and the
 * installed app never goes back a page on a swipe from its edge).
 * A swipe to the right anywhere on the page opens it, a swipe to the left on
 * the open sheet (or its backdrop) closes it; on release it settles open or
 * shut with the curve of the sheet's own animation (`@capi/ui`
 * `globals.css`, `--sidebar-sheet-duration` / `--sidebar-sheet-ease`).
 */

/**
 * Touches starting this close to the left edge of a Safari tab are Safari's
 * back swipe; in the installed app the edge is ours (#419, `BACK_SWIPE_EDGE`).
 */
export const SWIPE_EDGE = 44
/**
 * In the installed app, a touch starting this close to the left edge is kept
 * from iOS (its touchstart is cancelled), which would otherwise take it for
 * its back swipe and go back a page; a tap there is clicked by hand.
 */
export const BACK_SWIPE_EDGE = 24
/** Travel before a touch is read as a swipe or a scroll, in px. */
export const INTENT_DISTANCE = 10
/**
 * How much more sideways than vertical a swipe goes: 1 takes anything
 * within 45° of horizontal, so a slanting swipe still opens the sheet while a
 * scroll (steeper than 45°) never does.
 */
const SIDEWAYS_RATIO = 1
/** A release this fast (px/ms) settles the way it moves, however far. */
export const FLING_VELOCITY = 0.3
/** Set on `<html>` while a swipe drives the sheet: no keyframe animation. */
export const GESTURE_ATTRIBUTE = 'data-sheet-gesture'
/** Set on the sheet and its backdrop once a swipe opened them. */
const GESTURE_OPENED = 'data-gesture-opened'

/**
 * What a touch that moved `dx`, `dy` turns into: a sideways swipe, a scroll
 * (vertical, the page's), or not yet known.
 */
export function swipeIntent(
  dx: number,
  dy: number,
): 'sideways' | 'vertical' | null {
  if (Math.hypot(dx, dy) < INTENT_DISTANCE) return null
  return Math.abs(dx) >= Math.abs(dy) * SIDEWAYS_RATIO ? 'sideways' : 'vertical'
}

/** How open the sheet is (0 shut, 1 open) under a finger. */
export function dragProgress(
  dx: number,
  width: number,
  from: 'shut' | 'open',
): number {
  if (width <= 0) return from === 'open' ? 1 : 0
  const progress = (from === 'open' ? width + dx : dx) / width
  return Math.min(1, Math.max(0, progress))
}

/**
 * Whether the sheet ends open once released: a fling settles the way it
 * goes (`velocity` in px/ms, positive towards open), otherwise past half way.
 */
export function settlesOpen(progress: number, velocity: number): boolean {
  if (velocity >= FLING_VELOCITY) return true
  if (velocity <= -FLING_VELOCITY) return false
  return progress >= 0.5
}

/**
 * Where a swipe must not open the sheet: a field, a dialog or popover, a
 * slider, a chart, and anything marked `data-no-swipe`.
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
 * Whether a touch starting at `x` on `target` may swipe the sheet open: not
 * from the left edge of a Safari tab (its back swipe; `edgeIsFree` in the
 * installed app), not from anything with a sideways gesture of its own, and
 * not while a panel is open.
 */
export function swipeMayStart(
  target: Element | null,
  x: number,
  edgeIsFree = false,
): boolean {
  if (!edgeIsFree && x < SWIPE_EDGE) return false
  if (target?.closest(IGNORED)) return false
  if (document.querySelector('[role="dialog"]')) return false
  return !ownsSidewaysMoves(target)
}

/** Whether the page runs as the installed app (no Safari back swipe). */
function runsStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
}

/** The phone's navigation sheet and its backdrop, while mounted. */
function sheetParts(): {
  sheet: HTMLElement
  overlay: HTMLElement | null
} | null {
  const sheet = document.querySelector<HTMLElement>(
    '[data-slot="sidebar"][data-mobile="true"]',
  )
  if (!sheet) return null
  const before = sheet.previousElementSibling
  const overlay =
    before instanceof HTMLElement && before.dataset.slot === 'sheet-overlay'
      ? before
      : null
  return { sheet, overlay }
}

/**
 * Clicks what a tap kept from iOS at the installed app's edge touched (its
 * touchstart was cancelled, so the browser sends no click): a field gets the
 * focus, anything else a click.
 */
export function tap(target: Element | null, x: number, y: number) {
  if (!target) return
  const field = target.closest<HTMLElement>(
    'input, textarea, select, [contenteditable="true"]',
  )
  if (field) {
    field.focus()
    return
  }
  // Bubbles like a real one (an icon inside a button or a link included).
  target.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    }),
  )
}

/** Draws the sheet `progress` open, following the finger (no transition). */
function draw(
  parts: { sheet: HTMLElement; overlay: HTMLElement | null },
  progress: number,
  transition = false,
) {
  const timing = transition
    ? 'var(--sidebar-sheet-duration) var(--sidebar-sheet-ease)'
    : null
  parts.sheet.style.transition = timing ? `transform ${timing}` : 'none'
  parts.sheet.style.transform = `translateX(${(progress - 1) * 100}%)`
  if (parts.overlay) {
    parts.overlay.style.transition = timing ? `opacity ${timing}` : 'none'
    parts.overlay.style.opacity = String(progress)
  }
}

function clear(parts: { sheet: HTMLElement; overlay: HTMLElement | null }) {
  for (const element of [parts.sheet, parts.overlay]) {
    if (!element) continue
    element.style.removeProperty('transition')
    element.style.removeProperty('transform')
    element.style.removeProperty('opacity')
  }
}

interface Drag {
  from: 'shut' | 'open'
  x: number
  y: number
  /** Last point and time, for the release's velocity. */
  lastX: number
  lastAt: number
  velocity: number
  /** Decided: sideways (the sheet follows), or a scroll (ignored). */
  intent: 'sideways' | 'vertical' | null
  width: number
  progress: number
  parts: { sheet: HTMLElement; overlay: HTMLElement | null } | null
  reduced: boolean
}

/** A touch kept from iOS at the installed app's edge, clicked if a tap. */
interface EdgeTouch {
  target: Element | null
  x: number
  y: number
  moved: boolean
}

/**
 * The swipe on phones (below `md`, where the sidebar is a sheet): to the
 * right on the page opens it, to the left on it or its backdrop closes it,
 * the sheet and its backdrop following the finger, back and forth, until it
 * is let go; ☰, its links and a tap on the backdrop are unchanged. Once a
 * touch is read as a swipe the page no longer scrolls under it (its
 * touchmoves are cancelled). With reduced motion the sheet still follows the
 * finger (the finger moves it, nothing is animated) and settles at once.
 */
export function useSidebarSwipe(
  enabled: boolean,
  open: boolean,
  setOpen: (open: boolean) => void,
) {
  const state = useRef({ open, setOpen })
  state.current = { open, setOpen }

  useEffect(() => {
    if (!enabled) return
    const root = document.documentElement
    let drag: Drag | null = null
    let edge: EdgeTouch | null = null
    let settling = false
    const standalone = runsStandalone()

    const onStart = (event: TouchEvent) => {
      drag = null
      edge = null
      const touch = event.touches[0] as Touch | undefined
      if (event.touches.length !== 1 || !touch) return
      if (standalone && touch.clientX < BACK_SWIPE_EDGE && event.cancelable) {
        // iOS's back swipe: cancelled here, before iOS takes the touch.
        event.preventDefault()
        edge = {
          target: event.target instanceof Element ? event.target : null,
          x: touch.clientX,
          y: touch.clientY,
          moved: false,
        }
      }
      if (settling) return
      const target = event.target instanceof Element ? event.target : null
      let from: Drag['from']
      if (state.current.open) {
        // Closing: from the sheet or its backdrop.
        const parts = sheetParts()
        if (
          !parts ||
          !target ||
          !(
            parts.sheet.contains(target) ||
            (parts.overlay?.contains(target) ?? false)
          ) ||
          target.closest('input, textarea, select, [data-no-swipe]')
        ) {
          return
        }
        from = 'open'
      } else {
        if (!swipeMayStart(target, touch.clientX, standalone)) return
        from = 'shut'
      }
      drag = {
        from,
        x: touch.clientX,
        y: touch.clientY,
        lastX: touch.clientX,
        lastAt: event.timeStamp,
        velocity: 0,
        intent: null,
        width: 0,
        progress: from === 'open' ? 1 : 0,
        parts: null,
        reduced: prefersReducedMotion(),
      }
    }

    const begin = (current: Drag) => {
      if (current.from === 'shut') {
        root.setAttribute(GESTURE_ATTRIBUTE, '')
        // Mounted now, then drawn shut before anything is painted.
        flushSync(() => state.current.setOpen(true))
      }
      const parts = sheetParts()
      if (!parts) return
      current.parts = parts
      current.width = parts.sheet.getBoundingClientRect().width
      draw(parts, current.progress)
    }

    const onMove = (event: TouchEvent) => {
      const current = drag
      const touch = event.touches[0] as Touch | undefined
      if (edge && touch && !edge.moved) {
        edge.moved =
          Math.hypot(touch.clientX - edge.x, touch.clientY - edge.y) >=
          INTENT_DISTANCE
      }
      if (!current || !touch) return
      const dx = touch.clientX - current.x
      const dy = touch.clientY - current.y
      if (!current.intent) {
        current.intent = swipeIntent(dx, dy)
        if (!current.intent) return
        // Towards the way it can go: right to open, left to close.
        const towards = current.from === 'shut' ? dx > 0 : dx < 0
        if (current.intent !== 'sideways' || !towards) {
          drag = null
          return
        }
        begin(current)
      }
      // A swipe: the page must not scroll under it (nor iOS take it).
      if (event.cancelable) event.preventDefault()
      const at = event.timeStamp
      if (at > current.lastAt) {
        current.velocity =
          (touch.clientX - current.lastX) / (at - current.lastAt)
      }
      current.lastX = touch.clientX
      current.lastAt = at
      if (current.parts) {
        current.progress = dragProgress(dx, current.width, current.from)
        draw(current.parts, current.progress)
      }
    }

    const finish = (parts: Drag['parts'], ends: boolean) => {
      settling = false
      if (!parts) return
      if (ends) {
        // Already off screen: shut at once, without the closing animation.
        root.setAttribute(GESTURE_ATTRIBUTE, '')
        flushSync(() => state.current.setOpen(false))
        root.removeAttribute(GESTURE_ATTRIBUTE)
        return
      }
      // Open: the opening animation must not play once the swipe is over.
      parts.sheet.setAttribute(GESTURE_OPENED, '')
      parts.overlay?.setAttribute(GESTURE_OPENED, '')
      root.removeAttribute(GESTURE_ATTRIBUTE)
      clear(parts)
    }

    const onEnd = (event: TouchEvent) => {
      const current = drag
      const kept = edge
      drag = null
      edge = null
      if (kept && !kept.moved && event.touches.length === 0) {
        tap(kept.target, kept.x, kept.y)
      }
      if (!current || current.intent !== 'sideways') return
      const parts = current.parts
      if (!parts) return
      // Velocity towards open: to the right.
      const opens = settlesOpen(current.progress, current.velocity)
      if (current.reduced) {
        // Where it settles, at once.
        finish(parts, !opens)
        return
      }
      settling = true
      draw(parts, opens ? 1 : 0, true)
      let done = false
      const end = () => {
        if (done) return
        done = true
        parts.sheet.removeEventListener('transitionend', onTransitionEnd)
        finish(parts, !opens)
      }
      const onTransitionEnd = (transition: TransitionEvent) => {
        if (transition.target === parts.sheet) end()
      }
      parts.sheet.addEventListener('transitionend', onTransitionEnd)
      // When nothing moves (already there), no transition ends.
      window.setTimeout(end, 600)
    }

    const onCancel = () => {
      const current = drag
      drag = null
      edge = null
      if (!current?.parts) return
      settling = true
      draw(current.parts, current.from === 'open' ? 1 : 0, true)
      window.setTimeout(
        () => finish(current.parts, current.from === 'shut'),
        400,
      )
    }

    // Not passive: an edge touch in the installed app and a swipe's moves
    // are cancelled (nothing else is).
    document.addEventListener('touchstart', onStart, { passive: false })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onCancel)
      root.removeAttribute(GESTURE_ATTRIBUTE)
    }
  }, [enabled])
}
