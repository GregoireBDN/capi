import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  EmptyState,
  Skeleton,
} from '@finances/ui'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  PlusIcon,
  SearchXIcon,
  UploadIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { currentMonth, formatMonth } from '#/lib/calendar'
import { accountsQuery, categoriesQuery, isTransactional } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { BulkActionsBar } from './BulkActionsBar'
import { isTextEntry, isUndoKey } from './keyboard'
import type { BulkChanges } from './changes'
import { transactionListQuery, transactionSummaryQuery } from './queries'
import { RuleFromCorrectionDialog } from './RuleFromCorrectionDialog'
import { RuleOfferBanner } from './RuleOfferBanner'
import { activeFilterCount, ALL_MONTHS, toFilters } from './search'
import {
  coverageQuery,
  nearestMonthWithData,
} from '#/components/month/coverage'
import type { CoverageDto } from '#/api/types.gen'
import { formatShortDay } from '#/lib/period'
import type { TransactionsSearch } from './search'
import { TransactionFilters } from './TransactionFilters'
import type { SearchChangeOptions } from './TransactionFilters'
import { TransactionList } from './TransactionList'
import { TransactionSummary } from './TransactionSummary'
import { useTransactionActions } from './use-transaction-actions'

interface TransactionsPageProps {
  /** Filters from the URL search params. */
  search: TransactionsSearch
  /** Writes the filters back to the URL. */
  onSearchChange: (
    next: TransactionsSearch,
    options?: SearchChangeOptions,
  ) => void
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Chargement">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  )
}

/** "3 nov." stays as is, "3 nov. 2025" gets its full stop. */
function sentenceEnd(text: string): string {
  return text.endsWith('.') ? text : `${text}.`
}

interface EmptyListProps {
  /** Filters besides the month are set. */
  filtered: boolean
  /** The whole history is shown ("Toutes les dates"). */
  allMonths: boolean
  month: string
  coverage: CoverageDto | undefined
  onReset: () => void
  onMonthChange: (month: string) => void
}

/**
 * Nothing to list: the filters match nothing (reset them), or the month has
 * no transaction (go to the nearest month with some, import a statement or
 * add one by hand with the page's button), or there is no transaction at all.
 */
function EmptyList({
  filtered,
  allMonths,
  month,
  coverage,
  onReset,
  onMonthChange,
}: EmptyListProps) {
  if (filtered) {
    return (
      <EmptyState
        icon={<SearchXIcon />}
        title="Aucune opération ne correspond à ces filtres"
        description="Modifiez ou réinitialisez les filtres pour élargir la recherche."
        actions={
          <Button outline variant="secondary" onClick={onReset}>
            Réinitialiser les filtres
          </Button>
        }
      />
    )
  }
  const nearest =
    allMonths || coverage === undefined
      ? null
      : nearestMonthWithData(coverage.months, month)
  const until = coverage?.dataUntil ?? null
  const importLink = (
    <Button
      asChild
      outline={nearest !== null}
      variant={nearest === null ? undefined : 'secondary'}
    >
      <Link to={ROUTES.import}>
        <UploadIcon aria-hidden />
        Importer un relevé
      </Link>
    </Button>
  )
  return (
    <EmptyState
      icon={<ArrowLeftRightIcon />}
      title={
        allMonths
          ? 'Aucune opération pour l’instant'
          : `Aucune opération en ${formatMonth(month).toLowerCase()}`
      }
      description={
        until === null
          ? 'Importez un relevé de compte ou ajoutez une opération : elles s’afficheront ici.'
          : `Vos relevés importés s’arrêtent au ${sentenceEnd(formatShortDay(until, month.slice(0, 4)))}`
      }
      actions={
        <>
          {nearest !== null && (
            <Button onClick={() => onMonthChange(nearest)}>
              Voir {formatMonth(nearest).toLowerCase()}
            </Button>
          )}
          {importLink}
        </>
      }
    />
  )
}

/**
 * Browse and correct transactions: URL-synced filters, totals for the
 * filters, the list grouped by day, and corrections one by one or in bulk.
 */
