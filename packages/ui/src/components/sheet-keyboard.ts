/**
 * On-screen keyboard handling for bottom sheets (pure helpers, see
 * `useKeyboardInset` in `sheet.tsx`).
 */

/**
 * Below this inset the visual viewport is only shrunk by browser chrome
 * (Safari's toolbars collapsing), not by a keyboard.
 */
export const KEYBOARD_OPEN_MIN_PX = 120

/**
 * Room kept under a bottom sheet's content while the keyboard is open. Since
 * iOS 26, the form accessory bar (⌃ ⌄ ✓) floats over the page above the
 * keyboard and is not part of the visual viewport, and in a Safari tab the
 * address pill floats above it too: about 46 + 32 px together.
 */
export const KEYBOARD_ACCESSORY_ALLOWANCE_PX = 84

/** Height of the keyboard over the layout viewport, 0 when none. */
export function keyboardInset(
  innerHeight: number,
  viewport: { height: number; offsetTop: number },
): number {
  return Math.max(
    0,
    Math.round(innerHeight - viewport.height - viewport.offsetTop),
  )
}

export function isKeyboardOpen(inset: number): boolean {
  return inset >= KEYBOARD_OPEN_MIN_PX
}

/** Space kept above the top of the focused field when scrolling. */
const FOCUS_MARGIN_PX = 16

/**
 * Scroll position of a scrollable sheet that brings its end (where the
 * actions are) into view, without scrolling the focused field out of the top.
 * `focusTop` is the field's top relative to the sheet's visible top.
 */
export function revealEndScrollTop({
  scrollTop,
  scrollHeight,
  clientHeight,
  focusTop,
}: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  focusTop: number
}): number {
  const end = Math.max(0, scrollHeight - clientHeight)
  const keepFocus = scrollTop + focusTop - FOCUS_MARGIN_PX
  return Math.max(scrollTop, Math.min(end, keepFocus))
}
