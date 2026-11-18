import { describe, expect, it, vi } from 'vitest'
import {
  ChainProviderError,
  MAX_RETRY_AFTER_MS,
  parseRetryAfter,
} from './chain-provider'
import { EsploraProvider } from './esplora.provider'

/** Mocked HTTP only: these tests never reach the network. */
const ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'

function provider(
  fetchFn: (url: URL, init: RequestInit) => Promise<Response>,
  concurrency = 3,
) {
  return new EsploraProvider({
    baseUrl: 'https://esplora.test/api',
    timeoutMs: 20,
    concurrency,
    minIntervalMs: 0,
    fetch: vi.fn(fetchFn) as unknown as typeof fetch,
  })
}

const stats = (funded: number, spent: number, txs: number, pending = 0) =>
  JSON.stringify({
    address: ADDRESS,
    chain_stats: {
      funded_txo_count: 1,
      funded_txo_sum: funded,
      spent_txo_count: 0,
      spent_txo_sum: spent,
      tx_count: txs,
    },
    mempool_stats: {
      funded_txo_count: 0,
      funded_txo_sum: 0,
      spent_txo_count: 0,
      spent_txo_sum: 0,
      tx_count: pending,
    },
  })

const json = (body: string, status = 200, headers?: Record<string, string>) =>
  Promise.resolve(new Response(body, { status, headers }))

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ChainProviderError)
  expect(String((error as Error).message)).not.toContain(ADDRESS)
  return error as ChainProviderError
}

describe('EsploraProvider', () => {
  it('reads the confirmed balance and usage of each address', async () => {
    const urls: string[] = []
    const client = provider((url) => {
      urls.push(url.toString())
      if (url.pathname.endsWith('/a1')) return json(stats(150_000, 50_000, 3))
      if (url.pathname.endsWith('/a2')) return json(stats(0, 0, 0, 1))
      return json(stats(0, 0, 0))
    })
    const states = await client.addressStates(['a1', 'a2', 'a3'])
    expect(states).toEqual([
      { balanceSats: 100_000n, used: true },
      { balanceSats: 0n, used: true },
      { balanceSats: 0n, used: false },
    ])
    expect(urls.sort()).toEqual([
      'https://esplora.test/api/address/a1',
      'https://esplora.test/api/address/a2',
      'https://esplora.test/api/address/a3',
    ])
  })

  it('keeps satoshi sums exact beyond float precision', async () => {
    const client = provider(() =>
      json(
        stats(2_099_999_997_690_000, 0, 1).replace(
          '2099999997690000',
          '20999999976900001',
        ),
      ),
    )
    const [state] = await client.addressStates(['a'])
    expect(state.balanceSats).toBe(20_999_999_976_900_001n)
  })

  it('keeps at most `concurrency` requests in flight', async () => {
    let running = 0
    let peak = 0
    const client = provider(async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 2))
      running--
      return json(stats(0, 0, 0))
    }, 2)
    await client.addressStates(Array.from({ length: 7 }, (_, i) => `a${i}`))
    expect(peak).toBe(2)
  })

  it('reports each address as it is read, also when a later one fails', async () => {
    let calls = 0
    const reported: [number, boolean][] = []
    const error = await failure(
      provider(
        () =>
          ++calls <= 2
            ? json(stats(1_000, 0, 1))
            : json('', 429, { 'Retry-After': '30' }),
        1,
      ).addressStates(['a0', 'a1', 'a2', 'a3'], (index, state) =>
        reported.push([index, state.used]),
      ),
    )
    expect(error).toMatchObject({
      reason: 'rate_limited',
      retryAfterMs: 30_000,
    })
    expect(reported).toEqual([
      [0, true],
      [1, true],
    ])
    // Nothing is retried here: the sync decides (one inline wait per scan).
    expect(calls).toBe(3)
  })

  it('fails a rate-limited read at once, with its Retry-After', async () => {
    let calls = 0
    const error = await failure(
      provider(() => {
        calls++
        return json('', 429, { 'Retry-After': '120' })
      }).addressStates([ADDRESS]),
    )
    expect(calls).toBe(1)
    expect(error).toMatchObject({
      reason: 'rate_limited',
      retryAfterMs: 120_000,
    })
  })

  it('sends no queued request once one is rate limited', async () => {
    const asked: string[] = []
    const client = new EsploraProvider({
      baseUrl: 'https://esplora.test/api',
      timeoutMs: 20,
      concurrency: 2,
      minIntervalMs: 30,
      fetch: vi.fn((url: URL) => {
        asked.push(url.pathname)
        return json('', 429, { 'Retry-After': '120' })
      }) as unknown as typeof fetch,
    })
    await failure(client.addressStates([ADDRESS, `${ADDRESS}2`, `${ADDRESS}3`]))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(asked).toHaveLength(1)
  })

  it('reports failures without the address', async () => {
    expect(
      (await failure(provider(() => json('', 429)).addressStates([ADDRESS])))
        .reason,
    ).toBe('rate_limited')
    expect(
      (await failure(provider(() => json('', 500)).addressStates([ADDRESS])))
        .reason,
    ).toBe('http')
    expect(
      (
        await failure(
          provider(() => json('{"chain_stats":{}}')).addressStates([ADDRESS]),
        )
      ).reason,
    ).toBe('malformed')
    expect(
      (
        await failure(
          provider(() => json(stats(10, 20, 1))).addressStates([ADDRESS]),
        )
      ).reason,
    ).toBe('malformed')
    expect(
      (
        await failure(
          provider(() =>
            Promise.reject(new TypeError(`fetch failed ${ADDRESS}`)),
          ).addressStates([ADDRESS]),
        )
      ).reason,
    ).toBe('network')
    expect(
      (
        await failure(
          provider(
            (_url, init) =>
              new Promise((_resolve, reject) =>
                init.signal!.addEventListener('abort', () =>
                  reject(init.signal!.reason),
                ),
              ),
          ).addressStates([ADDRESS]),
        )
      ).reason,
    ).toBe('timeout')
  })
})

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-11-17T10:00:00Z')

  it('reads seconds and HTTP dates, capped', () => {
    expect(parseRetryAfter('30', now)).toBe(30_000)
    expect(parseRetryAfter(' 0 ', now)).toBe(0)
    expect(parseRetryAfter('Tue, 17 Nov 2026 10:02:00 GMT', now)).toBe(120_000)
    expect(parseRetryAfter('Tue, 17 Nov 2026 09:00:00 GMT', now)).toBe(0)
    expect(parseRetryAfter('86400', now)).toBe(MAX_RETRY_AFTER_MS)
  })

  it('ignores a missing or unreadable header', () => {
    expect(parseRetryAfter(null, now)).toBeUndefined()
    expect(parseRetryAfter('soon', now)).toBeUndefined()
    expect(parseRetryAfter('-5', now)).toBeUndefined()
  })
})
