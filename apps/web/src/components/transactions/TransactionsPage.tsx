import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
} from '@finances/ui'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRightIcon, SearchXIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { currentMonth, formatMonth } from '#/lib/calendar'
import { accountsQuery, categoriesQuery, isTransactional } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { BulkActionsBar } from './BulkActionsBar'
import type { BulkChanges } from './changes'
import { transactionListQuery, transactionSummaryQuery } from './queries'
import { RuleFromCorrectionDialog } from './RuleFromCorrectionDialog'
import { RuleOfferBanner } from './RuleOfferBanner'
import { activeFilterCount, ALL_MONTHS, toFilters } from './search'
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

/**
 * Browse and correct transactions: URL-synced filters, totals for the
 * filters, the list grouped by day, and corrections one by one or in bulk.
 */
export function TransactionsPage({
  search,
  onSearchChange,
}: TransactionsPageProps) {
  const today = currentMonth()
  const filters = useMemo(() => toFilters(search, today), [search, today])
  const sort = search.sort ?? 'date_desc'

  const accounts = useQuery(accountsQuery)
  const categories = useQuery(categoriesQuery)
  const summary = useQuery(transactionSummaryQuery(filters))
  const list = useInfiniteQuery(transactionListQuery(filters, sort))

  const categoryList = categories.data ?? []
  const actions = useTransactionActions(categoryList)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

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
  const period =
    search.month === ALL_MONTHS
      ? 'sur toute la période'
      : `en ${formatMonth(filters.month ?? today).toLowerCase()}`

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Opérations"
        description="Filtrez, recherchez et corrigez vos opérations."
      />

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
        today={today}
      />

      {summary.isError ? null : <TransactionSummary summary={summary.data} />}

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
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {filtered ? <SearchXIcon /> : <ArrowLeftRightIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {filtered
                ? 'Aucune opération ne correspond à ces filtres'
                : `Aucune opération ${period}`}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? 'Modifiez ou réinitialisez les filtres pour élargir la recherche.'
                : 'Importez un relevé de compte pour voir vos opérations ici.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {filtered ? (
              <Button
                outline
                variant="secondary"
                onClick={() => onSearchChange({ month: search.month })}
              >
                Réinitialiser les filtres
              </Button>
            ) : (
              <Button asChild outline variant="secondary">
                <Link to={ROUTES.import}>Importer un relevé</Link>
              </Button>
            )}
          </EmptyContent>
        </Empty>
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
            onChange={(item, changes) => void actions.update(item, changes)}
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
