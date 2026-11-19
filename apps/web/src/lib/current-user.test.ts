import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UserDto } from '#/api/types.gen'
import {
  CURRENT_USER_CACHE_MS,
  CURRENT_USER_RETRY_BASE_MS,
  CURRENT_USER_TIMEOUT_MS,
  currentUserFromResult,
  forgetCurrentUser,
  loadCurrentUser,
} from './current-user'
import type { MeResult } from './current-user'
import { NetworkUnavailableError } from './network-error'
import { SessionUnavailableError } from './session-errors'

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Owner Test',
  email: 'owner@example.test',
} as UserDto

describe('currentUserFromResult', () => {
  it('returns the signed-in user', () => {
    expect(
      currentUserFromResult({ data: user, response: new Response() }),
    ).toBe(user)
  })

  it('returns null when the API answers that nobody is signed in', () => {
    expect(
      currentUserFromResult({
        error: { message: 'Unauthorized' },
        response: new Response(null, { status: 401 }),
      }),
    ).toBeNull()
  })

  it('throws instead of signing the owner out when the API is unreachable', () => {
    const offline = new TypeError('Load failed')
    expect(() => currentUserFromResult({ error: offline })).toThrow(offline)
  })

  it.each([429, 500, 502, 503])(
    'throws instead of signing the owner out on a %i (#292)',
    (status) => {
      expect(() =>
        currentUserFromResult({
          error: { message: 'Too Many Requests' },
          response: new Response(null, { status }),
        }),
      ).toThrow(SessionUnavailableError)
    },
  )
})

const answer = (status: number, headers?: HeadersInit): MeResult =>
  status === 200
    ? { data: user, response: new Response(null, { status }) }
    : {
        error: { message: 'error' },
        response: new Response(null, { status, headers }),
      }

describe('loadCurrentUser', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    forgetCurrentUser()
  })

  it('fails at once without sending anything while the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const me = vi.fn()
    await expect(loadCurrentUser(me)).rejects.toBeInstanceOf(
      NetworkUnavailableError,
    )
    expect(me).not.toHaveBeenCalled()
  })

  it('returns the user the API answers with', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await expect(
      loadCurrentUser(() =>
        Promise.resolve({ data: user, response: new Response() }),
      ),
    ).resolves.toBe(user)
  })

  it('gives up on a request that hangs', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const controller = new AbortController()
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(controller.signal)
    const loading = loadCurrentUser(
      (signal) =>
        // What the generated client returns when fetch is aborted.
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            resolve({ error: signal.reason })
          })
        }),
    )
    expect(timeout).toHaveBeenCalledWith(CURRENT_USER_TIMEOUT_MS)
    controller.abort(new DOMException('signal timed out', 'TimeoutError'))
    await expect(loading).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('retries a 429 once after its Retry-After, then returns the user (#292)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const me = vi
      .fn()
      .mockResolvedValueOnce(answer(429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(answer(200))
    const wait = vi.fn(() => Promise.resolve())

    await expect(loadCurrentUser(me, { wait })).resolves.toBe(user)
    expect(me).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(2000)
  })

  it('shows the error page, not the login page, when the API keeps failing', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const me = vi.fn().mockResolvedValue(answer(503))
    const wait = vi.fn(() => Promise.resolve())

    await expect(loadCurrentUser(me, { wait })).rejects.toMatchObject({
      name: 'SessionUnavailableError',
      status: 503,
    })
    expect(me).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(CURRENT_USER_RETRY_BASE_MS)
  })

  it('returns null at once on a 401', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const me = vi.fn().mockResolvedValue(answer(401))
    const wait = vi.fn(() => Promise.resolve())

    await expect(loadCurrentUser(me, { wait })).resolves.toBeNull()
    expect(me).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })

  it('reuses a signed-in answer for a short while, so preloads do not hit the rate limit', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    let now = 1_000_000
    const me = vi.fn().mockResolvedValue(answer(200))
    const options = { now: () => now }

    // A navigation and the preloads of a few hovered links.
    await Promise.all(
      Array.from({ length: 5 }, () => loadCurrentUser(me, options)),
    )
    now += CURRENT_USER_CACHE_MS - 1
    await loadCurrentUser(me, options)
    expect(me).toHaveBeenCalledTimes(1)

    now += 1
    await loadCurrentUser(me, options)
    expect(me).toHaveBeenCalledTimes(2)
  })

  it('asks again once the user was forgotten (logout, refused refresh)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const me = vi
      .fn()
      .mockResolvedValueOnce(answer(200))
      .mockResolvedValueOnce(answer(401))

    await expect(loadCurrentUser(me)).resolves.toBe(user)
    forgetCurrentUser()
    await expect(loadCurrentUser(me)).resolves.toBeNull()
  })

  it('never remembers a signed-out answer', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const me = vi
      .fn()
      .mockResolvedValueOnce(answer(401))
      .mockResolvedValueOnce(answer(200))

    await expect(loadCurrentUser(me)).resolves.toBeNull()
    await expect(loadCurrentUser(me)).resolves.toBe(user)
  })
})
