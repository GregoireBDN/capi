import { createFileRoute } from '@tanstack/react-router'
import { AuthCard } from '#/components/auth/AuthCard'
import { getRegistrationOpen } from '#/lib/auth'

interface AuthSearch {
  mode?: 'register'
}

export const Route = createFileRoute('/auth')({
  validateSearch: (search: Record<string, unknown>): AuthSearch =>
    search['mode'] === 'register' ? { mode: 'register' } : {},
  loader: async () => ({ registrationOpen: await getRegistrationOpen() }),
  component: AuthPage,
})

function AuthPage() {
  const { registrationOpen } = Route.useLoaderData()
  const { mode } = Route.useSearch()

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <AuthCard
        // Remount when the requested mode changes so the card picks it up.
        key={mode ?? 'login'}
        registrationOpen={registrationOpen}
        initialMode={mode ?? 'login'}
      />
    </div>
  )
}
