import { useEffect, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'

/** Navigations shorter than this show nothing, so fast ones don't flash. */
export const NAVIGATION_PROGRESS_DELAY_MS = 200

/**
 * Thin bar at the top of the screen while a navigation is pending (route
 * guards and loaders running), so a tap on a slow or offline network doesn't
 * look ignored.
 */
export function NavigationProgress() {
  // `isLoading`, not `status === 'pending'`: when a guard fails, the child
  // match stays "pending" under the error component and `status` with it.
  const pending = useRouterState({ select: (s) => s.isLoading })
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!pending) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => {
      setVisible(true)
    }, NAVIGATION_PROGRESS_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [pending])

  if (!visible) return null

  return (
    <div
      role="progressbar"
      aria-label="Chargement de la page"
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-[100] h-[3px] animate-pulse bg-primary"
    />
  )
}
