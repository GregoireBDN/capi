import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
} from '@simplewebauthn/browser'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import {
  passkeysControllerAuthenticate,
  passkeysControllerAuthenticationOptions,
  passkeysControllerList,
  passkeysControllerRegister,
  passkeysControllerRegistrationOptions,
} from '#/api'
import type { PasskeyDto } from '#/api/types.gen'
import { rateLimitMessage } from '#/lib/api-errors'
import { REAUTH_API_MESSAGE } from '#/lib/reauth'

/**
 * Passkeys (WebAuthn) on the web side: the browser ceremony with
 * `@simplewebauthn/browser`, framed by the API's options and verification.
 * Every outcome is a plain result (never a throw) carrying a French message.
 */

export type PasskeyResult<T = void> =
  | { status: 'ok'; data: T }
  /** The user closed the passkey sheet, or a newer ceremony replaced this one. */
  | { status: 'cancelled' }
  /** Adding a passkey needs a password or passkey sign-in within 5 minutes. */
  | { status: 'reauth' }
  | { status: 'error'; message: string }

const ERROR_MESSAGE = 'La passkey n’a pas pu être utilisée. Réessayez.'
const NETWORK_MESSAGE =
  'Connexion impossible. Vérifiez votre réseau et réessayez.'

/** WebAuthn API present (always false during SSR). */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn()
}

/** The browser can offer passkeys from the email field (conditional UI). */
export async function passkeyAutofillSupported(): Promise<boolean> {
  if (!passkeysSupported()) return false
  return browserSupportsWebAuthnAutofill().catch(() => false)
}

/** This device can create a passkey with Face ID, Touch ID or Windows Hello. */
export async function platformPasskeyAvailable(): Promise<boolean> {
  if (!passkeysSupported()) return false
  return platformAuthenticatorIsAvailable().catch(() => false)
}

/** Stops a pending ceremony (e.g. the autofill one when leaving the page). */
export function cancelPasskeyCeremony(): void {
  WebAuthnAbortService.cancelCeremony()
}

/** A name for a new passkey from the device, editable afterwards. */
export function defaultPasskeyName(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): string {
  if (/iPhone/.test(userAgent)) return 'iPhone'
  if (/iPad/.test(userAgent)) return 'iPad'
  if (/Android/.test(userAgent)) return 'Android'
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac'
  if (/Windows/.test(userAgent)) return 'Windows'
  if (/Linux/.test(userAgent)) return 'Linux'
  return 'Passkey'
}

/** A dismissed passkey sheet or an aborted ceremony is not an error. */
function isCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as { code?: unknown }).code
  return (
    error.name === 'NotAllowedError' ||
    error.name === 'AbortError' ||
    code === 'ERROR_CEREMONY_ABORTED'
  )
}

interface ClientResult<T> {
  data?: T
  error?: unknown
  response?: Response
}

/** A network failure becomes a result without a response. */
function settled<T>(call: Promise<ClientResult<T>>): Promise<ClientResult<T>> {
  return call.catch((): ClientResult<T> => ({}))
}

function apiMessages(error: unknown): string[] {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? error.message
      : undefined
  if (typeof message === 'string') return [message]
  return Array.isArray(message)
    ? message.filter((m): m is string => typeof m === 'string')
    : []
}

function failure(result: ClientResult<unknown>, fallback: string) {
  const status = result.response?.status
  if (status === undefined)
    return { status: 'error', message: NETWORK_MESSAGE } as const
  if (status === 429) {
    return {
      status: 'error',
      message: rateLimitMessage(result.response),
    } as const
  }
  if (
    status === 403 &&
    apiMessages(result.error).includes(REAUTH_API_MESSAGE)
  ) {
    return { status: 'reauth' } as const
  }
  return { status: 'error', message: fallback } as const
}

/**
 * Signs in with a discoverable passkey; on success the API has set the session
 * cookies. With `autofill`, the browser offers the passkey from the field with
 * `autocomplete="… webauthn"` and the promise waits until the user picks one
 * (or the ceremony is cancelled).
 */
