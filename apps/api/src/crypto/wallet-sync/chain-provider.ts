import type { CryptoChain } from '#/database/schema/domain-enums'
import { JSON_NUMBER_MARK, quoteJsonNumbers } from '../decimal'

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
  /** State of each address (same order); requests are rate-limited inside. */
  addressStates(addresses: readonly string[]): Promise<BitcoinAddressState[]>
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

export interface EvmChainProvider {
  /** Chains with an endpoint configured. */
  readonly chains: readonly EvmChain[]
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
  ) {
    super(`Chain provider failure: ${reason}${status ? ` (${status})` : ''}`)
    this.name = 'ChainProviderError'
  }
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
      throw new ChainProviderError('rate_limited', 429)
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

/** Runs `task` on each item with at most `limit` running at once. */
export async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let failed = false
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++
      try {
        results[index] = await task(items[index])
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