export function TransactionsPage({
  search,
  onSearchChange,
}: TransactionsPageProps) {
  // Without a month in the URL, the month the data stops in when the
  // current one has none yet (the coverage rule); the current month if the
  // coverage can't be read.
  const coverage = useQuery(coverageQuery)
  const defaultMonth = coverage.isError
    ? currentMonth()
    : coverage.data?.defaultMonth
  const monthKnown = search.month !== undefined || defaultMonth !== undefined
  const shownMonth = defaultMonth ?? currentMonth()
  const filters = useMemo(
    () => toFilters(search, shownMonth),
    [search, shownMonth],
  )
  const sort = search.sort ?? 'date_desc'

  const accounts = useQuery(accountsQuery)
  const categories = useQuery(categoriesQuery)
  const summary = useQuery({
    ...transactionSummaryQuery(filters),
    enabled: monthKnown,
  })
  const list = useInfiniteQuery({
    ...transactionListQuery(filters, sort),
    enabled: monthKnown,
  })

  const categoryList = categories.data ?? []
  const actions = useTransactionActions(categoryList)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  // Ctrl/⌘+Z undoes the latest edit still offering "Annuler", unless the
  // focus is in a text field (its own undo).
  const undoLast = actions.undoLast
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isUndoKey(event) || isTextEntry(document.activeElement)) return
      if (undoLast()) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undoLast])

  const items = useMemo(
    () => list.data?.pages.flatMap((page) => page.items) ?? [],
    [list.data],
  )
  const total = list.data?.pages.at(-1)?.total ?? 0
  const selectedItems = items.filter((item) => selected.has(item.id))
  const allSelected = items.length > 0 && selectedItems.length === items.length

  // A new set of filters is a new list: forget the selection.
  const filtersKey = JSON.stringify([filters, sort])
  useEffect(() => setSelected(new Set()), [filtersKey])

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function applyBulk(changes: BulkChanges) {
    setBulkBusy(true)
    const done = await actions.updateMany(selectedItems, changes)
    setBulkBusy(false)
    if (done) setSelected(new Set())
  }

  const visibleAccounts = (accounts.data ?? []).filter(isTransactional)
  const filtered = activeFilterCount(search) > 0
  return (
    <div className="@container space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Opérations"
          description="Filtrez, recherchez et corrigez vos opérations."
        />
        <Button onClick={() => setAddOpen(true)}>
          <PlusIcon />
          Ajouter une opération
        </Button>
      </div>
      <ManualTransactionSheet open={addOpen} onOpenChange={setAddOpen} />

      {actions.offer && (
        <RuleOfferBanner
          offer={actions.offer}
          onCreateRule={() => setRuleDialogOpen(true)}
          onDismiss={() => actions.setOffer(null)}
        />
      )}

      <TransactionFilters
        search={search}
        onSearchChange={onSearchChange}
        accounts={visibleAccounts}
        categories={categoryList}
        defaultMonth={shownMonth}
      />

      {/* No block of 0,00 € tiles above an empty list. */}
      {summary.isError || summary.data?.count === 0 ? null : (
        <TransactionSummary summary={summary.data} />
      )}

      {list.isPending && <ListSkeleton />}

      {list.isError && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger les opérations.</AlertTitle>
          <AlertDescription>
            <Button size="sm" outline onClick={() => void list.refetch()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {list.isSuccess && items.length === 0 && (
        <EmptyList
          filtered={filtered}
          allMonths={search.month === ALL_MONTHS}
          month={filters.month ?? shownMonth}
          coverage={coverage.data}
          onReset={() => onSearchChange({ month: search.month })}
          onMonthChange={(month) =>
            onSearchChange({
              ...search,
              month: month === shownMonth ? undefined : month,
            })
          }
        />
      )}

      {list.isSuccess && items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-3">
            <Checkbox
              id="transactions-select-all"
              checked={
                allSelected
                  ? true
                  : selectedItems.length > 0
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={(checked) =>
                setSelected(
                  checked === true
                    ? new Set(items.map((item) => item.id))
                    : new Set(),
                )
              }
            />
            <label htmlFor="transactions-select-all" className="text-sm">
              Tout sélectionner
            </label>
            {list.isFetching && !list.isFetchingNextPage && (
              <span className="text-muted-foreground ml-auto text-xs">
                Mise à jour…
              </span>
            )}
          </div>
          <TransactionList
            items={items}
            categories={categoryList}
            groupByDate={sort === 'date_desc' || sort === 'date_asc'}
            selected={selected}
            onSelectedChange={toggle}
            actionsFor={(item) => ({
              onChange: (changes) => void actions.update(item, changes),
              onUpdateManual: (changes) => actions.updateManual(item, changes),
              onCorrect: (body) => void actions.correct(item, body),
              onRestoreBank: () => void actions.restoreBank(item),
              onSplit: (parts) => void actions.split(item, parts),
              onUnsplit: () => void actions.unsplit(item),
            })}
            remaining={total - items.length}
            hasMore={list.hasNextPage}
            loadingMore={list.isFetchingNextPage}
            onLoadMore={() => {
              if (!list.isFetchingNextPage) void list.fetchNextPage()
            }}
          />
        </div>
      )}

      {selectedItems.length > 0 && (
        <BulkActionsBar
          selected={selectedItems}
          categories={categoryList}
          busy={bulkBusy}
          onApply={(changes) => void applyBulk(changes)}
          onClear={() => setSelected(new Set())}
        />
      )}

      {actions.offer && (
        <RuleFromCorrectionDialog
          open={ruleDialogOpen}
          onOpenChange={setRuleDialogOpen}
          transaction={actions.offer.transaction}
          category={actions.offer.category}
          onCreated={({ updated }) => actions.onRuleCreated(updated)}
        />
      )}
    </div>
  )
}
