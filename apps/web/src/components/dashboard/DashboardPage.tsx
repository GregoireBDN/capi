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
import { formatMonth } from '#/lib/calendar'
import { plural } from '#/lib/plural'
import { ROUTES } from '#/lib/routes'
import { AccountsList } from './AccountsList'
import {
  CashFlowChart,
  ChartCardSkeleton,
  NetWorthChart,
} from './DashboardCharts'
import { ForecastCard } from './ForecastCard'
import { KpiTiles } from './KpiTiles'
import { dashboardHistoryQuery, dashboardOverviewQuery } from './queries'

function ImportButton() {
  return (
    <Button asChild outline variant="secondary" size="sm">
      <Link to={ROUTES.import}>
        <UploadIcon aria-hidden />
        Importer
      </Link>
    </Button>
  )
}

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
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        <Skeleton className="col-span-2 h-36 rounded-xl @2xl:col-span-4" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
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

/**
 * The financial situation at a glance: net worth and its trend, the current
 * month (Europe/Paris) against the previous one, monthly cash flow, the
 * accounts with their balances, and what needs attention.
 */
export function DashboardPage({ banner }: { banner?: ReactNode }) {
  const overview = useQuery(dashboardOverviewQuery)
  const history = useQuery(dashboardHistoryQuery())
  const data = overview.data
  const isEmpty = data !== undefined && data.accounts.length === 0

  return (
    <div className="@container space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Tableau de bord"
          description={data ? formatMonth(data.current.month) : undefined}
        />
        {data && !isEmpty && <ImportButton />}
      </div>

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

          <KpiTiles overview={data} history={history.data?.months} />

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

          <AccountsList accounts={data.accounts} netWorth={data.netWorth} />
        </>
      )}
    </div>
  )
}
