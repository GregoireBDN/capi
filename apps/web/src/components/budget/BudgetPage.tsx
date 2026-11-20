import { useRegisterPageAction } from '#/components/app-shell/page-actions'
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
import { IncomePlanCard } from './IncomePlanCard'
import { IncomeSuggestionsSheet } from './IncomeSuggestionsSheet'
import { SuggestionsSheet } from './SuggestionsSheet'
import { UnbudgetedCard } from './UnbudgetedCard'

interface BudgetPageProps {
  /** Month from the URL; the current month when absent. */
  month?: string
  onMonthChange: (month: string | undefined) => void
}

type EditorState =
  | { open: false }
  | {
      open: true
      kind: 'expense' | 'income'
      budget?: EditedBudget
      categoryId?: string
    }

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
 * Monthly budget, both sides: the planned income vs what came in and what
 * the plan leaves to save (#315), then the targets per expense category vs
 * the month's spending (transfers never count), overruns flagged, targets
 * edited from the month shown on, suggestions from past spending, and the
 * last months' history.
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
  const [prepareOpen, setPrepareOpen] = useState(false)

  const available = useMemo(() => {
    const budgeted = new Set([
      ...(budget.data?.items.map((item) => item.categoryId) ?? []),
      ...(budget.data?.income.items.map((item) => item.categoryId) ?? []),
    ])
    const free = (categories.data ?? [])
      .filter((c) => !c.archivedAt && !budgeted.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    return {
      expense: free.filter((c) => c.kind === 'expense'),
      income: free.filter((c) => c.kind === 'income'),
    }
  }, [budget.data, categories.data])

  const empty = budget.isSuccess && budget.data.items.length === 0
  // The page's « add » are in its « ⋮ » (#386): a budget line, a planned
  // income.
  const inMenu = useRegisterPageAction(
    budget.isSuccess && !empty
      ? {
          label: 'Ajouter un budget',
          icon: <PlusIcon />,
          primary: true,
          disabled: available.expense.length === 0,
          onSelect: () => setEditor({ open: true, kind: 'expense' }),
        }
      : null,
  )
  useRegisterPageAction(
    budget.isSuccess && available.income.length > 0
      ? {
          label: 'Ajouter un revenu',
          icon: <PlusIcon />,
          onSelect: () => setEditor({ open: true, kind: 'income' }),
        }
      : null,
  )
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
        description="Vos revenus et dépenses du mois par rapport au plan."
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
              {!inMenu && (
                <Button
                  iconStart={<PlusIcon />}
                  disabled={available.expense.length === 0}
                  onClick={() => setEditor({ open: true, kind: 'expense' })}
                >
                  Ajouter
                </Button>
              )}
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

      {budget.isSuccess && (
        <IncomePlanCard
          month={month}
          income={budget.data.income}
          plan={budget.data.plan}
          onPrepare={() => setPrepareOpen(true)}
          addInPageMenu={inMenu}
          onAdd={
            available.income.length > 0
              ? () => setEditor({ open: true, kind: 'income' })
              : undefined
          }
          onEdit={(line) =>
            setEditor({
              open: true,
              kind: 'income',
              budget: {
                categoryId: line.categoryId,
                name: line.name,
                color: line.color,
                icon: line.icon,
                targetCents: line.plannedCents,
                note: line.note,
                tracked: false,
              },
            })
          }
        />
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
              disabled={available.expense.length === 0}
              onClick={() => setEditor({ open: true, kind: 'expense' })}
            >
              Ajouter un budget
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {budget.isSuccess && !empty && (
        <section aria-labelledby="budget-expenses" className="space-y-3">
          <h2 id="budget-expenses" className="text-base font-semibold">
            Dépenses prévues
          </h2>
          <BudgetSummary data={budget.data} />
          <BudgetList
            month={month}
            items={budget.data.items}
            onEdit={(item) =>
              setEditor({
                open: true,
                kind: 'expense',
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
        </section>
      )}

      {budget.isSuccess && (
        <UnbudgetedCard
          month={month}
          unbudgeted={budget.data.unbudgeted}
          onAdd={(categoryId) =>
            setEditor({ open: true, kind: 'expense', categoryId })
          }
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
        kind={editor.open ? editor.kind : 'expense'}
        available={
          editor.open && editor.kind === 'income'
            ? available.income
            : available.expense
        }
      />
      <SuggestionsSheet
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        month={month}
      />
      <IncomeSuggestionsSheet
        open={prepareOpen}
        onOpenChange={setPrepareOpen}
        month={month}
      />
    </div>
  )
}
