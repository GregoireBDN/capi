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
  Skeleton,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PiggyBankIcon, UploadIcon } from 'lucide-react'
import { NewAccountButton } from '#/components/accounts/AccountEditor'
import { PageHeader } from '#/components/app-shell/PageHeader'
import type { SavingsOverviewDto } from '#/api/types.gen'
import { formatMonth } from '#/lib/calendar'
import { ROUTES } from '#/lib/routes'
import { GoalsSection } from './GoalsSection'
import { SavingsChart, SavingsChartSkeleton } from './SavingsChart'
import { SavingsKpis } from './SavingsKpis'
import { SavingsStock } from './SavingsStock'
import { TargetCard } from './TargetCard'
import { savingsOverviewQuery } from './queries'

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-36 rounded-xl" />
      <SavingsChartSkeleton />
    </div>
  )
}

/** Nothing to show yet: no income or expense and no savings account. */
function isEmptyOverview(overview: SavingsOverviewDto) {
  const { stock, months } = overview
  return (
    months.every((m) => m.incomeCents === 0 && m.expenseCents === 0) &&
    stock.cash.accounts.length === 0 &&
    stock.investments.accounts.length === 0
  )
}

/**
 * Savings at a glance: the month's net savings and rate (the dashboard's
 * figures, transfers excluded), recent averages, the monthly target, a
 * 12-month chart, what is put aside on savings and investment accounts, and
 * the goals with their projection.
 */
export function SavingsPage() {
  const overview = useQuery(savingsOverviewQuery())
  const data = overview.data
  const isEmpty = data !== undefined && isEmptyOverview(data)

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Épargne"
        description={data ? formatMonth(data.period.month) : undefined}
      />

      {overview.isPending && <OverviewSkeleton />}

      {/* A failed background refetch keeps showing the last figures. */}
      {overview.isError && !data && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger l’épargne.</AlertTitle>
          <AlertDescription>
            <Button
              outline
              variant="secondary"
              size="sm"
              onClick={() => void overview.refetch()}
            >
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isEmpty && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PiggyBankIcon />
            </EmptyMedia>
            <EmptyTitle>Pas encore d’épargne à suivre</EmptyTitle>
            <EmptyDescription>
              Importez vos relevés ou ajoutez vos livrets et placements :
              l’épargne de chaque mois, votre taux d’épargne et vos placements
              s’afficheront ici.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row flex-wrap justify-center">
            <Button asChild>
              <Link to={ROUTES.import}>
                <UploadIcon aria-hidden />
                Importer un relevé
              </Link>
            </Button>
            <NewAccountButton
              label="Ajouter un placement"
              defaultType="brokerage"
              outline
            />
          </EmptyContent>
        </Empty>
      )}

      {data && !isEmpty && (
        <>
          <SavingsKpis overview={data} />
          <div className="grid gap-4 @4xl:grid-cols-2">
            <SavingsChart
              months={data.months}
              target={data.monthlyTargetCents}
            />
            <TargetCard overview={data} />
          </div>
        </>
      )}

      {data && (
        <div className="grid gap-4 @4xl:grid-cols-2">
          <GoalsSection />
          {!isEmpty && <SavingsStock stock={data.stock} />}
        </div>
      )}
    </div>
  )
}
