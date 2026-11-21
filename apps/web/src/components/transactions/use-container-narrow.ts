import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Whether an element is narrower than `width` px, followed as it resizes.
 * The layout itself switches with container queries; this only says when
 * to render what a narrow toolbar needs and asks the API for (the count
 * down of Opérations' filters, #406). False until measured, and where
 * `ResizeObserver` is missing (server, tests).
 */
export function useContainerNarrow(
  ref: RefObject<HTMLElement | null>,
  width: number,
): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const measure = (size: number) => setNarrow(size > 0 && size < width)
    measure(element.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(-1)
      if (entry) measure(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, width])
  return narrow
}
