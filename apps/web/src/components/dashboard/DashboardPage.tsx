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
import {
  FileUpIcon,
  LayoutDashboardIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  DashboardOverviewDto,
  DashboardWidgetDto,
  MonthReviewDto,
} from '#/api/types.gen'
import { NewAccountButton } from '#/components/accounts/AccountEditor'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import { coverageQuery } from '#/components/month/coverage'
import { repaymentSuggestionsQuery } from '#/components/owed/queries'
import { groupItems } from '#/components/subscriptions/format'
import { recurringListQuery } from '#/components/subscriptions/queries'
import { currentDay, currentMonth, shiftMonth } from '#/lib/calendar'
import { ROUTES } from '#/lib/routes'
import { DashboardTodos } from './DashboardTodos'
import { GlanceCard } from './GlanceCard'
import { buildTodos, isStale } from './glance'
import type { Todo } from './glance'
import {
  BalancesElement,
  EnvelopesElement,
  ForecastElement,
  InvestmentsElement,
  MonthFlowsElement,
  NetWorthElement,
  OwedElement,
  UpcomingElement,
} from './layout/elements'
import { AddExpenseAction } from './layout/AddExpenseAction'
import { DashboardEditor } from './layout/DashboardEditor'
import { groupWidgets } from './layout/group'
import type { Block } from './layout/group'
import { dashboardLayoutQuery } from './layout/queries'
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
  const layout = useQuery(dashboardLayoutQuery)
  const [editor, setEditor] = useState<{
    open: boolean
    type?: DashboardWidgetDto['type']
  }>({ open: false })
  // « ⋮ → Personnaliser » (#495), once the layout is known.
  useRegisterPageAction(
    layout.data
      ? {
          label: 'Personnaliser',
          icon: <SlidersHorizontalIcon />,
          onSelect: () => setEditor({ open: true }),
        }
      : null,
  )

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

      {(overview.isPending || layout.isPending) && <DashboardSkeleton />}

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
        <Empty className="glass-card">
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

      {data && !isEmpty && !layout.isPending && (
        <DashboardElements
          // A layout that fails to load leaves today's dashboard.
          widgets={layout.data?.widgets ?? DEFAULT_WIDGETS}
          overview={data}
          review={review.data}
          reviewFailed={review.isError}
          onRetryReview={() => void review.refetch()}
          todos={todos}
          today={today}
          dataUntil={dataUntil}
          stale={stale}
          onEdit={
            layout.data
              ? (widget) => setEditor({ open: true, type: widget.type })
              : undefined
          }
        />
      )}
      {layout.data && (
        <DashboardEditor
          open={editor.open}
          onOpenChange={(open) => setEditor((state) => ({ ...state, open }))}
          layout={layout.data}
          initialType={editor.type}
        />
      )}
    </div>
  )
}

/** Today's dashboard, while the saved layout cannot be read. */
const DEFAULT_WIDGETS: DashboardWidgetDto[] = (
  [
    ['todo', 'large'],
    ['left_to_spend', 'large'],
    ['forecast', 'small'],
    ['net_worth', 'small'],
    ['tracked_budgets', 'large'],
  ] as const
).map(([type, size]) => ({
  type,
  size,
  hidden: false,
  accountIds: null,
  envelopeIds: null,
  settings: {},
}))

/**
 * The owner's elements in their order (#495): one column on a phone; on a
 * wide page two, a « large » element taking the whole row.
 */
function DashboardElements({
  widgets,
  overview,
  review,
  reviewFailed,
  onRetryReview,
  todos,
  today,
  dataUntil,
  stale,
  onEdit,
}: {
  widgets: DashboardWidgetDto[]
  overview: DashboardOverviewDto
  review: MonthReviewDto | undefined
  reviewFailed: boolean
  onRetryReview: () => void
  todos: Todo[]
  today: string
  dataUntil: string | null
  stale: boolean
  onEdit?: (widget: DashboardWidgetDto) => void
}) {
  const blocks = groupWidgets(widgets)
  const year = today.slice(0, 4)
  const tracked = blocks.some(
    (block) => block.widget.type === 'tracked_budgets',
  )

  function render(block: Block): ReactNode {
    const { widget } = block
    const edit = onEdit ? () => onEdit(widget) : undefined
    if (block.kind === 'glance') {
      if (review) {
        return (
          <GlanceCard
            review={review}
            today={today}
            dataUntil={dataUntil}
            stale={stale}
            rows={block.rows}
          />
        )
      }
      if (reviewFailed) {
        return (
          <Alert>
            <AlertTitle>Le mois en cours est indisponible.</AlertTitle>
            <AlertDescription>
              <Button
                outline
                variant="secondary"
                size="sm"
                onClick={onRetryReview}
              >
                Réessayer
              </Button>
            </AlertDescription>
          </Alert>
        )
      }
      return (
        <Skeleton
          className="h-64 rounded-xl"
          aria-busy="true"
          aria-label="Chargement du mois"
        />
      )
    }
    switch (widget.type) {
      case 'todo':
        return <DashboardTodos todos={todos} today={today} />
      case 'tracked_budgets':
        return <MonthEnvelopes categoryIds={widget.categoryIds ?? null} />
      case 'forecast':
        return <ForecastElement widget={widget} onEdit={edit} />
      case 'net_worth':
        return (
          <NetWorthElement overview={overview} widget={widget} onEdit={edit} />
        )
      case 'balances':
        return (
          <BalancesElement
            overview={overview}
            widget={widget}
            year={year}
            onEdit={edit}
          />
        )
      case 'owed':
        return <OwedElement widget={widget} />
      case 'upcoming_debits':
        return <UpcomingElement widget={widget} today={today} onEdit={edit} />
      case 'month_flows':
        return <MonthFlowsElement overview={overview} />
      case 'envelopes':
        return <EnvelopesElement widget={widget} />
      case 'investments':
        return <InvestmentsElement widget={widget} onEdit={edit} />
      case 'left_to_spend':
        return null
    }
  }

  return (
    <>
      {/* One column on every screen: each element takes the whole row. */}
      <div className="grid grid-cols-1 gap-3">
        {blocks.map((block) => (
          <div
            key={block.widget.type}
            data-element={block.widget.type}
            className="min-w-0 empty:hidden"
          >
            {render(block)}
          </div>
        ))}
      </div>
      {/* « Ajouter une dépense » stays in « ⋮ » without « Budgets suivis ». */}
      {!tracked && <AddExpenseAction />}
    </>
  )
}
