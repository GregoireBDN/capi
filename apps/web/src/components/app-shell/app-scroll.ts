/**
 * The page's scrolling area (#418): the header stays out of it, so the
 * signed-in pages scroll inside this element, not the document. Outside the
 * shell (component tests, `/auth`) the window scrolls as usual.
 */
export const APP_SCROLL_ID = 'app-scroll'

/** The shell's scrolling area, or null outside the shell. */
export function appScroller(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById(APP_SCROLL_ID)
}

/** How far the page is scrolled down, in px. */
export function appScrollTop(): number {
  const scroller = appScroller()
  return scroller ? scroller.scrollTop : window.scrollY
}

/** Scrolls the page (the shell's area, else the window). */
export function scrollAppTo(options: ScrollToOptions) {
  const scroller = appScroller()
  if (scroller && typeof scroller.scrollTo === 'function') {
    scroller.scrollTo(options)
  } else {
    window.scrollTo(options)
  }
}

/** Scrolls the page down by `dy` px (up when negative). */
export function scrollAppBy(dy: number) {
  const scroller = appScroller()
  if (scroller) scroller.scrollTop += dy
  else window.scrollBy(0, dy)
}

/** The top and bottom of the visible part of the page, in client px. */
export function appViewportEdges(): { top: number; bottom: number } {
  const scroller = appScroller()
  if (!scroller) return { top: 0, bottom: window.innerHeight }
  const rect = scroller.getBoundingClientRect()
  return { top: rect.top, bottom: rect.bottom }
}
