import { createFileRoute } from '@tanstack/react-router'
import { SpendingPage } from '#/components/spending/SpendingPage'
import { parseSpendingSearch } from '#/components/spending/search'

export const Route = createFileRoute('/_app/spending')({
  // Its month is in the app header (#401).
  staticData: { monthBar: true },
  // Filters live in the URL: reload, back/forward and shared links keep them.
  validateSearch: parseSpendingSearch,
  head: () => ({ meta: [{ title: 'Dépenses · Finances' }] }),
  component: SpendingRoute,
})

function SpendingRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SpendingPage
      search={search}
      onSearchChange={(next) =>
        void navigate({ search: next, resetScroll: false })
      }
    />
  )
}
