import { describe, expect, it } from 'vitest'
import { jsonError, mockFetch, TEST_TOKEN } from '../test/mock-api.js'
import { ApiClient, ApiError } from './client.js'

function client(routes: Parameters<typeof mockFetch>[0]) {
  const mock = mockFetch(routes)
  return {
    api: new ApiClient({
      baseUrl: 'http://api.test/',
      token: TEST_TOKEN,
      fetch: mock.fetch,
    }),
    calls: mock.calls,
  }
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('ApiClient', () => {
  it('uploads a multipart form with the bearer and without a JSON type', async () => {
    const { api, calls } = client({ 'POST /api/imports/preview': { id: 'x' } })
    const form = new FormData()
    form.append('accountId', 'acc')
    form.append('file', new Blob(['a;b']), 'export.csv')
    await api.upload('/api/imports/preview', form)
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${TEST_TOKEN}`)
    expect(calls[0]?.headers.get('content-type')).toBeNull()
    expect(calls[0]?.body).toBe(form)
  })

  it('sends the token as a bearer and only the query parameters that are set', async () => {
    const { api, calls } = client({ '/api/transactions': { items: [] } })
    await api.get('/api/transactions', {
      month: '2026-11',
      q: undefined,
      page: 2,
      empty: '',
      no: false,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${TEST_TOKEN}`)
    expect(calls[0]?.url.toString()).toBe(
      'http://api.test/api/transactions?month=2026-11&page=2&no=false',
    )
  })

  it('explains a refused token (401)', async () => {
    const { api } = client({ '/api/accounts': jsonError(401) })
    const error = await failure(api.get('/api/accounts'))
    expect(error.status).toBe(401)
    expect(error.message).toMatch(/Token refusé/)
    expect(error.message).not.toContain(TEST_TOKEN)
  })

  it('explains a forbidden route (403)', async () => {
    const { api } = client({ '/api/accounts': jsonError(403) })
    expect((await failure(api.get('/api/accounts'))).message).toMatch(
      /Accès refusé/,
    )
  })

  it('passes on the wait of a rate limit (429)', async () => {
    const { api } = client({
      '/api/accounts': jsonError(429, {}, { 'retry-after': '42' }),
    })
    const error = await failure(api.get('/api/accounts'))
    expect(error.status).toBe(429)
    expect(error.message).toContain('dans 42 s')
  })

  it('falls back to a minute without Retry-After', async () => {
    const { api } = client({ '/api/accounts': jsonError(429) })
    expect((await failure(api.get('/api/accounts'))).message).toContain(
      'dans une minute',
    )
  })

  it('shows validation messages (400)', async () => {
    const { api } = client({
      '/api/budgets': jsonError(400, {
        message: ['month must match /^\\d{4}$/'],
      }),
    })
    expect((await failure(api.get('/api/budgets'))).message).toContain(
      'month must match',
    )
  })

  it('hides server error bodies (5xx)', async () => {
    const { api } = client({
      '/api/budgets': jsonError(500, { message: 'boom 1234' }),
    })
    const error = await failure(api.get('/api/budgets'))
    expect(error.message).toContain('(500)')
    expect(error.message).not.toContain('1234')
  })

  it('reports an unreachable API', async () => {
    const api = new ApiClient({
      baseUrl: 'http://api.test',
      token: TEST_TOKEN,
      fetch: (() =>
        Promise.reject(new TypeError('fetch failed'))) as typeof fetch,
    })
    const error = await failure(api.get('/api/accounts'))
    expect(error.status).toBe(0)
    expect(error.message).toContain('API injoignable (http://api.test)')
  })

  it('sends writes as JSON with the method and the token', async () => {
    const { api, calls } = client({
      'PUT /api/budgets/x': { ok: true },
    })
    await api.send('PUT', '/api/budgets/x', { monthlyTargetCents: 100 })
    expect(calls[0]?.method).toBe('PUT')
    expect(calls[0]?.body).toEqual({ monthlyTargetCents: 100 })
    expect(calls[0]?.headers.get('content-type')).toBe('application/json')
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${TEST_TOKEN}`)
  })

  it('explains a write refused to a read token (403)', async () => {
    const { api } = client({ '/api/transactions/x': jsonError(403) })
    const error = await failure(api.send('PATCH', '/api/transactions/x', {}))
    expect(error.message).toMatch(/lecture seule/)
    expect(error.message).toMatch(/Rien n'a été modifié/)
  })

  it('passes on the reason of a conflict (409)', async () => {
    const { api } = client({
      '/api/month-close/2026-10': jsonError(409, {
        message: 'Month is closed',
      }),
    })
    const error = await failure(
      api.send('PATCH', '/api/month-close/2026-10', {}),
    )
    expect(error.status).toBe(409)
    expect(error.message).toBe(
      "Conflit : Month is closed. Rien n'a été modifié : refaites un aperçu.",
    )
  })

  it('says a timed-out write may or may not have been applied', async () => {
    const api = new ApiClient({
      baseUrl: 'http://api.test',
      token: TEST_TOKEN,
      fetch: (() =>
        Promise.reject(
          Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
        )) as typeof fetch,
    })
    const error = await failure(
      api.send('POST', '/api/transactions/manual', {}),
    )
    expect(error.message).toMatch(/a pu être appliquée ou non/)
  })
})
