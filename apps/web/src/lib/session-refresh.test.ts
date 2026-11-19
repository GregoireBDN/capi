import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REFRESH_ATTEMPTS,
  REFRESH_RETRY_BASE_MS,
  REFRESH_RETRY_MAX_MS,
  createSessionRefresher,
  unavailableResponse,
} from './session-refresh'
import { retryDelayMs } from './session-errors'

/**
 * The browser's access-token renewal (#292): only a refused refresh (401) is
 * « signed out »; a 429, a 5xx or a lost answer is retried, then reported as
 * a temporary failure.
 */

const respond = (status: number, headers?: HeadersInit) => () =>
  Promise.resolve(new Response(null, { status, headers }))
const lost = () => Promise.reject(new TypeError('Load failed'))

function refresher(...answers: (() => Promise<Response>)[]) {
  const fetchMock = vi.fn(() => {
    const next = answers.shift()
    if (!next) throw new Error('no more answers')
    return next()
  })
  const wait = vi.fn(() => Promise.resolve())
  const onRefused = vi.fn()
  const { refresh } = createSessionRefresher({
    fetch: fetchMock as unknown as typeof fetch,
    sleep: wait,
    onRefused,
  })
  return { refresh, fetchMock, wait, onRefused }
}

describe('createSessionRefresher', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renews the session', async () => {
    const { refresh, fetchMock, onRefused } = refresher(respond(200))

    await expect(refresh()).resolves.toEqual({ kind: 'renewed' })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    })
    expect(onRefused).not.toHaveBeenCalled()
  })

  it('reports a refused refresh at once, and forgets the user', async () => {
    const { refresh, fetchMock, wait, onRefused } = refresher(respond(401))

    await expect(refresh()).resolves.toEqual({ kind: 'refused' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
    expect(onRefused).toHaveBeenCalledTimes(1)
  })

  it('retries a rate-limited refresh after its Retry-After', async () => {
    const { refresh, wait } = refresher(
      respond(429, { 'retry-after': '3' }),
      respond(200),
    )

    await expect(refresh()).resolves.toEqual({ kind: 'renewed' })
    expect(wait).toHaveBeenCalledWith(3000)
  })

  it('retries a refresh whose answer was lost (the API accepts it again within its grace)', async () => {
    const { refresh, fetchMock, wait } = refresher(
      lost,
      respond(503),
      respond(200),
    )

    await expect(refresh()).resolves.toEqual({ kind: 'renewed' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls).toEqual([
      [REFRESH_RETRY_BASE_MS],
      [2 * REFRESH_RETRY_BASE_MS],
    ])
  })

  it('never waits longer than the cap, whatever Retry-After says', async () => {
    const { refresh, wait } = refresher(
      respond(429, { 'retry-after': '3600' }),
      respond(200),
    )

    await refresh()
    expect(wait).toHaveBeenCalledWith(REFRESH_RETRY_MAX_MS)
  })

  it('gives up as unavailable, never refused, when the API keeps failing', async () => {
    const { refresh, fetchMock, onRefused } = refresher(
      respond(502),
      respond(503),
      respond(429, { 'retry-after': '30' }),
    )

    await expect(refresh()).resolves.toEqual({
      kind: 'unavailable',
      status: 429,
      retryAfter: '30',
    })
    expect(fetchMock).toHaveBeenCalledTimes(REFRESH_ATTEMPTS)
    expect(onRefused).not.toHaveBeenCalled()
  })

  it('stops retrying while the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { refresh, fetchMock } = refresher(lost)

    await expect(refresh()).resolves.toEqual({
      kind: 'unavailable',
      status: 0,
      retryAfter: null,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shares one renewal between concurrent 401s', async () => {
    const { refresh, fetchMock } = refresher(respond(200))

    const results = await Promise.all([refresh(), refresh(), refresh()])

    expect(results.every((r) => r.kind === 'renewed')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('unavailableResponse', () => {
  it('hands the caller the temporary status, never a 401', async () => {
    const response = unavailableResponse({
      kind: 'unavailable',
      status: 429,
      retryAfter: '30',
    })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('30')
    expect(await response.json()).toMatchObject({ statusCode: 429 })
  })

  it('answers 503 when the API gave no answer', () => {
    expect(
      unavailableResponse({ kind: 'unavailable', status: 0, retryAfter: null })
        .status,
    ).toBe(503)
  })
})

describe('retryDelayMs', () => {
  const headers = (value?: string) => ({
    headers: new Headers(value ? { 'retry-after': value } : {}),
  })

  it('reads Retry-After in seconds or as a date, capped', () => {
    const now = Date.parse('2026-11-19T08:00:00Z')
    expect(retryDelayMs(headers('2'), 500, 5000, now)).toBe(2000)
    expect(
      retryDelayMs(headers('Thu, 19 Nov 2026 08:00:04 GMT'), 500, 5000, now),
    ).toBe(4000)
    expect(retryDelayMs(headers('120'), 500, 5000, now)).toBe(5000)
    expect(retryDelayMs(headers(), 500, 5000, now)).toBe(500)
    expect(retryDelayMs(headers('soon'), 500, 5000, now)).toBe(500)
    expect(retryDelayMs(undefined, 500, 5000, now)).toBe(500)
  })
})
