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
import { Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  InboxIcon,
  LayoutDashboardIcon,
  UploadIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { NewAccountButton } from '#/components/accounts/AccountEditor'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { currentMonth, shiftMonth } from '#/lib/calendar'
import { plural } from '#/lib/plural'
import { ROUTES } from '#/lib/routes'
import { AccountsList } from './AccountsList'
import {
  CashFlowChart,
  ChartCardSkeleton,
  NetWorthChart,
} from './DashboardCharts'
import { ForecastCard } from './ForecastCard'
import { MonthEnvelopes } from './MonthEnvelopes'
import { MonthReview } from './MonthReview'
import {
  dashboardHistoryQuery,
  dashboardOverviewQuery,
  dashboardReviewQuery,
} from './queries'

function ReviewCallout({ count }: { count: number }) {
  return (
    <Alert>
      <InboxIcon aria-hidden />
      <AlertTitle>{plural(count, 'opération')} à revoir</AlertTitle>
      <AlertDescription>
        <p>Non catégorisées ou signalées lors d’un import.</p>
        <Link
          to={ROUTES.review}
          className="text-foreground relative inline-flex items-center gap-1 font-medium pointer-coarse:touch-hitbox underline-offset-4 hover:underline"
        >
          Ouvrir la file de revue
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </AlertDescription>
    </Alert>
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
  month,
  onMonthChange,
}: {
  month?: string
  onMonthChange?: (month: string | undefined) => void
}) {
  const review = useQuery(dashboardReviewQuery(month))
  const latest = shiftMonth(currentMonth(), -1)
  if (review.data) {
    return (
      <MonthReview
        review={review.data}
        latest={latest}
        // The previous month is the default: kept out of the URL.
        onMonthChange={(target) =>
          onMonthChange?.(target === latest ? undefined : target)
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
  /** Month reviewed, from the URL; absent = the previous calendar month. */
  month?: string
  onMonthChange?: (month: string | undefined) => void
  banner?: ReactNode
}

/**
 * The financial situation at a glance, read once a month: the review of the
 * last month (net worth and what moved it, spending against the budget,
 * accounts left to update) and, under it, the envelopes followed during the
 * current month ("Ce mois-ci"); then the end-of-month forecast, the history
 * charts and the accounts with their balances.
 */
export function DashboardPage({
  month,
  onMonthChange,
  banner,
}: DashboardPageProps) {
  const overview = useQuery(dashboardOverviewQuery())
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

          <div className="grid items-start gap-4 @4xl:grid-cols-2">
            <div className="min-w-0 space-y-4">
              <ReviewSection month={month} onMonthChange={onMonthChange} />
              <MonthEnvelopes />
            </div>
            <AccountsList accounts={data.accounts} netWorth={data.netWorth} />
          </div>

          <ForecastCard />

          <div className="grid gap-4 @4xl:grid-cols-2">
            {history.data ? (
              <>
                <NetWorthChart months={history.data.months} />
                <CashFlowChart months={history.data.months} />
              </>
            ) : history.isError ? (
              <Alert className="@4xl:col-span-2">
                <AlertTitle>Historique indisponible.</AlertTitle>
                <AlertDescription>
                  Les graphiques n’ont pas pu être chargés.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <ChartCardSkeleton title="Patrimoine net" />
                <ChartCardSkeleton title="Revenus et dépenses" />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
