import { createFileRoute } from '@tanstack/react-router'
import { validateOwedSearch } from '#/components/owed/format'
import type { OwedSide } from '#/components/owed/format'
import { OwedPage } from '#/components/owed/OwedPage'
import { ROUTES } from '#/lib/routes'

export const Route = createFileRoute('/_app/owed/')({
  validateSearch: validateOwedSearch,
  head: () => ({ meta: [{ title: 'Dépenses partagées · Capi' }] }),
  component: OwedRoute,
})

function OwedRoute() {
  const { side } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <OwedPage
      side={side ?? 'owed'}
      onSideChange={(next: OwedSide) =>
        void navigate({
          to: ROUTES.owed,
          search: next === 'owe' ? { side: 'owe' } : {},
          replace: true,
        })
      }
    />
  )
}
