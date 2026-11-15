import { redirect } from '@tanstack/react-router'
import type { UserDto } from '#/api/types.gen'
import { fetchCurrentUser } from '#/lib/auth'
import { safeReturnPath } from '#/lib/post-login'
import { ROUTES } from '#/lib/routes'

/**
 * Guard for the authenticated layout (`routes/_app.tsx`). Throws a redirect to
 * the login page when nobody is signed in; otherwise returns the user so it can
 * be exposed through the route context.
 */
export async function requireUser(): Promise<UserDto> {
  const user = await fetchCurrentUser()
  if (!user) throw redirect({ to: ROUTES.auth })
  return user
}

/**
 * Guard for the login page: signed-in users go straight to the dashboard, or
 * back to the OAuth consent page that sent them here (`?redirect=`, #78).
 */
export async function redirectIfAuthenticated(
  returnTo?: string,
): Promise<void> {
  const user = await fetchCurrentUser()
  if (!user) return
  const back = safeReturnPath(returnTo)
  throw back ? redirect({ href: back }) : redirect({ to: ROUTES.dashboard })
}

/**
 * Guard for the OAuth consent page (#78): anonymous visitors sign in first
 * and come back to the same request.
 */
export async function requireUserForConsent(href: string): Promise<UserDto> {
  const user = await fetchCurrentUser()
  if (!user) {
    throw redirect({
      to: ROUTES.auth,
      search: { redirect: safeReturnPath(href) ?? undefined },
    })
  }
  return user
}

/**
 * `/` has no content of its own (single-user app, no marketing page): send the
 * visitor to the dashboard or to the login page in a single hop.
 */
export async function redirectFromHome(): Promise<never> {
  const user = await fetchCurrentUser()
  throw redirect({ to: user ? ROUTES.dashboard : ROUTES.auth })
}
