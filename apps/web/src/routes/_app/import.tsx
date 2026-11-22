import { createFileRoute } from '@tanstack/react-router'
import { ImportPage } from '#/components/import/ImportPage'

interface ImportSearch {
  /** Account preselected in the upload form (from an account page). */
  account?: string
}

export const Route = createFileRoute('/_app/import')({
  validateSearch: (search: Record<string, unknown>): ImportSearch =>
    typeof search.account === 'string' && search.account !== ''
      ? { account: search.account }
      : {},
  head: () => ({ meta: [{ title: 'Relevés · Capi' }] }),
  component: ImportRoute,
})

function ImportRoute() {
  const { account } = Route.useSearch()
  return <ImportPage accountId={account} />
}
