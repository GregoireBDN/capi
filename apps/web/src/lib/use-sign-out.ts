import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useAuth } from '#/lib/auth-context'
import { ROUTES } from '#/lib/routes'

/**
 * Signs out and opens the sign-in page: the one sign-out of the app, shared
 * by the Réglages row and the sidebar's button (#353). `logout()` calls the
 * API (cookies cleared, `Clear-Site-Data: "cache"`) and drops the cached
 * current user.
 */
export function useSignOut(): () => Promise<void> {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return useCallback(async () => {
    await logout()
    await navigate({ to: ROUTES.auth })
  }, [logout, navigate])
}
