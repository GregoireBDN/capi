import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPasskey,
  defaultPasskeyName,
  dismissPasskeyOffer,
  shouldOfferPasskey,
  signInWithPasskey,
} from './passkeys'

const api = vi.hoisted(() => ({
  passkeysControllerAuthenticationOptions: vi.fn(),
  passkeysControllerAuthenticate: vi.fn(),
  passkeysControllerRegistrationOptions: vi.fn(),
  passkeysControllerRegister: vi.fn(),
  passkeysControllerList: vi.fn(),
}))
const browser = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(() => Promise.resolve(true)),
  platformAuthenticatorIsAvailable: vi.fn(() => Promise.resolve(true)),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  WebAuthnAbortService: { cancelCeremony: vi.fn() },
}))

vi.mock('#/api', () => api)
vi.mock('@simplewebauthn/browser', () => browser)

/** Synthetic WebAuthn payloads: the browser library is mocked. */
const REQUEST_OPTIONS = { challenge: 'Y2hhbGxlbmdl', rpId: 'localhost' }
const CREATION_OPTIONS = {
  challenge: 'Y2hhbGxlbmdl',
  rp: { id: 'localhost', name: 'Finances' },
  user: { id: 'dXNlcg', name: 'owner@example.test', displayName: 'Owner' },
  pubKeyCredParams: [],
}
const ASSERTION = { id: 'cred-1', rawId: 'cred-1', type: 'public-key' }
const PASSKEY = {
  id: '40000000-0000-4000-8000-000000000001',
  name: 'iPhone',
  deviceType: 'multiDevice',
  backedUp: true,
  createdAt: '2026-11-01T08:00:00.000Z',
  lastUsedAt: null,
}

const reply = <T>(data: T, status = 200, headers?: Record<string, string>) =>
  Promise.resolve({
    data: status < 400 ? data : undefined,
    error: status < 400 ? undefined : data,
    response: new Response(null, { status, headers }),
  })

const domError = (name: string) => Object.assign(new Error(name), { name })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  browser.browserSupportsWebAuthn.mockReturnValue(true)
  browser.platformAuthenticatorIsAvailable.mockResolvedValue(true)
  api.passkeysControllerAuthenticationOptions.mockImplementation(() =>
    reply(REQUEST_OPTIONS),
  )
  api.passkeysControllerRegistrationOptions.mockImplementation(() =>
    reply(CREATION_OPTIONS),
  )
})

describe('defaultPasskeyName', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', 'iPhone'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Mac'],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Windows'],
    ['curl/8', 'Passkey'],
  ])('%s → %s', (userAgent, name) => {
    expect(defaultPasskeyName(userAgent)).toBe(name)
  })
})

describe('signInWithPasskey', () => {
  it('runs the ceremony with the API options and sends the response', async () => {
    browser.startAuthentication.mockResolvedValue(ASSERTION)
    api.passkeysControllerAuthenticate.mockImplementation(() =>
      reply({ success: true }),
    )

    await expect(signInWithPasskey({ autofill: true })).resolves.toEqual({
      status: 'ok',
      data: undefined,
    })
    expect(browser.startAuthentication).toHaveBeenCalledWith({
      optionsJSON: REQUEST_OPTIONS,
      useBrowserAutofill: true,
    })
    expect(api.passkeysControllerAuthenticate).toHaveBeenCalledWith({
      body: { response: ASSERTION },
      throwOnError: false,
    })
  })

  it.each(['NotAllowedError', 'AbortError'])(
    'treats %s as a cancellation',
    async (name) => {
      browser.startAuthentication.mockRejectedValue(domError(name))
      await expect(signInWithPasskey()).resolves.toEqual({
        status: 'cancelled',
      })
      expect(api.passkeysControllerAuthenticate).not.toHaveBeenCalled()
    },
  )

  it('explains a refused passkey', async () => {
    browser.startAuthentication.mockResolvedValue(ASSERTION)
    api.passkeysControllerAuthenticate.mockImplementation(() =>
      reply({ message: ['Passkey sign-in failed'] }, 401),
    )
    const result = await signInWithPasskey()
    expect(result).toEqual({
      status: 'error',
      message: expect.stringContaining('pas reconnue'),
    })
  })

  it('surfaces rate limiting', async () => {
    api.passkeysControllerAuthenticationOptions.mockImplementation(() =>
      reply({ message: 'Too Many Requests' }, 429, { 'retry-after': '42' }),
    )
    const result = await signInWithPasskey()
    expect(result).toEqual({
      status: 'error',
      message: expect.stringContaining('42 secondes'),
    })
    expect(browser.startAuthentication).not.toHaveBeenCalled()
  })

  it('reports a network failure', async () => {
    api.passkeysControllerAuthenticationOptions.mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    expect(await signInWithPasskey()).toEqual({
      status: 'error',
      message: expect.stringContaining('réseau'),
    })
  })
})

describe('addPasskey', () => {
  it('creates the passkey and saves it with its name', async () => {
    const attestation = { id: 'cred-2', rawId: 'cred-2', type: 'public-key' }
    browser.startRegistration.mockResolvedValue(attestation)
    api.passkeysControllerRegister.mockImplementation(() => reply(PASSKEY, 201))

    expect(await addPasskey('iPhone')).toEqual({ status: 'ok', data: PASSKEY })
    expect(browser.startRegistration).toHaveBeenCalledWith({
      optionsJSON: CREATION_OPTIONS,
    })
    expect(api.passkeysControllerRegister).toHaveBeenCalledWith({
      body: { response: attestation, name: 'iPhone' },
      throwOnError: false,
    })
  })

  it('asks for a re-authentication when the session is not fresh', async () => {
    api.passkeysControllerRegistrationOptions.mockImplementation(() =>
      reply({ message: ['Recent authentication required'] }, 403),
    )
    expect(await addPasskey('Mac')).toEqual({ status: 'reauth' })
    expect(browser.startRegistration).not.toHaveBeenCalled()
  })

  it('says when this device already has a passkey', async () => {
    browser.startRegistration.mockRejectedValue(
      Object.assign(domError('InvalidStateError'), {
        code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
      }),
    )
    expect(await addPasskey('Mac')).toEqual({
      status: 'error',
      message: 'Cet appareil a déjà une passkey pour ce compte.',
    })
  })
})

describe('shouldOfferPasskey', () => {
  it('offers when the account has none and the device can create one', async () => {
    api.passkeysControllerList.mockImplementation(() => reply([]))
    expect(await shouldOfferPasskey()).toBe(true)
  })

  it('does not offer when a passkey exists', async () => {
    api.passkeysControllerList.mockImplementation(() => reply([PASSKEY]))
    expect(await shouldOfferPasskey()).toBe(false)
  })

  it('does not offer without a platform authenticator', async () => {
    browser.platformAuthenticatorIsAvailable.mockResolvedValue(false)
    expect(await shouldOfferPasskey()).toBe(false)
    expect(api.passkeysControllerList).not.toHaveBeenCalled()
  })

  it('stays quiet for 30 days after "Plus tard"', async () => {
    api.passkeysControllerList.mockImplementation(() => reply([]))
    const now = Date.parse('2026-11-14T10:00:00Z')
    dismissPasskeyOffer(now)
    expect(await shouldOfferPasskey(now + 29 * 86_400_000)).toBe(false)
    expect(await shouldOfferPasskey(now + 31 * 86_400_000)).toBe(true)
  })
})
