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
  HistoryIcon,
  PlusIcon,
  RepeatIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UploadIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { ForecastDto } from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { formatShortDay } from '#/components/subscriptions/format'
import { formatCents } from '#/lib/money'
import { accountsQuery, isBankAccount } from '#/lib/queries'
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

/**
 * The data stops more than `staleAfterDays` before today (#215): the forecast
 * is only indicative and raises no low-balance alert. Importing a statement
 * or noting the expenses since makes it reliable again.
 */
export function StaleForecastNotice({ forecast }: { forecast: ForecastDto }) {
  const [addOpen, setAddOpen] = useState(false)
  if (!forecast.stale) return null
  return (
    <Alert>
      <HistoryIcon aria-hidden />
      <AlertTitle>Prévision indicative</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {forecast.knownUntil
            ? `Vos relevés s’arrêtent au ${formatShortDay(forecast.knownUntil)} : la prévision part de cette date, sans alerte de solde bas.`
            : 'Aucun relevé importé : la prévision part d’aujourd’hui, sans alerte de solde bas.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to={ROUTES.import}>
              <UploadIcon aria-hidden />
              Importer un relevé
            </Link>
          </Button>
          <Button
            size="sm"
            outline
            variant="secondary"
            onClick={() => setAddOpen(true)}
          >
            <PlusIcon aria-hidden />
            Ajouter une dépense
          </Button>
        </div>
      </AlertDescription>
      <ManualTransactionSheet open={addOpen} onOpenChange={setAddOpen} />
    </Alert>
  )
}

/** "solde connu au …, prévision à partir du …" (#215). */
export function knownBalanceNote(forecast: ForecastDto): string {
  const known = forecast.knownUntil ?? forecast.startingBalanceDate
  const from = `prévision à partir du ${formatShortDay(forecast.projectedFrom)}`
  return known ? `solde connu au ${formatShortDay(known)}, ${from}` : from
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
        {knownBalanceNote(forecast)}
        {forecast.estimate && forecast.estimate.totalCents !== 0
          ? ` · « À payer » inclut ${formatCents(-forecast.estimate.totalCents)} de dépenses courantes estimées`
          : ''}
        {forecast.estimate && forecast.estimate.coveredCents > 0
          ? ` (moins ${formatCents(forecast.estimate.coveredCents)} déjà notés à la main)`
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
    (account) => isBankAccount(account) && account.archivedAt === null,
  )

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Prévision fin de mois"
        description={
          data
            ? `Du ${formatShortDay(data.projectedFrom)} au ${formatShortDay(data.monthEnd)}`
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
          <StaleForecastNotice forecast={data} />
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
          <div className="grid items-start gap-4 @4xl:grid-cols-2">
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
