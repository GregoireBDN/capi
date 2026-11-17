import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  formatSignedEuros,
  formatSignedPercent,
  Skeleton,
  EmptyState,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ChevronRightIcon,
  LandmarkIcon,
  PlusIcon,
  UploadIcon,
} from 'lucide-react'
import { useState } from 'react'
import type {
  AccountDto,
  InvestmentAccountSummaryDto,
  InvestmentsTotalsDto,
} from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { ACCOUNT_TYPE_LABELS } from '#/components/dashboard/labels'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { accountsQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { AccountEditor } from './AccountEditor'
import { AddInvestmentSheet } from './AddInvestmentSheet'
import { formatAge, isInvestmentType } from './labels'
import { archivedAccountsQuery, investmentsSummaryQuery } from './queries'
import { isValuedByHand, UpdateValueButton } from './UpdateValueButton'

function AccountRow({
  account,
  summary,
}: {
  account: AccountDto
  summary?: InvestmentAccountSummaryDto
}) {
  const kind = [ACCOUNT_TYPE_LABELS[account.type], account.institution]
    .filter(Boolean)
    .join(' · ')
  const date = summary ? summary.valueDate : account.balanceDate
  const gain = summary?.gainCents ?? null
  return (
    <li className="flex items-center gap-1">
      <Link
        to={ROUTES.account}
        params={{ accountId: account.id }}
        className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2.5 text-sm outline-none focus-visible:ring-2"
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="min-w-[7rem] flex-1 font-medium break-words">
              {account.name}
            </p>
            <p className="ml-auto font-medium whitespace-nowrap tabular-nums">
              {account.balanceCents === null
                ? '—'
                : formatCents(account.balanceCents)}
            </p>
          </div>
          <div className="text-muted-foreground flex items-baseline justify-between gap-3 text-xs">
            <p className="min-w-0 truncate">
              {date === null ? 'Aucune valeur' : formatCalendarDate(date)}
              {' · '}
              {kind}
            </p>
            {gain !== null && (
              <p className="shrink-0 tabular-nums">{formatSignedEuros(gain)}</p>
            )}
          </div>
          {summary?.stale && summary.daysSinceLatest !== null && (
            <Badge variant="warning" outline>
              Mise à jour {formatAge(summary.daysSinceLatest)}
            </Badge>
          )}
        </div>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </Link>
      {account.archivedAt === null && isValuedByHand(account.type) && (
        <UpdateValueButton account={account} />
      )}
    </li>
  )
}

/** One sentence: it wraps instead of squeezing three columns on a phone. */
function InvestmentTotals({ totals }: { totals: InvestmentsTotalsDto }) {
  if (totals.contributionsCents === null || totals.gainCents === null) {
    return null
  }
  return (
    <div className="text-muted-foreground space-y-1 text-sm">
      <p>
        Versé {formatCents(totals.contributionsCents)} · plus-value{' '}
        <span className="text-foreground font-medium tabular-nums">
          {formatSignedEuros(totals.gainCents)}
        </span>
        {totals.returnRate !== null &&
          ` (${formatSignedPercent(totals.returnRate)})`}
      </p>
      {totals.withoutContributionsCount > 0 && (
        <p className="text-xs">
          Plus-value hors {plural(totals.withoutContributionsCount, 'compte')}{' '}
          sans versements connus.
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
            label: 'Ajouter un placement',
            icon: <PlusIcon />,
            primary: true,
            onSelect: () => setAdding('investment'),
          },
          {
            label: 'Nouveau compte',
            icon: <LandmarkIcon />,
            onSelect: () => setAdding('account'),
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
                <UploadIcon aria-hidden />
                Importer un relevé
              </Link>
            </Button>
          }
        />
      )}

      <div className="grid gap-4 @3xl:grid-cols-2 @3xl:items-start">
        {cash.length > 0 && (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Liquidités</CardTitle>
              <CardDescription className="tabular-nums">
                {formatCents(sum(cash))}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {cash.map((account) => (
                  <AccountRow key={account.id} account={account} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {investments.length > 0 && (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Investissements</CardTitle>
              <CardDescription className="tabular-nums">
                {formatCents(
                  summary.data?.totals.valueCents ?? sum(investments),
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.data && (
                <InvestmentTotals totals={summary.data.totals} />
              )}
              <ul className="divide-y">
                {investments.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    summary={byId.get(account.id)}
                  />
                ))}
              </ul>
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
            <ul className="divide-y">
              {archived.data.map((account) => (
                <AccountRow key={account.id} account={account} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
