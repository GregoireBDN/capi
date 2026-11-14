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
/** Requests in flight at once, and minimum spacing between two starts. */
const DEFAULT_CONCURRENCY = 3
const DEFAULT_MIN_INTERVAL_MS = 150

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
  /** Injected in tests; the global `fetch` otherwise. */
  fetch?: typeof fetch
}

/**
 * Key-less Esplora REST API (mempool.space by default, or a self-hosted
 * instance): `GET /address/:address`, one request per address, at most
 * `concurrency` at once and spaced by `minIntervalMs`. Only the address is
 * sent.
 */
export class EsploraProvider implements BitcoinChainProvider {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly concurrency: number
  private readonly minIntervalMs: number
  private readonly fetchFn: typeof fetch
  private nextStart = 0

  constructor(options: EsploraOptions) {
    const base = options.baseUrl ?? DEFAULT_ESPLORA_URL
    this.baseUrl = base.endsWith('/') ? base : `${base}/`
    this.timeoutMs = options.timeoutMs
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
    this.fetchFn = options.fetch ?? fetch
  }

  addressStates(addresses: readonly string[]): Promise<BitcoinAddressState[]> {
    return mapLimited(addresses, this.concurrency, (address) =>
      this.addressState(address),
    )
  }

  private async addressState(address: string): Promise<BitcoinAddressState> {
    await this.slot()
    const url = new URL(`address/${encodeURIComponent(address)}`, this.baseUrl)
    const body = await fetchJson(this.fetchFn, url, {
      timeoutMs: this.timeoutMs,
    })
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
