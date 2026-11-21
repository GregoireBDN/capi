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
import { useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { PiggyBankIcon, UploadIcon } from 'lucide-react'
import { AddInvestmentButton } from '#/components/accounts/AddInvestmentSheet'
import { PageHeader } from '#/components/app-shell/PageHeader'
import type { SavingsOverviewDto } from '#/api/types.gen'
import { currentMonth } from '#/lib/calendar'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { MonthToolbar } from '#/components/month/MonthToolbar'
import { ROUTES } from '#/lib/routes'
import { GoalsSection } from './GoalsSection'
import { CashFlowSection } from './CashFlowChart'
import { MonthCard } from './MonthCard'
import { MonthMovedCard, YearMovedCard } from './MovedCard'
import { StockCard } from './StockCard'
import { savingsOverviewQuery } from './queries'
import { useWideLayout } from './use-wide-layout'

/**
 * One card per row at every width (the owner, #407: two columns of cards
 * read worse on a computer); from `WIDE_LAYOUT_REM` the cards take their
 * computer layout (rows of figures, tables).
 */
const COLUMN = 'space-y-4'

function OverviewSkeleton() {
  return (
    <div className={COLUMN} aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
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
 * Épargne (#407, the owner's « A. Jauge » with far less text): the month
 * first, « Épargné » (income − expenses, transfers between the owner's
 * accounts excluded) against its target and « Mis de côté » (what left the
 * checking accounts for savings and investments), then « Ce que vous
 * avez »: « Livrets et placements », the goals and the 12 months of « Mis
 * de côté ». The month bar moves between months: no chart of the months.
 */
interface SavingsPageProps {
  /** Month of the headline figures, from the URL; absent = the API's pick. */
  month?: string
  onMonthChange: (month: string | undefined) => void
}

export function SavingsPage({
  month: monthParam,
  onMonthChange,
}: SavingsPageProps) {
  const overview = useQuery(savingsOverviewQuery(monthParam))
  const page = useRef<HTMLDivElement>(null)
  const wide = useWideLayout(page)
  const data = overview.data
  const isEmpty = data !== undefined && isEmptyOverview(data)
  const month = monthParam ?? data?.period.month
  // The default month stays out of the URL.
  const go = (target: string) =>
    onMonthChange(target === data?.period.defaultMonth ? undefined : target)

  return (
    <div ref={page} className="@container space-y-6">
      <PageHeader title="Épargne" />

      {/* The month is in the app header (#401) from the first render:
          the current month until the API says which month it shows. */}
      <MonthToolbar
        navigator={
          <MonthNavigator month={month ?? currentMonth()} onMonthChange={go} />
        }
        // Said only when the month is not a full one.
        period={
          isEmpty || data?.period.status === 'complete'
            ? undefined
            : data?.period
        }
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
            <AddInvestmentButton outline />
          </EmptyContent>
        </Empty>
      )}

      {data && !isEmpty && (
        <>
          <div className={COLUMN}>
            <MonthCard overview={data} onMonthChange={go} wide={wide} />
            {/* A computer has « Mis de côté » in the month's row. */}
            {!wide && <MonthMovedCard overview={data} />}
          </div>
          <section aria-labelledby="savings-held" className="space-y-4">
            <h2
              id="savings-held"
              className="px-1 text-lg font-semibold tracking-tight"
            >
              Ce que vous avez
            </h2>
            <div className={COLUMN}>
              <StockCard stock={data.stock} wide={wide} />
              <GoalsSection
                projectionAverageCents={data.projectionAverageCents}
                wide={wide}
              />
              <YearMovedCard overview={data} wide={wide} />
            </div>
          </section>
          {/* « Revenus et dépenses » over 12 months, from the dashboard (#405). */}
          <CashFlowSection />
        </>
      )}

      {/* Goals can be set before any data. */}
      {isEmpty && (
        <GoalsSection projectionAverageCents={data.projectionAverageCents} />
      )}
    </div>
  )
}
