import { ApiRequestError } from '#/lib/queries'

/**
 * The API's 403 message when a route needs a fresh session: a password or
 * passkey sign-in within the last 5 minutes (adding or revoking a passkey,
 * creating an access token, deleting the account).
 */
export const REAUTH_API_MESSAGE = 'Recent authentication required'

/** The request was refused because the last sign-in is too old. */
export function needsReauth(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 403 &&
    (error.apiMessage?.split('; ').includes(REAUTH_API_MESSAGE) ?? false)
  )
}
