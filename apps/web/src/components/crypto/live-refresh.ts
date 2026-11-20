import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

/*
 * Stored values first, live values second (#381). The crypto reads
 * (`GET /crypto/portfolio`, `GET /accounts/:id/holdings`) answer from the
 * database only and say `refreshDue` when a price is older than the cache
 * TTL or a wallet is due a sync. Once they are on screen, the page fires the
 * live step (`mode=auto`), which only does what is due, and puts its answer
 * in the cache: the figures change in place, nothing goes back to a
 * skeleton.
 */

/** The live step of one page (`portfolio`, or an account id). */
export function liveRefreshKey(target: string) {
  return ['crypto', 'live', target] as const
}

/** The same page fires the live step again at most this often. */
export const LIVE_REFRESH_MIN_INTERVAL_MS = 30_000

/**
 * Fires `run` once the stored data says a live refresh is due, then writes
 * its answer into `queryKey`. Silent: a failure leaves the stored values
 * and their stale notes, never an error. Returns whether it is running.
 */
export function useLiveRefresh<T extends { refreshDue: boolean }>({
  target,
  queryKey,
  data,
  run,
}: {
  target: string
  queryKey: QueryKey
  data: T | undefined
  run: () => Promise<T>
}): boolean {
  const queryClient = useQueryClient()
  const lastRun = useRef(0)
  const { mutate, isPending } = useMutation({
    mutationKey: liveRefreshKey(target),
    mutationFn: run,
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKey, result)
      // The other valued crypto reads (portfolio, holdings) may show what
      // just changed: marked stale, read again when shown.
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'crypto' &&
          (query.queryKey[1] === 'portfolio' ||
            query.queryKey[1] === 'holdings') &&
          JSON.stringify(query.queryKey) !== JSON.stringify(queryKey),
      })
    },
    // The request itself failed: the stored values stay, now said stale
    // like a failed price refresh (the next read asks again).
    onError: () => {
      queryClient.setQueryData<T>(queryKey, (current) =>
        current
          ? { ...current, refreshDue: false, refreshFailed: true }
          : current,
      )
    },
  })
  const due = data?.refreshDue ?? false
  useEffect(() => {
    if (!due || isPending) return
    const now = Date.now()
    if (now - lastRun.current < LIVE_REFRESH_MIN_INTERVAL_MS) return
    lastRun.current = now
    mutate()
  }, [due, data, isPending, mutate])
  return isPending
}

/** Whether a page's live step is running, from anywhere on the page. */
export function useLiveRefreshing(target: string): boolean {
  return useIsMutating({ mutationKey: liveRefreshKey(target) }) > 0
}

/**
 * Whether the stored prices are still waiting for the live step (running,
 * or about to): their staleness is not news yet, so it is not said; the
 * in-place « Actualisation… » line stands for it. Said once the live step
 * failed or found nothing to ask.
 */
export function pricesSettling(
  data: { refreshDue: boolean },
  refreshing: boolean,
): boolean {
  return refreshing || data.refreshDue
}

/** « Cours non actualisés » is worth saying. */
export function staleShown(
  data: {
    refreshDue: boolean
    refreshFailed: boolean
    totals: { staleCount: number }
  },
  refreshing: boolean,
): boolean {
  if (refreshing) return false
  return data.refreshFailed || (data.totals.staleCount > 0 && !data.refreshDue)
}

/** Polls a read while a wallet sync goes on in the background. */
export const SYNC_POLL_MS = 3_000
