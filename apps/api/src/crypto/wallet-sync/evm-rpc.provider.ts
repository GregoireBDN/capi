import {
  ChainProviderError,
  type EvmBalances,
  type EvmChain,
  type EvmChainProvider,
  type EvmTokenContract,
  type EvmTokenInfo,
  fetchJson,
  jsonInteger,
} from './chain-provider'
import { EVM_CHAINS } from './chains'

/** JSON-RPC calls per batch request (public endpoints cap batch sizes). */
const BATCH_SIZE = 20
/** `balanceOf(address)` selector. */
const BALANCE_OF = '0x70a08231'
/** `decimals()`, `symbol()` and `name()` selectors (ERC-20). */
const DECIMALS = '0x313ce567'
const SYMBOL = '0x95d89b41'
const NAME = '0x06fdde03'
/** Decimals beyond this are not a real token (and the column's range). */
const MAX_DECIMALS = 36
const ANY_CALL_RESULT = /^0x([0-9a-fA-F]{2})*$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const QUANTITY = /^0x[0-9a-fA-F]{1,64}$/
/** `eth_call` data: `0x`, or up to 32 bytes for a `uint256`. */
const CALL_RESULT = /^0x([0-9a-fA-F]{64})?$/

interface RpcCall {
  method: string
  params: unknown[]
}

interface EvmRpcOptions {
  urls: ReadonlyMap<EvmChain, URL>
  timeoutMs: number
  /** Injected in tests; the global `fetch` otherwise. */
  fetch?: typeof fetch
}

/**
 * Key-less EVM JSON-RPC (a public endpoint per chain, or your own node):
 * `eth_chainId` (checked, so a misconfigured URL never reads another chain),
 * `eth_getBalance` and `balanceOf` through `eth_call`, batched in as few
 * requests as possible. Only the address and the token contracts are sent.
 */
export class EvmRpcProvider implements EvmChainProvider {
  readonly chains: readonly EvmChain[]
  private readonly urls: ReadonlyMap<EvmChain, URL>
  private readonly timeoutMs: number
  private readonly fetchFn: typeof fetch

  constructor(options: EvmRpcOptions) {
    this.urls = options.urls
    this.chains = [...options.urls.keys()]
    this.timeoutMs = options.timeoutMs
    this.fetchFn = options.fetch ?? fetch
  }

  async balances(
    chain: EvmChain,
    address: string,
    tokens: readonly EvmTokenContract[],
  ): Promise<EvmBalances> {
    const url = this.urls.get(chain)
    if (!url) throw new ChainProviderError('network')
    if (
      !ADDRESS.test(address) ||
      tokens.some((t) => !ADDRESS.test(t.address))
    ) {
      throw new ChainProviderError('malformed')
    }
    const owner = address.slice(2).toLowerCase().padStart(64, '0')
    const calls: RpcCall[] = [
      { method: 'eth_chainId', params: [] },
      { method: 'eth_getBalance', params: [address, 'latest'] },
      ...tokens.map((token) => ({
        method: 'eth_call',
        params: [
          { to: token.address, data: `${BALANCE_OF}${owner}` },
          'latest',
        ],
      })),
    ]
    const results: string[] = []
    for (let start = 0; start < calls.length; start += BATCH_SIZE) {
      results.push(
        ...(await this.batch(url, calls.slice(start, start + BATCH_SIZE))),
      )
    }
    const [chainId, native, ...balances] = results
    if (!QUANTITY.test(chainId) || !QUANTITY.test(native)) {
      throw new ChainProviderError('malformed')
    }
    if (BigInt(chainId) !== BigInt(EVM_CHAINS[chain].chainId)) {
      throw new ChainProviderError('wrong_chain')
    }
    return {
      native: BigInt(native),
      tokens: balances.map((result) => {
        if (!CALL_RESULT.test(result)) throw new ChainProviderError('malformed')
        // `0x`: no contract at this address on this chain.
        return result === '0x' ? 0n : BigInt(result)
      }),
    }
  }

  async tokenInfo(
    chain: EvmChain,
    contract: string,
  ): Promise<EvmTokenInfo | null> {
    const url = this.urls.get(chain)
    if (!url) throw new ChainProviderError('network')
    if (!ADDRESS.test(contract)) throw new ChainProviderError('malformed')
    const call = (data: string) => ({
      method: 'eth_call',
      params: [{ to: contract, data }, 'latest'],
    })
    const [chainId, decimals, symbol, name] = await this.batch(url, [
      { method: 'eth_chainId', params: [] },
      call(DECIMALS),
      call(SYMBOL),
      call(NAME),
    ])
    if (!QUANTITY.test(chainId)) throw new ChainProviderError('malformed')
    if (BigInt(chainId) !== BigInt(EVM_CHAINS[chain].chainId)) {
      throw new ChainProviderError('wrong_chain')
    }
    // `0x`: no contract there (or one without `decimals()`).
    if (!CALL_RESULT.test(decimals) || decimals === '0x') return null
    const value = BigInt(decimals)
    if (value > BigInt(MAX_DECIMALS)) return null
    return {
      decimals: Number(value),
      symbol: abiText(symbol, 20),
      name: abiText(name, 100),
    }
  }

  /** One batch request; results in the order of the calls. */
  private async batch(url: URL, calls: RpcCall[]): Promise<string[]> {
    const body = await fetchJson(this.fetchFn, url, {
      timeoutMs: this.timeoutMs,
      body: calls.map((call, id) => ({ jsonrpc: '2.0', id, ...call })),
    })
    if (!Array.isArray(body)) throw new ChainProviderError('rpc')
    const byId = new Map<number, string>()
    for (const item of body as unknown[]) {
      const entry = item as { id?: unknown; result?: unknown } | null
      const id = jsonInteger(entry?.id)
      if (typeof entry?.result !== 'string' || id === null) {
        throw new ChainProviderError('rpc')
      }
      byId.set(Number(id), entry.result)
    }
    return calls.map((_, id) => {
      const result = byId.get(id)
      if (result === undefined) throw new ChainProviderError('rpc')
      return result
    })
  }
}

/**
 * Text returned by `symbol()` / `name()`: an ABI-encoded `string`, or a
 * `bytes32` (older tokens), reduced to printable characters and cut to
 * `max`; empty when it cannot be read. Spam tokens put anything there, so
 * nothing else is trusted.
 */
export function abiText(result: string, max: number): string {
  if (!ANY_CALL_RESULT.test(result)) return ''
  const bytes = Buffer.from(result.slice(2), 'hex')
  let raw: Buffer
  if (bytes.length === 32) {
    const end = bytes.indexOf(0)
    raw = bytes.subarray(0, end === -1 ? 32 : end)
  } else if (bytes.length >= 64) {
    const offset = Number(BigInt(`0x${bytes.subarray(0, 32).toString('hex')}`))
    if (offset + 32 > bytes.length) return ''
    const length = Number(
      BigInt(`0x${bytes.subarray(offset, offset + 32).toString('hex')}`),
    )
    if (offset + 32 + length > bytes.length) return ''
    raw = bytes.subarray(offset + 32, offset + 32 + length)
  } else {
    return ''
  }
  const text = raw
    .toString('utf8')
    .replace(/[^\p{L}\p{N}\p{P}\p{S} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  return [...text].slice(0, max).join('').trim()
}
