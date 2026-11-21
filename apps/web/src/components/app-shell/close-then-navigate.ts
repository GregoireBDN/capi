import type { MouseEvent } from 'react'
import { flushSync } from 'react-dom'

/**
 * Set on `<html>` while the phone's navigation sheet closes for a link:
 * `globals.css` drops the sheet's closing animation, so it is gone at once.
 */
export const INSTANT_CLOSE_ATTRIBUTE = 'data-sheet-instant-close'

/** Whether a click opens the link elsewhere (a new tab or window). */
function opensElsewhere(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
}

/**
 * A link of the phone's navigation sheet (#419): the sheet is closed, at
 * once and painted, **before** the page changes. Safari keeps a picture of a
 * page as it was when it was left and shows it during its back swipe (the
 * sideways swipe from the screen's left edge, the same move as the month
 * swipe's « mois précédent »): with the sheet still open when the link
 * pushed the new page, every back swipe drew the sidebar opening. Not for
 * a click that opens the link elsewhere, nor one already handled.
 */
export function closeSheetThenNavigate(
  event: MouseEvent<HTMLAnchorElement>,
  close: () => void,
  navigate: (href: string) => void,
): void {
  const href = event.currentTarget.getAttribute('href')
  if (event.defaultPrevented || opensElsewhere(event) || !href) {
    close()
    return
  }
  // The router's own handling stops here: it would push the page now.
  event.preventDefault()
  const root = document.documentElement
  root.setAttribute(INSTANT_CLOSE_ATTRIBUTE, '')
  flushSync(close)
  // Two frames: the sheet's removal is painted before the page changes.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      root.removeAttribute(INSTANT_CLOSE_ATTRIBUTE)
      navigate(href)
    }),
  )
}
