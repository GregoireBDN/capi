import { createFileRoute } from '@tanstack/react-router'
import { AuthCard } from '#/components/auth/AuthCard'
import { getDemoSignInAvailable, getRegistrationOpen } from '#/lib/auth'
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
  loader: async () => {
    const [registrationOpen, demoSignIn] = await Promise.all([
      getRegistrationOpen(),
      getDemoSignInAvailable(),
    ])
    return { registrationOpen, demoSignIn }
  },
  head: () => ({ meta: [{ title: 'Connexion · Capi' }] }),
  component: AuthPage,
})

function AuthPage() {
  const { registrationOpen, demoSignIn } = Route.useLoaderData()
  const { mode } = Route.useSearch()

  return (
    <AuthCard
      // Remount when the requested mode changes so the card picks it up.
      key={mode ?? 'login'}
      registrationOpen={registrationOpen}
      demoSignIn={demoSignIn}
      initialMode={mode ?? 'login'}
    />
  )
}
