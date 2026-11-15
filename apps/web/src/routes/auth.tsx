import { createFileRoute } from '@tanstack/react-router'
import { AuthCard } from '#/components/auth/AuthCard'
import { getRegistrationOpen } from '#/lib/auth'
import { redirectIfAuthenticated } from '#/lib/auth-guard'
import { safeReturnPath } from '#/lib/post-login'

interface AuthSearch {
  mode?: 'register'
  /** The OAuth consent page to come back to after signing in (#78). */
  redirect?: string
}

export const Route = createFileRoute('/auth')({
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const redirect = safeReturnPath(search['redirect']) ?? undefined
    if (search['mode'] === 'register') return { mode: 'register' }
    return redirect ? { redirect } : {}
  },
  beforeLoad: ({ search }) => redirectIfAuthenticated(search.redirect),
  loader: async () => ({ registrationOpen: await getRegistrationOpen() }),
  head: () => ({ meta: [{ title: 'Connexion · Finances' }] }),
  component: AuthPage,
})

function AuthPage() {
  const { registrationOpen } = Route.useLoaderData()
  const { mode } = Route.useSearch()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-8">
      <AuthCard
        // Remount when the requested mode changes so the card picks it up.
        key={mode ?? 'login'}
        registrationOpen={registrationOpen}
        initialMode={mode ?? 'login'}
      />
    </div>
  )
}
