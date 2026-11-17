import { MAX_RETRY_AFTER_MS } from './chain-provider'

/** First wait after a rate limit, doubled on each one in a row. */
export const BACKOFF_BASE_MS = 60_000
/** Longest wait, whatever `Retry-After` or the doubling say. */
export const MAX_BACKOFF_MS = MAX_RETRY_AFTER_MS

interface State {
  /** Epoch ms before which the provider is not asked again. */
  until: number
  /** Rate limits in a row (reset by a successful read). */
  strikes: number
}

/**
 * Per-provider backoff after a rate limit (HTTP 429), kept in memory: the
 * wait is the larger of the endpoint's `Retry-After` and an exponential delay
 * (`BACKOFF_BASE_MS` × 2^(strikes − 1)), capped to `MAX_BACKOFF_MS`. While it
 * runs, the provider is not asked at all, whoever triggers the sync.
 */
export class ProviderBackoff<K extends string> {
  private readonly states = new Map<K, State>()

  /** End of the provider's backoff (epoch ms), or null when it may be asked. */
  until(key: K, now: number): number | null {
    const state = this.states.get(key)
    return state && state.until > now ? state.until : null
  }

  /** Records a rate limit and returns the end of the new backoff. */
  rateLimited(key: K, now: number, retryAfterMs?: number): number {
    const strikes = (this.states.get(key)?.strikes ?? 0) + 1
    const exponential = BACKOFF_BASE_MS * 2 ** Math.min(strikes - 1, 16)
    const wait = Math.min(
      Math.max(exponential, retryAfterMs ?? 0),
      MAX_BACKOFF_MS,
    )
    const until = now + wait
    this.states.set(key, { until, strikes })
    return until
  }

  /** A successful read: the next rate limit starts from the base delay. */
  succeeded(key: K): void {
    this.states.delete(key)
  }
}
