import { createFileRoute } from '@tanstack/react-router'
import { TransactionsPage } from '#/components/transactions/TransactionsPage'
import { parseTransactionsSearch } from '#/components/transactions/search'

export const Route = createFileRoute('/_app/transactions')({
  // Its month is in the app header (#401).
  staticData: { monthBar: true, movementsTab: 'operations' },
  // Filters live in the URL: reload, back/forward and shared links keep them.
  validateSearch: parseTransactionsSearch,
  head: () => ({ meta: [{ title: 'Opérations · Capi' }] }),
  component: TransactionsRoute,
})

function TransactionsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <TransactionsPage
      search={search}
      onSearchChange={(next, options) =>
        void navigate({
          search: next,
          replace: options?.replace,
          resetScroll: false,
        })
      }
    />
  )
}
