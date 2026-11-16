import { useSyncExternalStore } from 'react'

const subscribe = () => () => undefined

/**
 * False while the page is server-rendered and during hydration, true once
 * React runs the component on the client (then always true).
 *
 * Forms that take a password are server-rendered: until hydration, pressing
 * Enter or the submit button would submit them natively. They declare
 * `method="post"` (never fields in the URL) and keep their submit button
 * disabled until this is true, so an early tap sends nothing (#203).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
