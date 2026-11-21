import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Page width (in rem of the app's root) from which Épargne switches to its
 * computer layout (#407, the owner's « A. Rangée de chiffres »): the month
 * as one row of figures, every account and goal as one row. A 1280 px
 * window with the sidebar open is wide; a tablet or a narrower window keeps
 * the phone's cards.
 */
export const WIDE_LAYOUT_REM = 36

/**
 * Whether the element is at least `WIDE_LAYOUT_REM` wide, followed as it
 * resizes (the sidebar folding, the window). False before it is measured
 * and where `ResizeObserver` is missing (tests, server render): the page's
 * data loads in the browser behind a skeleton, so the layout is known
 * before the figures show.
 */
export function useWideLayout(ref: RefObject<HTMLElement | null>): boolean {
  const [wide, setWide] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const fontSize = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    )
    const rem = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16
    const update = (width: number) => setWide(width >= WIDE_LAYOUT_REM * rem)
    update(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(() =>
      update(element.getBoundingClientRect().width),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return wide
}
