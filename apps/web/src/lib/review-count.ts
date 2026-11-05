import { useEffect, useSyncExternalStore } from 'react'
import { transactionsControllerReviewCount } from '#/api'

/**
 * Size of the review queue, shared by the sidebar badge and the review page.
 * A tiny client-side store: the page adjusts it optimistically after each
 * correction and schedules a refetch so the badge converges on the server
 * value without one request per click.
 */

let count: number | null = null
const listeners = new Set<() => void>()
let refreshTimer: ReturnType<typeof setTimeout> | undefined

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getReviewCount(): number | null {
  return count
}

export function setReviewCount(value: number) {
  if (value === count) return
  count = Math.max(0, value)
  emit()
}

/** Optimistic change, e.g. `-1` when an item leaves the queue. */
export function adjustReviewCount(delta: number) {
  if (count !== null) setReviewCount(count + delta)
}

export async function refreshReviewCount(): Promise<void> {
  clearTimeout(refreshTimer)
  const { data } = await transactionsControllerReviewCount({
    throwOnError: false,
  })
  if (data) setReviewCount(data.count)
}

/** Refetches the count once changes have settled (debounced). */
export function scheduleReviewCountRefresh(delayMs = 1000) {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => void refreshReviewCount(), delayMs)
}

/** Test helper: forget the cached count. */
export function resetReviewCount() {
  clearTimeout(refreshTimer)
  count = null
  emit()
}

/** Current queue size (null until known); fetched once on mount. */
export function useReviewCount(): number | null {
  const value = useSyncExternalStore(subscribe, getReviewCount, () => null)
  useEffect(() => {
    void refreshReviewCount()
  }, [])
  return value
}
