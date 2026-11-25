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
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileUpIcon, LayoutDashboardIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NewAccountButton } from '#/components/accounts/AccountEditor'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { coverageQuery } from '#/components/month/coverage'
import { repaymentSuggestionsQuery } from '#/components/owed/queries'
import { groupItems } from '#/components/subscriptions/format'
import { recurringListQuery } from '#/components/subscriptions/queries'
import { currentDay, currentMonth, shiftMonth } from '#/lib/calendar'
import { ROUTES } from '#/lib/routes'
import { DashboardTodos } from './DashboardTodos'
import { GlanceCard } from './GlanceCard'
import { buildTodos, isStale } from './glance'
import { MonthEnvelopes } from './MonthEnvelopes'
import { dashboardOverviewQuery, dashboardReviewQuery } from './queries'

const longDay = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** `2026-11-21` → « Samedi 21 novembre ». */
export function formatToday(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const text = longDay.format(new Date(Date.UTC(year, month - 1, date)))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const BANK_TYPES = new Set(['checking', 'savings'])

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}

/**
 * The dashboard, read in a few seconds each time the app opens (#405, the
 * owner's direction « A. À faire, puis un chiffre »). It follows today, not
 * a month (past months are read in « Bilan du mois »): what is waiting
 * first (`DashboardTodos`, hidden when all is done), then one card with what
 * is left to spend this month against the pace, the end of the month and
 * today's net worth (`GlanceCard`), then the envelopes, where an expense is
 * noted in one tap. Everything else is one tap away on its page: the
 * accounts on Comptes, the month's figures on Bilan du mois, the year's
 * income and expenses on Épargne.
 */
export function DashboardPage({ banner }: { banner?: ReactNode }) {
  const today = currentDay()
  const month = currentMonth()
  const previousMonth = shiftMonth(month, -1)
  const overview = useQuery(dashboardOverviewQuery())
  const review = useQuery(dashboardReviewQuery(month))
  const previous = useQuery(dashboardReviewQuery(previousMonth))
  const coverage = useQuery(coverageQuery)
  const repayments = useQuery(repaymentSuggestionsQuery)
  const recurring = useQuery(recurringListQuery)

  const data = overview.data
  const isEmpty = data !== undefined && data.accounts.length === 0
  const dataUntil = coverage.data?.dataUntil ?? null
  const stale = isStale(dataUntil, today)

  const todos =
    data && coverage.data
      ? buildTodos({
          today,
          dataUntil,
          hasBankAccount: data.accounts.some((account) =>
            BANK_TYPES.has(account.type),
          ),
          // Only a month that has data can be closed.
          previous:
            previous.data && coverage.data.months.includes(previousMonth)
              ? {
                  month: previousMonth,
                  closed: previous.data.closedAt !== null,
                  missing: previous.data.missing.length,
                  nextMonthBudgeted: previous.data.nextMonthBudgeted,
                }
              : null,
          reviewCount: data.reviewCount,
          repayments: (repayments.data ?? []).map((suggestion) => ({
            contactName: suggestion.contactName,
            amountCents: suggestion.amountCents,
          })),
          renewals: (recurring.data ?? [])
            .filter(
              (item) =>
                item.status === 'confirmed' &&
                item.renewalReminder &&
                item.renewalDate !== null,
            )
            .map((item) => ({
              id: item.id,
              name: item.name,
              renewalDate: item.renewalDate!,
            })),
          suggestedSubscriptions: recurring.data
            ? groupItems(recurring.data).suggestions.length
            : 0,
          staleValues: data.accounts.filter(
            (account) => account.group === 'investments' && account.stale,
          ).length,
        })
      : []

  return (
    <div className="@container space-y-3">
      {/* No « Importer » here: « À faire » asks for an import when the data
          is stale, as do the navigation and the month review. */}
      <PageHeader title="Tableau de bord" description={formatToday(today)} />

      {banner}

      {overview.isPending && <DashboardSkeleton />}

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
              ce qu’il vous reste à dépenser et la fin du mois s’afficheront
              ici.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row flex-wrap justify-center">
            <Button asChild>
              <Link to={ROUTES.import}>
                <FileUpIcon aria-hidden />
                Importer un relevé
              </Link>
            </Button>
            <NewAccountButton
              label="Ajouter un compte"
              outline
              from="dashboard"
            />
          </EmptyContent>
        </Empty>
      )}

      {data && !isEmpty && (
        <>
          <DashboardTodos todos={todos} today={today} />
          {review.data ? (
            <GlanceCard
              review={review.data}
              netWorth={data.netWorth}
              today={today}
              dataUntil={dataUntil}
              stale={stale}
            />
          ) : review.isError ? (
            <Alert>
              <AlertTitle>Le mois en cours est indisponible.</AlertTitle>
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
          ) : (
            <Skeleton
              className="h-64 rounded-xl"
              aria-busy="true"
              aria-label="Chargement du mois"
            />
          )}
          <MonthEnvelopes />
        </>
      )}
    </div>
  )
}
