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

/**
 * The same room in the installed app (home screen PWA): no address pill,
 * only the accessory bar (keeping 84px there left an empty band, #205).
 */
export const KEYBOARD_ACCESSORY_ALLOWANCE_STANDALONE_PX = 50

/** Room to keep for what floats over the page above the keyboard. */
export function keyboardAccessoryAllowance(standalone: boolean): number {
  return standalone
    ? KEYBOARD_ACCESSORY_ALLOWANCE_STANDALONE_PX
    : KEYBOARD_ACCESSORY_ALLOWANCE_PX
}

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
 * Scroll position of a scrollable sheet (or of the body that scrolls inside
 * it) that brings its end (where the actions are when they scroll with the
 * content) into view, without scrolling the focused field out of the top.
 * `focusTop` is the field's top relative to the scroller's visible top. A
 * field already scrolled above the top is brought back into view.
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
  if (focusTop < 0) return Math.max(0, scrollTop + focusTop - FOCUS_MARGIN_PX)
  const end = Math.max(0, scrollHeight - clientHeight)
  const keepFocus = scrollTop + focusTop - FOCUS_MARGIN_PX
  return Math.max(scrollTop, Math.min(end, keepFocus))
}

/**
 * Scroll position of a full-screen editor's body (#385) that brings the
 * focused field out from under the keyboard, and nothing else: a field
 * already in view leaves the body where it is, so the keyboard opening moves
 * nothing on screen. `focusTop` / `focusBottom` are the field's edges and
 * `visibleHeight` the height of the body left above the keyboard (and its
 * accessory bar), all relative to the body's visible top.
 */
export function revealFieldScrollTop({
  scrollTop,
  focusTop,
  focusBottom,
  visibleHeight,
}: {
  scrollTop: number
  focusTop: number
  focusBottom: number
  visibleHeight: number
}): number {
  if (focusTop < 0) return Math.max(0, scrollTop + focusTop - FOCUS_MARGIN_PX)
  const overflow = focusBottom + FOCUS_MARGIN_PX - visibleHeight
  if (overflow <= 0) return scrollTop
  // A field taller than what is left (a textarea): its top stays in view.
  return scrollTop + Math.min(overflow, Math.max(0, focusTop - FOCUS_MARGIN_PX))
}

/** What `scrollParentWithin` reads from an element. */
export interface ScrollBox {
  parentElement: ScrollBox | null
  scrollHeight: number
  clientHeight: number
}

/**
 * The element that scrolls `field` vertically inside `container`: its
 * nearest ancestor (or `container` itself) that can scroll, or null.
 * `overflowY` reads an element's computed `overflow-y`.
 */
export function scrollParentWithin<T extends ScrollBox>(
  field: T,
  container: T,
  overflowY: (element: T) => string = (element) =>
    getComputedStyle(element as unknown as Element).overflowY,
): T | null {
  let element = field.parentElement as T | null
  while (element) {
    const overflow = overflowY(element)
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      element.scrollHeight > element.clientHeight
    ) {
      return element
    }
    if (element === container) return null
    element = element.parentElement as T | null
  }
  return null
}
