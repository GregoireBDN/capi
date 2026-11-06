import { createFileRoute } from '@tanstack/react-router'
import { AccountDetailPage } from '#/components/accounts/AccountDetailPage'

export const Route = createFileRoute('/_app/accounts/$accountId')({
  head: () => ({ meta: [{ title: 'Compte · Finances' }] }),
  component: AccountRoute,
})

function AccountRoute() {
  const { accountId } = Route.useParams()
  return <AccountDetailPage accountId={accountId} />
}
