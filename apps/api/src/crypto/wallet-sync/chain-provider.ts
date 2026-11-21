import type { CryptoChain } from '#/database/schema/domain-enums'
import { JSON_NUMBER_MARK, quoteJsonNumbers } from '#/common/decimal'

/**
 * Read-only sources of on-chain balances, behind interfaces so the endpoints
 * can be swapped (a self-hosted Esplora or node) and mocked in tests.
 *
 * Privacy: implementations receive the public addresses to read and nothing
 * else (no account name, label or other key). Their errors never carry an
 * address, a URL or a response body, so they can be logged as they are.
 */

export type EvmChain = Exclude<CryptoChain, 'bitcoin'>

export interface BitcoinAddressState {
  /** Confirmed balance in satoshis. */
  balanceSats: bigint
  /** Whether the address ever appeared in a transaction (mempool included). */
  used: boolean
}

export interface BitcoinChainProvider {
  /**
   * State of each address (same order); requests are rate-limited inside.
   * `onState` is called as each address is read, so that a read cut short by
   * a failure still reports the addresses it got (#268).
   */
  addressStates(
    addresses: readonly string[],
    onState?: (index: number, state: BitcoinAddressState) => void,
  ): Promise<BitcoinAddressState[]>
}

export interface EvmTokenContract {
  /** Contract address (`0x…`). */
  address: string
}

export interface EvmBalances {
  /** Native balance in wei (the smallest unit). */
  native: bigint
  /** Raw `balanceOf` of each token contract, same order as asked. */
  tokens: bigint[]
}

/** What a token contract says of itself (`symbol()`, `name()`, `decimals()`). */
export interface EvmTokenInfo {
  /** Printable text, at most 20 characters; empty when unreadable. */
  symbol: string
  /** Printable text, at most 100 characters; empty when unreadable. */
  name: string
  decimals: number
}

export interface EvmChainProvider {
  /** Chains with an endpoint configured. */
  readonly chains: readonly EvmChain[]
  /**
   * Symbol, name and decimals of a token contract on one chain (#269); null
   * when nothing answering `decimals()` is deployed at that address there.
   */
  tokenInfo(chain: EvmChain, contract: string): Promise<EvmTokenInfo | null>
  /** Native and token balances of one address on one chain. */
  balances(
    chain: EvmChain,
    address: string,
    tokens: readonly EvmTokenContract[],
  ): Promise<EvmBalances>
}

/** A token's contract and decimals on an EVM chain. */
export interface TokenDeployment {
  address: string
  decimals: number
}

/** Where tokens are deployed (the price provider knows it for its assets). */
export interface TokenContractProvider {
  /** Deployments of an asset per chain; chains without one are missing. */
  tokenDeployments(
    assetId: string,
  ): Promise<Partial<Record<EvmChain, TokenDeployment>>>
}

export type ChainProviderFailure =
  | 'timeout'
  | 'network'
  | 'rate_limited'
  | 'http'
  | 'malformed'
  | 'rpc'
  | 'wrong_chain'

export class ChainProviderError extends Error {
  constructor(
    readonly reason: ChainProviderFailure,
    readonly status?: number,
    /** A 429's `Retry-After`, in ms (capped), when the endpoint sent one. */
    readonly retryAfterMs?: number,
  ) {
    super(`Chain provider failure: ${reason}${status ? ` (${status})` : ''}`)
    this.name = 'ChainProviderError'
  }
}

/** A `Retry-After` beyond this is read as this (a broken or hostile value). */
export const MAX_RETRY_AFTER_MS = 60 * 60_000

/**
 * A `Retry-After` header (delay in seconds or HTTP date) in ms from `now`,
 * capped to `MAX_RETRY_AFTER_MS`; undefined when missing or unreadable.
 */
export function parseRetryAfter(
  header: string | null,
  now: number = Date.now(),
): number | undefined {
  if (header === null) return undefined
  const value = header.trim()
  let ms: number
  if (/^\d+$/.test(value)) {
    ms = Number(value) * 1000
  } else {
    // An HTTP date names its day and month (`Wed, 21 Oct 2015 07:28:00 GMT`).
    const at = /^[A-Za-z]{3}, /.test(value) ? Date.parse(value) : NaN
    if (Number.isNaN(at)) return undefined
    ms = at - now
  }
  return Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS)
}

const MAX_BODY_LENGTH = 2_000_000

/**
 * Fetches a JSON document with a timeout and no redirects, and parses it with
 * every number kept as its exact literal text (`JSON_NUMBER_MARK` + text).
 * Every failure becomes a `ChainProviderError` without the URL in it.
 */
export async function fetchJson(
  fetchFn: typeof fetch,
  url: URL,
  init: { timeoutMs: number; body?: unknown },
): Promise<unknown> {
  let text: string
  try {
    const response = await fetchFn(url, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined && { 'content-type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: 'error',
      signal: AbortSignal.timeout(init.timeoutMs),
    })
    if (response.status === 429) {
      throw new ChainProviderError(
        'rate_limited',
        429,
        parseRetryAfter(response.headers.get('retry-after')),
      )
    }
    if (!response.ok) throw new ChainProviderError('http', response.status)
    text = await response.text()
  } catch (error) {
    if (error instanceof ChainProviderError) throw error
    const name = (error as { name?: string } | null)?.name
    throw new ChainProviderError(
      name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network',
    )
  }
  if (text.length > MAX_BODY_LENGTH) throw new ChainProviderError('malformed')
  try {
    return JSON.parse(quoteJsonNumbers(text)) as unknown
  } catch {
    throw new ChainProviderError('malformed')
  }
}

/** A JSON integer read by `fetchJson` (`"123"`) as a bigint, or null. */
export function jsonInteger(value: unknown): bigint | null {
  if (typeof value !== 'string' || !value.startsWith(JSON_NUMBER_MARK)) {
    return null
  }
  const literal = value.slice(JSON_NUMBER_MARK.length)
  return /^\d+$/.test(literal) ? BigInt(literal) : null
}

/**
 * Runs `task` on each item with at most `limit` running at once. After a
 * failure no item starts, and `stopped()` tells running tasks to give up
 * before their request (e.g. one still waiting for its rate-limit slot).
 */
export async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, stopped: () => boolean, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let failed = false
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++
      try {
        results[index] = await task(items[index], () => failed, index)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}
