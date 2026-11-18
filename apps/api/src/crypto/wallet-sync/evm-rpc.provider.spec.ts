import { describe, expect, it, vi } from 'vitest'
import type { EvmChain } from './chain-provider'
import { ChainProviderError } from './chain-provider'
import { evmRpcUrls } from './chains'
import { EvmRpcProvider } from './evm-rpc.provider'

/** Mocked JSON-RPC only; EIP-55 example address, made-up token contracts. */
const ADDRESS = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
const TOKEN_A = '0x1111111111111111111111111111111111111111'
const TOKEN_B = '0x2222222222222222222222222222222222222222'

type Call = { id: number; method: string; params: unknown[] }

function provider(answer: (calls: Call[]) => unknown, status = 200) {
  const requests: { url: string; calls: Call[] }[] = []
  const fetchFn = vi.fn((url: URL, init: RequestInit) => {
    const calls = JSON.parse(String(init.body)) as Call[]
    requests.push({ url: url.toString(), calls })
    return Promise.resolve(
      new Response(JSON.stringify(answer(calls)), { status }),
    )
  })
  const client = new EvmRpcProvider({
    urls: new Map<EvmChain, URL>([
      ['ethereum', new URL('https://eth.test/rpc')],
      ['bsc', new URL('https://bsc.test/rpc')],
    ]),
    timeoutMs: 20,
    fetch: fetchFn as unknown as typeof fetch,
  })
  return { client, requests }
}

const hex = (value: bigint, pad = 0) =>
  `0x${value.toString(16).padStart(pad, '0')}`

/** A node answering for chain `chainId`, with balances per method/contract. */
function node(chainId: number, balances: Record<string, bigint>) {
  return (calls: Call[]) =>
    calls
      .map((call) => {
        if (call.method === 'eth_chainId') {
          return { jsonrpc: '2.0', id: call.id, result: hex(BigInt(chainId)) }
        }
        if (call.method === 'eth_getBalance') {
          return { jsonrpc: '2.0', id: call.id, result: hex(balances.native) }
        }
        const to = (call.params[0] as { to: string }).to
        const value = balances[to]
        return {
          jsonrpc: '2.0',
          id: call.id,
          result: value === undefined ? '0x' : hex(value, 64),
        }
      })
      .reverse()
}

describe('EvmRpcProvider', () => {
  it('reads native and token balances in one checked batch', async () => {
    const { client, requests } = provider(
      node(1, {
        native: 1_500_000_000_000_000_000n,
        [TOKEN_A]: 1_234_567n,
      }),
    )
    const balances = await client.balances('ethereum', ADDRESS, [
      { address: TOKEN_A },
      { address: TOKEN_B },
    ])
    expect(balances).toEqual({
      native: 1_500_000_000_000_000_000n,
      tokens: [1_234_567n, 0n],
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('https://eth.test/rpc')
    expect(requests[0].calls.map((call) => call.method)).toEqual([
      'eth_chainId',
      'eth_getBalance',
      'eth_call',
      'eth_call',
    ])
    expect(requests[0].calls[2].params[0]).toEqual({
      to: TOKEN_A,
      data: `0x70a08231${'0'.repeat(24)}${ADDRESS.slice(2).toLowerCase()}`,
    })
  })

  it('splits large token lists into batches of 20 calls', async () => {
    const tokens = Array.from({ length: 30 }, (_, i) => ({
      address: `0x${i.toString(16).padStart(40, '0')}`,
    }))
    const { client, requests } = provider(node(56, { native: 0n }))
    const balances = await client.balances('bsc', ADDRESS, tokens)
    expect(balances.tokens).toHaveLength(30)
    expect(requests.map((r) => r.calls.length)).toEqual([20, 12])
  })

  it('refuses an endpoint serving another chain', async () => {
    const { client } = provider(node(56, { native: 1n }))
    const error = await client
      .balances('ethereum', ADDRESS, [])
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ChainProviderError)
    expect((error as ChainProviderError).reason).toBe('wrong_chain')
  })

  it('reports a rate limit with its Retry-After', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response('', { status: 429, headers: { 'Retry-After': '90' } }),
      ),
    )
    const client = new EvmRpcProvider({
      urls: new Map<EvmChain, URL>([['ethereum', new URL('https://eth.test')]]),
      timeoutMs: 20,
      fetch: fetchFn as unknown as typeof fetch,
    })
    const error = await client
      .balances('ethereum', ADDRESS, [])
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ChainProviderError)
    expect(error).toMatchObject({
      reason: 'rate_limited',
      retryAfterMs: 90_000,
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('fails on RPC errors and malformed answers, never with the address', async () => {
    const cases: [ReturnType<typeof provider>, string][] = [
      [
        provider(() => ({ jsonrpc: '2.0', id: 0, error: { code: -32600 } })),
        'rpc',
      ],
      [
        provider((calls) =>
          calls.map((call) => ({
            jsonrpc: '2.0',
            id: call.id,
            error: { code: -32000 },
          })),
        ),
        'rpc',
      ],
      [
        provider((calls) =>
          calls.map((call) => ({ id: call.id, result: 'zz' })),
        ),
        'malformed',
      ],
      [provider(() => [], 503), 'http'],
    ]
    for (const [{ client }, reason] of cases) {
      const error = await client
        .balances('ethereum', ADDRESS, [])
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ChainProviderError)
      expect((error as ChainProviderError).reason).toBe(reason)
      expect((error as Error).message).not.toContain(ADDRESS)
    }
  })
})

