import { redirect } from '@tanstack/react-router'
import type { UserDto } from '#/api/types.gen'
import { fetchCurrentUser } from '#/lib/auth'
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

/** Guard for the login page: signed-in users go straight to the dashboard. */
export async function redirectIfAuthenticated(): Promise<void> {
  const user = await fetchCurrentUser()
  if (user) throw redirect({ to: ROUTES.dashboard })
}

/**
 * `/` has no content of its own (single-user app, no marketing page): send the
 * visitor to the dashboard or to the login page in a single hop.
 */
export async function redirectFromHome(): Promise<never> {
  const user = await fetchCurrentUser()
  throw redirect({ to: user ? ROUTES.dashboard : ROUTES.auth })
}
