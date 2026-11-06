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
    })
    expect(prices).toEqual(
      new Map([
        ['bitcoin', '61234.123456789'],
        ['tiny-coin', '0.000000001234'],
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
})
