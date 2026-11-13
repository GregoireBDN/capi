import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UserDto } from '#/api/types.gen'
import {
  CURRENT_USER_TIMEOUT_MS,
  currentUserFromResult,
  loadCurrentUser,
} from './current-user'
import { NetworkUnavailableError } from './network-error'

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
})

describe('loadCurrentUser', () => {
  afterEach(() => {
    vi.restoreAllMocks()
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
})
