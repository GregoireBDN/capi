import { z } from 'zod'
import {
  type BitcoinAddressState,
  type BitcoinChainProvider,
  ChainProviderError,
  fetchJson,
  jsonInteger,
  mapLimited,
} from './chain-provider'

export const DEFAULT_ESPLORA_URL = 'https://mempool.space/api'
/**
 * Requests in flight at once, and minimum spacing between two starts: about
 * 4 requests per second, under what mempool.space's public API tolerates for
 * a burst (an extended key's first sync asks 40 addresses or more).
 */
const DEFAULT_CONCURRENCY = 2
const DEFAULT_MIN_INTERVAL_MS = 250
/**
 * A 429 asking to wait at most this long (or without `Retry-After`, after
 * `DEFAULT_RATE_LIMIT_PAUSE_MS`) pauses every request and retries this one
 * once; a longer wait fails the read and leaves it to the sync's backoff.
 */
const DEFAULT_MAX_INLINE_WAIT_MS = 10_000
const DEFAULT_RATE_LIMIT_PAUSE_MS = 3_000

const stats = z.looseObject({
  funded_txo_sum: z.unknown(),
  spent_txo_sum: z.unknown(),
  tx_count: z.unknown(),
})
const addressSchema = z.looseObject({
  chain_stats: stats,
  mempool_stats: stats,
})

interface EsploraOptions {
  baseUrl?: string
  timeoutMs: number
  concurrency?: number
  minIntervalMs?: number
  maxInlineWaitMs?: number
  /** Injected in tests; the global `fetch` otherwise. */
  fetch?: typeof fetch
}

/**
 * Key-less Esplora REST API (mempool.space by default, or a self-hosted
 * instance): `GET /address/:address`, one request per address, at most
 * `concurrency` at once and spaced by `minIntervalMs`; a short rate limit is
 * waited out once (see `DEFAULT_MAX_INLINE_WAIT_MS`). Only the address is
 * sent.
 */
export class EsploraProvider implements BitcoinChainProvider {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly concurrency: number
  private readonly minIntervalMs: number
  private readonly maxInlineWaitMs: number
  private readonly fetchFn: typeof fetch
  private nextStart = 0

  constructor(options: EsploraOptions) {
    const base = options.baseUrl ?? DEFAULT_ESPLORA_URL
    this.baseUrl = base.endsWith('/') ? base : `${base}/`
    this.timeoutMs = options.timeoutMs
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
    this.maxInlineWaitMs = options.maxInlineWaitMs ?? DEFAULT_MAX_INLINE_WAIT_MS
    this.fetchFn = options.fetch ?? fetch
  }

  addressStates(addresses: readonly string[]): Promise<BitcoinAddressState[]> {
    return mapLimited(addresses, this.concurrency, (address, stopped) =>
      this.addressState(address, stopped),
    )
  }

  private async addressState(
    address: string,
    stopped: () => boolean,
  ): Promise<BitcoinAddressState> {
    const url = new URL(`address/${encodeURIComponent(address)}`, this.baseUrl)
    // Another request of the scan failed: this one is not sent at all.
    const get = async () => {
      await this.slot()
      if (stopped()) throw new ChainProviderError('network')
      return fetchJson(this.fetchFn, url, { timeoutMs: this.timeoutMs })
    }
    let body: unknown
    try {
      body = await get()
    } catch (error) {
      const wait = this.inlineWait(error)
      if (wait === null || stopped()) throw error
      this.pause(wait)
      body = await get()
    }
    const parsed = addressSchema.safeParse(body)
    if (!parsed.success) throw new ChainProviderError('malformed')
    const chain = parsed.data.chain_stats
    const mempool = parsed.data.mempool_stats
    const funded = jsonInteger(chain.funded_txo_sum)
    const spent = jsonInteger(chain.spent_txo_sum)
    const txs = jsonInteger(chain.tx_count)
    const pendingTxs = jsonInteger(mempool.tx_count)
    if (
      funded === null ||
      spent === null ||
      txs === null ||
      pendingTxs === null ||
      spent > funded
    ) {
      throw new ChainProviderError('malformed')
    }
    return { balanceSats: funded - spent, used: txs + pendingTxs > 0n }
  }

  /** How long to wait before retrying after `error`, or null to give up. */
  private inlineWait(error: unknown): number | null {
    if (!(error instanceof ChainProviderError)) return null
    if (error.reason !== 'rate_limited') return null
    const wait = error.retryAfterMs ?? DEFAULT_RATE_LIMIT_PAUSE_MS
    return wait <= this.maxInlineWaitMs ? wait : null
  }

  /** No request starts before `ms` from now. */
  private pause(ms: number): void {
    this.nextStart = Math.max(this.nextStart, Date.now() + ms)
  }

  /** Waits for this request's turn so starts are `minIntervalMs` apart. */
  private async slot(): Promise<void> {
    const now = Date.now()
    const start = Math.max(now, this.nextStart)
    this.nextStart = start + this.minIntervalMs
    if (start > now) {
      await new Promise((resolve) => setTimeout(resolve, start - now))
    }
  }
}