describe('evmRpcUrls', () => {
  it('uses the public defaults, overridden by chain id', () => {
    const urls = evmRpcUrls('{"1":"https://node.test/rpc","56":""}')
    expect(urls.get('ethereum')?.toString()).toBe('https://node.test/rpc')
    expect(urls.has('bsc')).toBe(false)
    expect(urls.get('base')?.hostname).toBe('base-rpc.publicnode.com')
    expect(evmRpcUrls(undefined).size).toBe(6)
  })

  it('refuses unknown chains and bad URLs without echoing them', () => {
    expect(() => evmRpcUrls('[1]')).toThrow('JSON object')
    expect(() => evmRpcUrls('{"999":"https://x.test"}')).toThrow('999')
    expect(() => evmRpcUrls('{"1":"ftp://secret-key@x.test"}')).toThrow(
      /^EVM_RPC_URLS: chain 1 needs an http\(s\) URL$/,
    )
  })
})

describe('EvmRpcProvider.tokenInfo (#269)', () => {
  const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0')
  /** ABI-encoded `string`. */
  const abiString = (text: string) => {
    const bytes = Buffer.from(text, 'utf8')
    const padded = bytes
      .toString('hex')
      .padEnd(Math.ceil(bytes.length / 32) * 64, '0')
    return `0x${word(32)}${word(bytes.length)}${padded}`
  }
  const bytes32 = (text: string) =>
    `0x${Buffer.from(text, 'utf8').toString('hex').padEnd(64, '0')}`

  function tokenNode(chainId: number, results: Record<string, string>) {
    return (calls: Call[]) =>
      calls.map((call) => {
        if (call.method === 'eth_chainId') {
          return { jsonrpc: '2.0', id: call.id, result: hex(BigInt(chainId)) }
        }
        const data = (call.params[0] as { data: string }).data
        return { jsonrpc: '2.0', id: call.id, result: results[data] ?? '0x' }
      })
  }

  it('reads decimals, symbol and name in one checked batch, sending only the contract', async () => {
    const { client, requests } = provider(
      tokenNode(1, {
        '0x313ce567': `0x${word(6)}`,
        '0x95d89b41': abiString('USDT'),
        '0x06fdde03': abiString('Tether USD'),
      }),
    )
    await expect(client.tokenInfo('ethereum', TOKEN_A)).resolves.toEqual({
      decimals: 6,
      symbol: 'USDT',
      name: 'Tether USD',
    })
    expect(requests).toHaveLength(1)
    expect(JSON.stringify(requests[0].calls)).not.toContain(ADDRESS)
    for (const call of requests[0].calls.slice(1)) {
      expect(call.params[0]).toMatchObject({ to: TOKEN_A })
    }
  })

  it('reads bytes32 symbols and strips what is not printable', async () => {
    const { client } = provider(
      tokenNode(1, {
        '0x313ce567': `0x${word(18)}`,
        '0x95d89b41': bytes32('MKR'),
        '0x06fdde03': abiString('Spam\u0000\u0007 token\n visit'),
      }),
    )
    await expect(client.tokenInfo('ethereum', TOKEN_A)).resolves.toEqual({
      decimals: 18,
      symbol: 'MKR',
      name: 'Spam token visit',
    })
  })

  it('says null when no token answers there, and checks the chain', async () => {
    const empty = provider(tokenNode(1, {}))
    await expect(
      empty.client.tokenInfo('ethereum', TOKEN_B),
    ).resolves.toBeNull()
    const absurd = provider(tokenNode(1, { '0x313ce567': `0x${word(77)}` }))
    await expect(
      absurd.client.tokenInfo('ethereum', TOKEN_B),
    ).resolves.toBeNull()
    const wrong = provider(tokenNode(56, { '0x313ce567': `0x${word(6)}` }))
    await expect(
      wrong.client.tokenInfo('ethereum', TOKEN_B),
    ).rejects.toMatchObject({
      reason: 'wrong_chain',
    })
  })
})
