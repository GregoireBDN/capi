import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { valueAgeText } from '#/components/accounts/labels'
import { investmentsSummaryQuery } from '#/components/accounts/queries'
import {
  isValuedByHand,
  UpdateValueButton,
} from '#/components/accounts/UpdateValueButton'
import { ROUTES } from '#/lib/routes'
import { accountLinkSearch } from '#/components/accounts/account-origin'

/**
 * PEA, life insurance and employee savings accounts whose latest value is
 * older than a month, each with its "Mettre à jour" action. Nothing while
 * every value is recent (or the summary is loading or failed).
 */
export function StaleValuesReminder() {
  const summary = useQuery(investmentsSummaryQuery)
  const due =
    summary.data?.accounts.filter(
      (account) => account.stale && isValuedByHand(account.type),
    ) ?? []
  if (due.length === 0) return null
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Valeurs à mettre à jour</CardTitle>
        <CardDescription>
          Dernière valeur connue il y a plus d’un mois.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {due.map((account) => (
            <li
              key={account.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
            >
              <div className="min-w-[7rem] flex-1">
                <Link
                  to={ROUTES.account}
                  params={{ accountId: account.id }}
                  search={accountLinkSearch('review')}
                  className="font-medium break-words hover:underline"
                >
                  {account.name}
                </Link>
                {account.valueDate !== null &&
                  account.daysSinceLatest !== null && (
                    <p className="text-muted-foreground text-xs">
                      {valueAgeText(account.valueDate, account.daysSinceLatest)}
                    </p>
                  )}
              </div>
              <div className="ml-auto">
                <UpdateValueButton account={account} display="label" />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
