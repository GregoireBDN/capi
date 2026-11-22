import { createFileRoute } from '@tanstack/react-router'
import { validateAccountSearch } from '#/components/accounts/account-origin'
import { AccountDetailPage } from '#/components/accounts/AccountDetailPage'

export const Route = createFileRoute('/_app/accounts/$accountId')({
  // `?from=savings&month=2026-10`: the page it was opened from (#324).
  validateSearch: validateAccountSearch,
  head: () => ({ meta: [{ title: 'Compte · Capi' }] }),
  component: AccountRoute,
})

function AccountRoute() {
  const { accountId } = Route.useParams()
  const search = Route.useSearch()
  return <AccountDetailPage accountId={accountId} origin={search} />
}
