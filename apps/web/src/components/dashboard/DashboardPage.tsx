import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ChevronRightIcon,
  InboxIcon,
  LayoutDashboardIcon,
  UploadIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { MonthReviewDto } from '#/api/types.gen'
import { NewAccountButton } from '#/components/accounts/AccountEditor'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { currentMonth } from '#/lib/calendar'
import { plural } from '#/lib/plural'
import { ROUTES } from '#/lib/routes'
import { AccountsList } from './AccountsList'
import { CashFlowChart, ChartCardSkeleton } from './DashboardCharts'
import { ForecastRow } from './ForecastCard'
import { MonthEnvelopes } from './MonthEnvelopes'
import { REVIEW_SEARCH } from '#/components/transactions/search'
import { MonthReview } from './MonthReview'
import {
  dashboardHistoryQuery,
  dashboardOverviewQuery,
  dashboardReviewQuery,
} from './queries'

/** One line: how many transactions wait, and the way to them. */
function ReviewCallout({ count }: { count: number }) {
  return (
    <Link
      to={ROUTES.transactions}
      search={REVIEW_SEARCH}
      className="bg-card hover:bg-muted/60 focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-xl border px-4 py-2 text-sm outline-none focus-visible:ring-2"
    >
      <InboxIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
      <span className="min-w-0 flex-1 font-medium">
        {plural(count, 'opération')} à revoir
      </span>
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </Link>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-96 rounded-xl" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

/** The month review, its loading and error states. */
function ReviewSection({
  review,
  onMonthChange,
}: {
  review: UseQueryResult<MonthReviewDto>
  onMonthChange?: (month: string | undefined) => void
}) {
  if (review.data) {
    const { defaultMonth, current } = review.data
    return (
      <MonthReview
        review={review.data}
        max={currentMonth()}
        // While the current month is shown: how it will end (#321).
        forecast={current ? <ForecastRow /> : undefined}
        // The default month is kept out of the URL.
        onMonthChange={(target) =>
          onMonthChange?.(target === defaultMonth ? undefined : target)
        }
      />
    )
  }
  if (review.isError) {
    return (
      <Alert>
        <AlertTitle>Bilan indisponible.</AlertTitle>
        <AlertDescription>
          <Button
            outline
            variant="secondary"
            size="sm"
            onClick={() => void review.refetch()}
          >
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Skeleton
      className="h-96 rounded-xl"
      aria-busy="true"
      aria-label="Chargement du bilan"
    />
  )
}

interface DashboardPageProps {
  /**
   * Month followed by the page, from the URL; absent = the API's default
   * (the current month).
   */
  month?: string
  onMonthChange?: (month: string | undefined) => void
  banner?: ReactNode
}

/**
 * The financial situation at a glance, read once a month (#262), following
 * one month (#321), the one chosen in the review's navigator (up to the
 * current month): its review (income, expenses, saved, net worth at its end
 * or, while it runs, how it will end; spending against the budget, accounts
 * left to update, the one action its state calls for) and its envelopes
 * (« Budget »); then the accounts with today's net worth and its change
 * since the last month end, and the monthly income and expenses. Every card
 * has the same header (`DashboardCardHeader`).
 */
export function DashboardPage({
  month,
  onMonthChange,
  banner,
}: DashboardPageProps) {
  const overview = useQuery(dashboardOverviewQuery())
  const review = useQuery(dashboardReviewQuery(month))
  // The month the page follows: the URL's, else the API's default.
  const shown = month ?? review.data?.defaultMonth
  const history = useQuery(dashboardHistoryQuery())
  const data = overview.data
  const isEmpty = data !== undefined && data.accounts.length === 0

  return (
    <div className="@container space-y-6">
      {/* No « Importer » here: the accounts not updated link to the import,
          as do the navigation and the month review. */}
      <PageHeader
        title="Tableau de bord"
        description="Votre patrimoine et le bilan du mois."
      />

      {banner}

      {overview.isPending && <OverviewSkeleton />}

      {/* A failed background refetch keeps showing the last figures. */}
      {overview.isError && !data && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger le tableau de bord.</AlertTitle>
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
              <LayoutDashboardIcon />
            </EmptyMedia>
            <EmptyTitle>Aucun compte pour l’instant</EmptyTitle>
            <EmptyDescription>
              Importez un relevé bancaire ou ajoutez vos comptes et placements :
              votre patrimoine et le bilan du mois s’afficheront ici.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row flex-wrap justify-center">
            <Button asChild>
              <Link to={ROUTES.import}>
                <UploadIcon aria-hidden />
                Importer un relevé
              </Link>
            </Button>
            <NewAccountButton label="Ajouter un compte" outline />
          </EmptyContent>
        </Empty>
      )}

      {data && !isEmpty && (
        <>
          {data.reviewCount > 0 && <ReviewCallout count={data.reviewCount} />}

          {/* One card per row (owner's choice): last month, this month
              and its end, where I stand, then the history. Each card lays its
              content out for its own width. */}
          <ReviewSection review={review} onMonthChange={onMonthChange} />
          {/* The envelopes of the same month. */}
          {shown && <MonthEnvelopes month={shown} />}
          <AccountsList accounts={data.accounts} netWorth={data.netWorth} />

          {/* Net worth over time is on its page (« Évolution » in Comptes). */}
          {history.data ? (
            <CashFlowChart months={history.data.months} />
          ) : history.isError ? (
            <Alert>
              <AlertTitle>Historique indisponible.</AlertTitle>
              <AlertDescription>
                Le graphique n’a pas pu être chargé.
              </AlertDescription>
            </Alert>
          ) : (
            <ChartCardSkeleton />
          )}
        </>
      )}
    </div>
  )
}
