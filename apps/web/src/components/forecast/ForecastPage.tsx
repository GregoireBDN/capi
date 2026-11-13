import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  formatWholeEuros,
  Skeleton,
  StatCard,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  RepeatIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UploadIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { ForecastDto } from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { formatShortDay } from '#/components/subscriptions/format'
import { formatCents } from '#/lib/money'
import { accountsQuery, isTransactional } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { ForecastChart } from './ForecastChart'
import { ForecastItems } from './ForecastItems'
import { ForecastSettings } from './ForecastSettings'
import { forecastQuery } from './queries'
import { useForecastThreshold } from './threshold'

/** Warning shown when the projection goes under the threshold. */
export function BelowThresholdAlert({ forecast }: { forecast: ForecastDto }) {
  const below = forecast.belowThreshold
  if (!below) return null
  return (
    <Alert variant="warning">
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>
        Solde sous {formatCents(forecast.thresholdCents)} le{' '}
        {formatShortDay(below.date)}
      </AlertTitle>
      <AlertDescription>
        Point bas prévu : {formatCents(forecast.lowest.balanceCents)} le{' '}
        {formatShortDay(forecast.lowest.date)}
      </AlertDescription>
    </Alert>
  )
}

function ForecastTiles({ forecast }: { forecast: ForecastDto }) {
  const charges =
    forecast.expectedDebitsCents + (forecast.estimate?.totalCents ?? 0)
  return (
    <section aria-label="Chiffres clés" className="space-y-2">
      <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2 @2xl:grid-cols-4">
        <StatCard
          className="@lg:col-span-2 @2xl:col-span-4"
          label="Solde prévu fin de mois"
          icon={<TrendingUpIcon />}
          value={forecast.endBalanceCents}
          previousValue={forecast.startingBalanceCents}
          deltaDisplay="value"
          comparisonLabel="par rapport au solde actuel"
        />
        <StatCard
          label="Solde actuel"
          value={forecast.startingBalanceCents}
          valueFormatter={formatWholeEuros}
        />
        <StatCard
          label="Point bas"
          value={forecast.lowest.balanceCents}
          valueFormatter={formatWholeEuros}
        />
        <StatCard
          label="À payer"
          value={-charges}
          valueFormatter={formatWholeEuros}
        />
        <StatCard
          label="À recevoir"
          value={forecast.expectedCreditsCents}
          valueFormatter={formatWholeEuros}
        />
      </div>
      <p className="text-muted-foreground px-1 text-xs">
        Point bas le {formatShortDay(forecast.lowest.date)} ·{' '}
        {forecast.startingBalanceDate
          ? `solde connu au ${formatShortDay(forecast.startingBalanceDate)}`
          : 'aucun solde connu'}
        {forecast.estimate && forecast.estimate.totalCents !== 0
          ? ` · « À payer » inclut ${formatCents(-forecast.estimate.totalCents)} de dépenses courantes estimées`
          : ''}
      </p>
    </section>
  )
}

function NoRecurringItems() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RepeatIcon />
        </EmptyMedia>
        <EmptyTitle>Aucun abonnement confirmé</EmptyTitle>
        <EmptyDescription>
          La prévision s’appuie sur vos opérations récurrentes confirmées
          (loyer, salaire, abonnements…).
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to={ROUTES.subscriptions}>Confirmer mes abonnements</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function NoAccount() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UploadIcon />
        </EmptyMedia>
        <EmptyTitle>Aucun compte courant</EmptyTitle>
        <EmptyDescription>
          Importez un relevé de votre compte courant pour prévoir votre solde de
          fin de mois.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to={ROUTES.import}>Importer un relevé</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function ForecastSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement">
      <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2">
        <Skeleton className="h-24 rounded-xl @lg:col-span-2" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}

/**
 * "Prévision fin de mois": the current balance of the selected accounts, the
 * confirmed recurring items still expected this month and, optionally, the
 * usual day-to-day spending, projected day by day until month end.
 */
export function ForecastPage() {
  const [thresholdCents, setThresholdCents] = useForecastThreshold()
  const [accountIds, setAccountIds] = useState<string[] | undefined>()
  const [includeVariable, setIncludeVariable] = useState(true)
  const accounts = useQuery(accountsQuery)
  const forecast = useQuery(
    forecastQuery({ accountIds, thresholdCents, includeVariable }),
  )
  const data = forecast.data
  const choices = (accounts.data ?? []).filter(
    (account) => isTransactional(account) && account.archivedAt === null,
  )

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Prévision fin de mois"
        description={
          data
            ? `Du ${formatShortDay(data.today)} au ${formatShortDay(data.monthEnd)}`
            : undefined
        }
      />

      {forecast.isPending && <ForecastSkeleton />}

      {forecast.isError && !data && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de calculer la prévision.</AlertTitle>
          <AlertDescription>
            <Button
              outline
              variant="secondary"
              size="sm"
              onClick={() => void forecast.refetch()}
            >
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {data && data.accounts.length === 0 && <NoAccount />}

      {data && data.accounts.length > 0 && (
        <>
          <BelowThresholdAlert forecast={data} />
          <ForecastTiles forecast={data} />
          <ForecastSettings
            accounts={choices}
            selectedIds={accountIds ?? data.accounts.map((a) => a.id)}
            onSelectedIdsChange={setAccountIds}
            thresholdCents={thresholdCents}
            onThresholdChange={setThresholdCents}
            includeVariable={includeVariable}
            onIncludeVariableChange={setIncludeVariable}
          />
          <div className="grid gap-4 @4xl:grid-cols-2">
            <ForecastChart forecast={data} />
            {data.recurringItemCount === 0 ? (
              <div className="min-w-0 space-y-4">
                <NoRecurringItems />
                {data.estimate && <ForecastItems forecast={data} />}
              </div>
            ) : (
              <ForecastItems forecast={data} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
