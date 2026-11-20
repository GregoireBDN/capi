import { describe, expect, it, vi } from 'vitest'
import { CoinGeckoPriceProvider } from './coingecko.provider'
import { PriceProviderError } from './price-provider'

/** Mocked HTTP only: these tests never reach the network. */
function provider(fetchFn: (url: URL, init: RequestInit) => Promise<Response>) {
  return new CoinGeckoPriceProvider({
    baseUrl: 'https://prices.test/api/v3',
    timeoutMs: 20,
    fetch: vi.fn(fetchFn) as unknown as typeof fetch,
  })
}

const json = (body: string, status = 200) =>
  Promise.resolve(
    new Response(body, {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(PriceProviderError)
  return error as PriceProviderError
}

describe('CoinGeckoPriceProvider', () => {
  it('fetches every asset in one request and keeps exact prices', async () => {
    const calls: URL[] = []
    const client = provider((url) => {
      calls.push(url)
      return json(
        '{"bitcoin":{"eur":61234.123456789},"tiny-coin":{"eur":1.234e-9},"other":{}}',
      )
    })
    const prices = await client.fetchEurPrices([
      'bitcoin',
      'tiny-coin',
      'other',
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0].origin + calls[0].pathname).toBe(
      'https://prices.test/api/v3/simple/price',
    )
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({
      ids: 'bitcoin,tiny-coin,other',
      vs_currencies: 'eur',
      precision: 'full',
      include_24hr_change: 'true',
    })
    expect(prices).toEqual(
      new Map([
        ['bitcoin', '61234.123456789'],
        ['tiny-coin', '0.000000001234'],
      ]),
    )
  })

  it('reads each price with its signed change over 24 hours (#295)', async () => {
    const client = provider(() =>
      json(
        '{"bitcoin":{"eur":61234.5,"eur_24h_change":-1.2345678901},"ethereum":{"eur":2950,"eur_24h_change":3.4e-2},"solana":{"eur":128.4,"eur_24h_change":null},"other":{"eur":1,"eur_24h_change":"oops"}}',
      ),
    )
    const quotes = await client.fetchEurQuotes([
      'bitcoin',
      'ethereum',
      'solana',
    ])
    expect(quotes).toEqual(
      new Map([
        ['bitcoin', { priceEur: '61234.5', change24hPercent: '-1.2345678901' }],
        ['ethereum', { priceEur: '2950', change24hPercent: '0.034' }],
        ['solana', { priceEur: '128.4', change24hPercent: null }],
      ]),
    )
  })

  it('sends nothing for an empty list', async () => {
    const fetchFn = vi.fn()
    const client = new CoinGeckoPriceProvider({ fetch: fetchFn })
    expect(await client.fetchEurPrices([])).toEqual(new Map())
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('times out', async () => {
    const client = provider(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(init.signal!.reason as Error),
          )
        }),
    )
    expect((await failure(client.fetchEurPrices(['bitcoin']))).reason).toBe(
      'timeout',
    )
  })

  it('reports rate limiting, HTTP and network errors', async () => {
    expect(
      (
        await failure(
          provider(() => json('{}', 429)).fetchEurPrices(['bitcoin']),
        )
      ).reason,
    ).toBe('rate_limited')
    const http = await failure(
      provider(() => json('oops', 503)).fetchEurPrices(['bitcoin']),
    )
    expect([http.reason, http.status]).toEqual(['http', 503])
    expect(
      (
        await failure(
          provider(() =>
            Promise.reject(new TypeError('fetch failed')),
          ).fetchEurPrices(['bitcoin']),
        )
      ).reason,
    ).toBe('network')
  })

  it('rejects malformed bodies', async () => {
    for (const body of [
      'not json',
      '[1,2]',
      '{"bitcoin":{"eur":"61234"}}',
      '{"bitcoin":{"eur":-5}}',
      '{"bitcoin":5}',
    ]) {
      const error = await failure(
        provider(() => json(body)).fetchEurPrices(['bitcoin']),
      )
      expect(error.reason).toBe('malformed')
    }
  })

  it('searches assets', async () => {
    let query: string | null = null
    const client = provider((url) => {
      query = url.searchParams.get('query')
      return json(
        '{"coins":[{"id":"bitcoin","symbol":"btc","name":"Bitcoin","market_cap_rank":1},{"id":"x","symbol":"x","name":"X","market_cap_rank":null}],"exchanges":[]}',
      )
    })
    expect(await client.searchAssets('bit')).toEqual([
      { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', rank: 1 },
      { id: 'x', symbol: 'X', name: 'X', rank: null },
    ])
    expect(query).toBe('bit')
    expect(
      (await failure(provider(() => json('{"coins":"x"}')).searchAssets('a')))
        .reason,
    ).toBe('malformed')
  })

  it('reads token contracts and decimals of the supported EVM chains', async () => {
    const calls: URL[] = []
    const client = provider((url) => {
      calls.push(url)
      return json(
        JSON.stringify({
          id: 'usd-coin',
          detail_platforms: {
            ethereum: {
              decimal_place: 6,
              contract_address: '0x1111111111111111111111111111111111111111',
            },
            'binance-smart-chain': {
              decimal_place: 18,
              contract_address: '0x2222222222222222222222222222222222222222',
            },
            'polygon-pos': { decimal_place: null, contract_address: '0x33' },
            solana: { decimal_place: 6, contract_address: 'So1ana' },
            '': { decimal_place: null, contract_address: '' },
          },
        }),
      )
    })
    expect(await client.tokenDeployments('usd-coin')).toEqual({
      ethereum: {
        address: '0x1111111111111111111111111111111111111111',
        decimals: 6,
      },
      bsc: {
        address: '0x2222222222222222222222222222222222222222',
        decimals: 18,
      },
    })
    expect(calls[0].pathname).toBe('/api/v3/coins/usd-coin')
    expect(calls[0].searchParams.get('market_data')).toBe('false')
  })

  it('fails on a malformed coin document', async () => {
    const error = await failure(
      provider(() => json('{"detail_platforms":[1]}')).tokenDeployments('x'),
    )
    expect(error.reason).toBe('malformed')
  })
  it('reads the daily history of one asset exactly, sending its id only (#366)', async () => {
    const calls: URL[] = []
    const client = provider((url) => {
      calls.push(url)
      return json(
        '{"prices":[[1793404800000,61234.123456789],[1793491200000,62000],[1793532000000,null],[1793533000000,62100.5]],"market_caps":[],"total_volumes":[]}',
      )
    })
    const points = await client.fetchEurHistory('bitcoin', 400)
    expect(calls).toHaveLength(1)
    expect(calls[0].pathname).toBe('/api/v3/coins/bitcoin/market_chart')
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({
      vs_currency: 'eur',
      // The key-less API serves 365 days at most.
      days: '365',
      interval: 'daily',
      precision: 'full',
    })
    expect(points).toEqual([
      { at: new Date(1793404800000), priceEur: '61234.123456789' },
      { at: new Date(1793491200000), priceEur: '62000' },
      { at: new Date(1793533000000), priceEur: '62100.5' },
    ])
    const malformed = provider(() => json('{"prices":"nope"}'))
    expect(
      (await failure(malformed.fetchEurHistory('bitcoin', 2))).reason,
    ).toBe('malformed')
    const unknown = provider(() => json('{}', 404))
    expect(await failure(unknown.fetchEurHistory('nope', 2))).toMatchObject({
      reason: 'http',
      status: 404,
    })
  })
})
