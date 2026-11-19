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
import { PlusIcon, SparklesIcon, TargetIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { currentMonth, formatMonth } from '#/lib/calendar'
import { categoriesQuery } from '#/lib/queries'
import { BudgetEditor } from './BudgetEditor'
import type { EditedBudget } from './BudgetEditor'
import { BudgetHistory } from './BudgetHistory'
import { BudgetList } from './BudgetList'
import { BudgetSummary } from './BudgetSummary'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { MonthToolbar } from '#/components/month/MonthToolbar'
import { budgetHistoryQuery, budgetMonthQuery } from './queries'
import { SuggestionsSheet } from './SuggestionsSheet'
import { UnbudgetedCard } from './UnbudgetedCard'

interface BudgetPageProps {
  /** Month from the URL; the current month when absent. */
  month?: string
  onMonthChange: (month: string | undefined) => void
}

type EditorState =
  | { open: false }
  | { open: true; budget?: EditedBudget; categoryId?: string }

function PageSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-32 w-full rounded-xl" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  )
}

/**
 * Monthly budget: targets per expense category vs the month's spending
 * (transfers never count), overruns flagged, targets edited from the month
 * shown on, suggestions from past spending, and the last months' history.
 */
export function BudgetPage({
  month: monthParam,
  onMonthChange,
}: BudgetPageProps) {
  const today = currentMonth()
  // Without a month in the URL, the API picks it (the current month when it
  // has data, else the month the data stops in); the history follows it.
  const budget = useQuery(budgetMonthQuery(monthParam))
  const month = monthParam ?? budget.data?.month ?? today
  const history = useQuery({
    ...budgetHistoryQuery(month),
    enabled: monthParam !== undefined || budget.isSuccess,
  })
  const categories = useQuery(categoriesQuery)
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const [suggestOpen, setSuggestOpen] = useState(false)

  const available = useMemo(() => {
    const budgeted = new Set(budget.data?.items.map((item) => item.categoryId))
    return (categories.data ?? [])
      .filter(
        (c) => c.kind === 'expense' && !c.archivedAt && !budgeted.has(c.id),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [budget.data, categories.data])

  const empty = budget.isSuccess && budget.data.items.length === 0
  // The default month stays out of the URL.
  const go = (target: string) =>
    onMonthChange(
      target === (budget.data?.period.defaultMonth ?? today)
        ? undefined
        : target,
    )

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Budget"
        description="Vos dépenses du mois par rapport à vos objectifs."
      />

      <MonthToolbar
        navigator={<MonthNavigator month={month} onMonthChange={go} />}
        period={budget.data?.period}
        actions={
          budget.isSuccess &&
          !empty && (
            <div className="flex flex-wrap gap-2 *:grow @[672px]:*:grow-0">
              <Button
                outline
                variant="secondary"
                iconStart={<SparklesIcon />}
                onClick={() => setSuggestOpen(true)}
              >
                Proposer
              </Button>
              <Button
                iconStart={<PlusIcon />}
                disabled={available.length === 0}
                onClick={() => setEditor({ open: true })}
              >
                Ajouter
              </Button>
            </div>
          )
        }
      />

      {budget.isPending && <PageSkeleton />}

      {budget.isError && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger le budget.</AlertTitle>
          <AlertDescription>
            <Button size="sm" outline onClick={() => void budget.refetch()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {empty && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TargetIcon />
            </EmptyMedia>
            <EmptyTitle>
              Aucun budget en {formatMonth(month).toLowerCase()}
            </EmptyTitle>
            <EmptyDescription>
              Fixez un objectif mensuel par catégorie de dépenses. Partez de vos
              dépenses des derniers mois pour aller plus vite.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              iconStart={<SparklesIcon />}
              onClick={() => setSuggestOpen(true)}
            >
              Proposer des budgets
            </Button>
            <Button
              outline
              variant="secondary"
              iconStart={<PlusIcon />}
              disabled={available.length === 0}
              onClick={() => setEditor({ open: true })}
            >
              Ajouter un budget
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {budget.isSuccess && !empty && (
        <>
          <BudgetSummary data={budget.data} />
          <BudgetList
            month={month}
            items={budget.data.items}
            onEdit={(item) =>
              setEditor({
                open: true,
                budget: {
                  categoryId: item.categoryId,
                  name: item.name,
                  color: item.color,
                  icon: item.icon,
                  targetCents: item.targetCents,
                  note: item.note,
                  tracked: item.tracked,
                },
              })
            }
          />
        </>
      )}

      {budget.isSuccess && (
        <UnbudgetedCard
          month={month}
          unbudgeted={budget.data.unbudgeted}
          onAdd={(categoryId) => setEditor({ open: true, categoryId })}
        />
      )}

      {history.isSuccess && <BudgetHistory history={history.data} />}

      <BudgetEditor
        open={editor.open}
        onOpenChange={(open) => {
          if (!open) setEditor({ open: false })
        }}
        month={month}
        budget={editor.open ? editor.budget : undefined}
        initialCategoryId={editor.open ? editor.categoryId : undefined}
        available={available}
      />
      <SuggestionsSheet
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        month={month}
      />
    </div>
  )
}
