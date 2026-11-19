import { useCallback, useSyncExternalStore } from 'react'
import {
  signedCents,
  splitSignedCents,
} from '#/components/amount/signed-amount'
import type { AmountSign } from '#/components/amount/signed-amount'

/**
 * Low-balance threshold of the forecast: a per-browser convenience kept in
 * localStorage (default 0 €), sent to the API as signed cents. Storage can be
 * unavailable (private mode, quota): every access is guarded.
 */

export const THRESHOLD_STORAGE_KEY = 'finances.forecast.thresholdCents'
export const DEFAULT_THRESHOLD_CENTS = 0
/** The API's bound: ±1 000 000 000 €. */
export const THRESHOLD_LIMIT = 100_000_000_000
const CHANGE_EVENT = 'finances:forecast-threshold'

export function readStoredThreshold(): number {
  try {
    const value = Number(window.localStorage.getItem(THRESHOLD_STORAGE_KEY))
    return Number.isSafeInteger(value) && Math.abs(value) <= THRESHOLD_LIMIT
      ? value
      : DEFAULT_THRESHOLD_CENTS
  } catch {
    return DEFAULT_THRESHOLD_CENTS
  }
}

export function storeThreshold(cents: number): void {
  try {
    window.localStorage.setItem(THRESHOLD_STORAGE_KEY, String(cents))
  } catch {
    // Not persisted; the value still applies to this page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

/** The saved threshold (0 during SSR) and its setter, shared across the app. */
export function useForecastThreshold(): [number, (cents: number) => void] {
  const cents = useSyncExternalStore(
    subscribe,
    readStoredThreshold,
    () => DEFAULT_THRESHOLD_CENTS,
  )
  return [cents, useCallback(storeThreshold, [])]
}

/**
 * The threshold typed unsigned with its sign (#326): « 150 » and `in` →
 * 15000, « 200,50 » and `out` → -20050 (an overdraft allowance). Null when
 * invalid.
 */
export function parseThreshold(
  amount: string,
  sign: AmountSign,
): number | null {
  const cents = signedCents(amount, sign)
  if (cents === null || Math.abs(cents) > THRESHOLD_LIMIT) return null
  return cents
}

/** The threshold as the field shows it: unsigned, with its sign. */
export function thresholdToInput(cents: number): {
  amount: string
  sign: AmountSign
} {
  return splitSignedCents(cents)
}