export async function signInWithPasskey({
  autofill = false,
}: { autofill?: boolean } = {}): Promise<PasskeyResult> {
  const options = await settled(
    passkeysControllerAuthenticationOptions({ throwOnError: false }),
  )
  if (!options.response?.ok || !options.data) {
    return failure(options, ERROR_MESSAGE)
  }

  let response: Awaited<ReturnType<typeof startAuthentication>>
  try {
    response = await startAuthentication({
      optionsJSON:
        options.data as unknown as PublicKeyCredentialRequestOptionsJSON,
      useBrowserAutofill: autofill,
    })
  } catch (error) {
    return isCancellation(error)
      ? { status: 'cancelled' }
      : { status: 'error', message: ERROR_MESSAGE }
  }

  const verified = await settled(
    passkeysControllerAuthenticate({
      body: { response: response as unknown as Record<string, unknown> },
      throwOnError: false,
    }),
  )
  if (!verified.response?.ok) {
    return failure(
      verified,
      'Cette passkey n’est pas reconnue. Utilisez une autre passkey ou votre mot de passe.',
    )
  }
  return { status: 'ok', data: undefined }
}

/** Creates a passkey on this device and saves it on the account. */
export async function addPasskey(
  name: string,
): Promise<PasskeyResult<PasskeyDto>> {
  const options = await settled(
    passkeysControllerRegistrationOptions({ throwOnError: false }),
  )
  if (!options.response?.ok || !options.data) {
    return failure(options, 'Impossible d’ajouter une passkey. Réessayez.')
  }

  let response: Awaited<ReturnType<typeof startRegistration>>
  try {
    response = await startRegistration({
      optionsJSON:
        options.data as unknown as PublicKeyCredentialCreationOptionsJSON,
    })
  } catch (error) {
    if (isCancellation(error)) return { status: 'cancelled' }
    const code = (error as { code?: unknown }).code
    return {
      status: 'error',
      message:
        code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'
          ? 'Cet appareil a déjà une passkey pour ce compte.'
          : 'La passkey n’a pas pu être créée. Réessayez.',
    }
  }

  const saved = await settled(
    passkeysControllerRegister({
      body: {
        response: response as unknown as Record<string, unknown>,
        name,
      },
      throwOnError: false,
    }),
  )
  if (!saved.response?.ok || !saved.data) {
    return failure(saved, 'La passkey n’a pas pu être enregistrée. Réessayez.')
  }
  return { status: 'ok', data: saved.data }
}

/** The owner's passkeys, or null when they could not be loaded. */
export async function listPasskeys(): Promise<PasskeyDto[] | null> {
  const result = await settled(passkeysControllerList({ throwOnError: false }))
  return result.response?.ok && result.data ? result.data : null
}

const OFFER_DISMISSED_KEY = 'finances.passkey-offer-dismissed-at'
const OFFER_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

/** Remembers "Plus tard" on this device for 30 days. */
export function dismissPasskeyOffer(now = Date.now()): void {
  try {
    localStorage.setItem(OFFER_DISMISSED_KEY, String(now))
  } catch {
    // Private mode or blocked storage: the offer simply comes back.
  }
}

function offerSnoozed(now: number): boolean {
  try {
    const at = Number(localStorage.getItem(OFFER_DISMISSED_KEY))
    return Number.isFinite(at) && at > 0 && now - at < OFFER_SNOOZE_MS
  } catch {
    return false
  }
}

/**
 * After a password sign-in: offer to add a passkey when this device can create
 * one, the account has none and the offer was not put off recently.
 */
export async function shouldOfferPasskey(now = Date.now()): Promise<boolean> {
  if (offerSnoozed(now) || !(await platformPasskeyAvailable())) return false
  const passkeys = await listPasskeys()
  return passkeys !== null && passkeys.length === 0
}
