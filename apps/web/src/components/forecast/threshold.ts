import { useCallback, useSyncExternalStore } from 'react'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'

/**
 * Low-balance threshold of the forecast: a per-browser convenience kept in
 * localStorage (default 0 €), sent to the API as signed cents. Storage can be
 * unavailable (private mode, quota): every access is guarded.
 */

export const THRESHOLD_STORAGE_KEY = 'finances.forecast.thresholdCents'
export const DEFAULT_THRESHOLD_CENTS = 0
/** The API's bound: ±1 000 000 000 €. */
const THRESHOLD_LIMIT = 100_000_000_000
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
 * `"150"` → 15000, `"-200,50"` → -20050, `"1 000 €"` → 100000: a euro
 * amount in French format, possibly negative (an overdraft allowance).
 * Null when invalid.
 */
export function parseThreshold(text: string): number | null {
  const trimmed = text.trim()
  const negative = /^[-−]/.test(trimmed)
  const cents = parseEurosToCents(negative ? trimmed.slice(1) : trimmed)
  if (cents === null || cents > THRESHOLD_LIMIT) return null
  return negative && cents !== 0 ? -cents : cents
}

export function thresholdToInput(cents: number): string {
  return cents < 0 ? `-${centsToInput(-cents)}` : centsToInput(cents)
}
