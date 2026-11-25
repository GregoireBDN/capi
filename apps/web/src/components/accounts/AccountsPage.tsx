import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  formatSignedPercent,
  Skeleton,
  EmptyState,
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileUpIcon, LandmarkIcon, TrendingUpIcon } from 'lucide-react'
import { useState } from 'react'
import type {
  AccountDto,
  InvestmentAccountSummaryDto,
  InvestmentsTotalsDto,
} from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { accountsQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { AccountEditor } from './AccountEditor'
import { AddInvestmentSheet } from './AddInvestmentSheet'
import { AccountList, AccountListTotal } from './AccountList'
import type { AccountListItem } from './AccountList'
import { isInvestmentType } from './labels'
import { archivedAccountsQuery, investmentsSummaryQuery } from './queries'

/** A row of the lists: investments carry their value, gain and staleness. */
function listItem(
  account: AccountDto,
  summary?: InvestmentAccountSummaryDto,
): AccountListItem {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    institution: account.institution,
    valueCents: summary ? summary.valueCents : account.balanceCents,
    valueDate: summary ? summary.valueDate : account.balanceDate,
    gainCents: summary?.gainCents ?? null,
    returnRate: summary?.returnRate ?? null,
    stale: summary?.stale ?? false,
  }
}

/** What was paid in, and the accounts the gain leaves out. */
function InvestmentTotals({ totals }: { totals: InvestmentsTotalsDto }) {
  if (totals.contributionsCents === null || totals.gainCents === null) {
    return null
  }
  return (
    <div className="text-muted-foreground space-y-0.5 text-sm">
      <p className="tabular-nums">
        Investi {formatCents(totals.contributionsCents)}
        {totals.returnRate !== null &&
          ` · ${formatSignedPercent(totals.returnRate)}`}
      </p>
      {totals.withoutContributionsCount > 0 && (
        <p className="text-xs">
          Résultat hors {plural(totals.withoutContributionsCount, 'compte')}{' '}
          sans montant investi connu.
        </p>
      )}
    </div>
  )
}

/**
 * Every open account, cash apart from investments, with its value and how
 * recent it is; each opens its detail page.
 */
export function AccountsPage() {
  const accounts = useQuery(accountsQuery)
  const summary = useQuery(investmentsSummaryQuery)
  const archived = useQuery(archivedAccountsQuery)
  const [adding, setAdding] = useState<'investment' | 'account' | null>(null)

  const list = accounts.data ?? []
  const cash = list.filter((account) => !isInvestmentType(account.type))
  const investments = list.filter((account) => isInvestmentType(account.type))
  const byId = new Map(summary.data?.accounts.map((row) => [row.id, row]))
  const sum = (items: AccountDto[]) =>
    items.reduce((total, account) => total + (account.balanceCents ?? 0), 0)

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Comptes"
        description="Vos comptes, leur valeur et la date de leur dernier relevé."
        actions={[
          {
            label: 'Ajouter un compte',
            icon: <LandmarkIcon />,
            primary: true,
            onSelect: () => setAdding('account'),
          },
          {
            label: 'Ajouter un placement',
            icon: <TrendingUpIcon />,
            onSelect: () => setAdding('investment'),
          },
        ]}
      />
      <AddInvestmentSheet
        open={adding === 'investment'}
        onOpenChange={(open) => setAdding(open ? 'investment' : null)}
      />
      <AccountEditor
        open={adding === 'account'}
        onOpenChange={(open) => setAdding(open ? 'account' : null)}
      />

      {accounts.isPending && (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {accounts.isError && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger les comptes.</AlertTitle>
          <AlertDescription>
            <Button size="sm" outline onClick={() => void accounts.refetch()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {accounts.isSuccess && list.length === 0 && (
        <EmptyState
          icon={<LandmarkIcon />}
          title="Aucun compte pour l’instant"
          description="Ajoutez votre compte courant, vos livrets, vos placements (PEA, assurance vie…) ou vos cryptos, ou importez un relevé : son compte est créé au passage."
          actions={
            <Button asChild>
              <Link to={ROUTES.import}>
                <FileUpIcon aria-hidden />
                Importer un relevé
              </Link>
            </Button>
          }
        />
      )}

      <div className="grid gap-4 @3xl:grid-cols-2 @3xl:items-start">
        {cash.length > 0 && (
          <Card className="min-w-0">
            <CardHeader className="gap-1">
              <CardTitle>Liquidités</CardTitle>
              <AccountListTotal totalCents={sum(cash)} />
            </CardHeader>
            <CardContent>
              <AccountList
                from="accounts"
                groups={[
                  { id: 'cash', accounts: cash.map((a) => listItem(a)) },
                ]}
              />
            </CardContent>
          </Card>
        )}
        {investments.length > 0 && (
          <Card className="min-w-0">
            <CardHeader className="gap-1">
              <CardTitle>Investissements</CardTitle>
              <AccountListTotal
                totalCents={summary.data?.totals.valueCents ?? sum(investments)}
                gainCents={summary.data?.totals.gainCents ?? null}
              />
              {summary.data && (
                <InvestmentTotals totals={summary.data.totals} />
              )}
            </CardHeader>
            <CardContent>
              <AccountList
                from="accounts"
                groups={[
                  {
                    id: 'investments',
                    accounts: investments.map((account) =>
                      listItem(account, byId.get(account.id)),
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>
        )}
      </div>
      {archived.data && archived.data.length > 0 && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Comptes archivés</CardTitle>
            <CardDescription>
              Hors des listes et des imports ; leur historique est conservé.
              Ouvrez-en un pour le réactiver.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountList
              from="accounts"
              groups={[
                {
                  id: 'archived',
                  accounts: archived.data.map((account) => listItem(account)),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
