import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { AuthCard } from '#/components/auth/AuthCard'
import { getRegistrationOpen } from '#/lib/auth'
import { useAuth } from '#/lib/auth-context'
import { redirectIfAuthenticated } from '#/lib/auth-guard'
import { ROUTES } from '#/lib/routes'

interface AuthSearch {
  mode?: 'register'
}

export const Route = createFileRoute('/auth')({
  validateSearch: (search: Record<string, unknown>): AuthSearch =>
    search['mode'] === 'register' ? { mode: 'register' } : {},
  beforeLoad: redirectIfAuthenticated,
  loader: async () => ({ registrationOpen: await getRegistrationOpen() }),
  head: () => ({ meta: [{ title: 'Connexion · Finances' }] }),
  component: AuthPage,
})

/**
 * The access-token cookie is short-lived and the refresh cookie never reaches
 * the web server, so an SSR request made after the access token expired is
 * sent here even though the session is still valid. The client auth context
 * renews the session on mount (see `api-client.ts`); if that first check finds
 * a user, continue to the dashboard instead of asking for the password again.
 */
function useResumeRestoredSession() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const awaitingFirstCheck = useRef(loading)

  useEffect(() => {
    if (!awaitingFirstCheck.current || loading) return
    awaitingFirstCheck.current = false
    if (user) void navigate({ to: ROUTES.dashboard, replace: true })
  }, [loading, user, navigate])
}

function AuthPage() {
  const { registrationOpen } = Route.useLoaderData()
  const { mode } = Route.useSearch()
  useResumeRestoredSession()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-12">
      <img src="/logo.svg" alt="Finances" className="size-12" />
      <AuthCard
        // Remount when the requested mode changes so the card picks it up.
        key={mode ?? 'login'}
        registrationOpen={registrationOpen}
        initialMode={mode ?? 'login'}
      />
    </div>
  )
}
