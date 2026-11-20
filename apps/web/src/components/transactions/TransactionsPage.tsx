import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  Checkbox,
  EmptyState,
  NativeSelect,
  NativeSelectOption,
  Skeleton,
} from '@finances/ui'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  CheckIcon,
  CircleCheckBigIcon,
  SearchXIcon,
  UploadIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { RepaymentSuggestions } from '#/components/owed/RepaymentSuggestions'
import { StaleValuesReminder } from '#/components/review/StaleValuesReminder'
import { currentMonth, formatMonth } from '#/lib/calendar'
import { accountsQuery, categoriesQuery, isTransactional } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { BulkActionsBar } from './BulkActionsBar'
import type { BulkChanges, TransactionChanges } from './changes'
import { transactionListQuery, transactionSummaryQuery } from './queries'
import { RuleFromCorrectionDialog } from './RuleFromCorrectionDialog'
import { RuleOfferBanner } from './RuleOfferBanner'
import {
  activeFilterCount,
  ALL_MONTHS,
  compactSearch,
  SORT_LABELS,
  SORTS,
  toFilters,
} from './search'
import {
  coverageQuery,
  nearestMonthWithData,
} from '#/components/month/coverage'
import type {
  CoverageDto,
  TransactionDto,
  TransactionSort,
} from '#/api/types.gen'
import { plural } from '#/lib/plural'
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

/** Rows being loaded, inside the list's card. */
function ListSkeleton() {
  return (
    <div className="divide-y" aria-busy="true" aria-label="Chargement">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}

/** An empty state inside the list's card: the card is its frame. */
const IN_CARD = 'border-0'

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
        className={IN_CARD}
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
      className={IN_CARD}
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
 * « À revoir » is empty (#322): everything is filed. Offers every date when
 * one month is shown, and the whole list.
 */
function ReviewDone({
  allMonths,
  month,
  onAllDates,
  onLeave,
}: {
  allMonths: boolean
  month: string
  onAllDates: () => void
  onLeave: () => void
}) {
  return (
    <EmptyState
      className={IN_CARD}
      icon={<CircleCheckBigIcon />}
      title={
        allMonths
          ? 'Tout est à jour'
          : `Rien à revoir en ${formatMonth(month).toLowerCase()}`
      }
      description="Les opérations que les règles ne reconnaissent pas lors des prochains imports apparaîtront ici."
      actions={
        <>
          {!allMonths && (
            <Button onClick={onAllDates}>Voir toutes les dates</Button>
          )}
          <Button outline variant="secondary" onClick={onLeave}>
            Voir les opérations
          </Button>
        </>
      }
    />
  )
}

/** A change that takes a transaction out of « À revoir » (#322). */
function leavesReview(changes: TransactionChanges | BulkChanges): boolean {
  return (
    changes.needsReview === false ||
    (changes.categoryId != null && changes.needsReview === undefined)
  )
}

/**
 * Browse and correct transactions: URL-synced filters, totals for the
 * filters, the list grouped by day, and corrections one by one or in bulk.
 * Filtered on « À revoir » (#322, the former review queue), the list counts
 * what is left to review, each row gets « Valider », « Tout valider » takes
 * every row once they all have a category, and a row validated or filed
 * leaves the list at once.
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

  const reviewing = search.review === true

  async function applyBulk(
    targets: readonly TransactionDto[],
    changes: BulkChanges,
  ) {
    setBulkBusy(true)
    const done = await actions.updateMany(targets, changes, {
      leaveReview: reviewing && leavesReview(changes),
    })
    setBulkBusy(false)
    if (done) setSelected(new Set())
  }

  // « Tout valider »: every row loaded, all of them with a category.
  const toValidate = items.filter((item) => item.needsReview)
  const canValidateAll =
    reviewing &&
    !list.hasNextPage &&
    toValidate.length > 0 &&
    toValidate.every((item) => item.categoryId !== null)

  const visibleAccounts = (accounts.data ?? []).filter(isTransactional)
  const filtered = activeFilterCount(search) > 0
  // Only « À revoir » is on (besides the month): its own empty state.
  const reviewOnly = reviewing && activeFilterCount(search) === 1
  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Opérations"
        description="Filtrez, recherchez et corrigez vos opérations."
        // A sub-page of Dépenses (#393), reached from its « ⋮ »: back to it
        // on the month shown (none for every date).
        back={{
          label: 'Dépenses',
          to: ROUTES.spending,
          search:
            search.month && search.month !== ALL_MONTHS
              ? { month: search.month }
              : {},
        }}
        actions={[
          {
            label: 'Ajouter une opération',
            icon: <ArrowLeftRightIcon />,
            primary: true,
            onSelect: () => setAddOpen(true),
          },
        ]}
      />
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

      {/* No block of 0,00 € tiles above an empty list; no totals while
          reviewing: the count is in the list's header. */}
      {reviewing || summary.isError || summary.data?.count === 0 ? null : (
        <TransactionSummary summary={summary.data} />
      )}

      {/* Transfers that look like someone's repayment (#359), first. */}
      {reviewing && <RepaymentSuggestions />}

      {/* The list in a card (#327): its header (count, selection, sort),
          the days, « Charger plus » at its end; empty, loading and error
          states inside it. `overflow-clip`, not `hidden`: the day headings
          stay sticky under the header. */}
      <Card data-slot="transactions-card" className="gap-0 overflow-clip py-0">
        {list.isPending && <ListSkeleton />}

        {list.isError && (
          <Alert variant="destructive" className="m-3 w-auto">
            <AlertTitle>Impossible de charger les opérations.</AlertTitle>
            <AlertDescription>
              <Button size="sm" outline onClick={() => void list.refetch()}>
                Réessayer
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {list.isSuccess && items.length === 0 && reviewOnly && (
          <ReviewDone
            allMonths={search.month === ALL_MONTHS}
            month={filters.month ?? shownMonth}
            onAllDates={() => onSearchChange({ ...search, month: ALL_MONTHS })}
            onLeave={() =>
              onSearchChange(
                compactSearch({
                  month: search.month === ALL_MONTHS ? undefined : search.month,
                  sort: search.sort,
                }),
              )
            }
          />
        )}

        {list.isSuccess && items.length === 0 && !reviewOnly && (
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
          <>
            {/* The card's header (#327): the select-all box in the column of
                the rows' icons, the count, then the sort filling the rest of
                the row (a row of its own on phones when it doesn't fit);
                « Tout sélectionner » is spelled out from 672px. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1 @[672px]:gap-x-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center">
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
                </span>
                <label
                  htmlFor="transactions-select-all"
                  className="sr-only text-sm @[672px]:not-sr-only"
                >
                  Tout sélectionner
                </label>
                <span
                  aria-hidden
                  className="text-muted-foreground hidden @[672px]:inline"
                >
                  ·
                </span>
                <p
                  className="flex min-h-11 items-center text-sm font-medium"
                  aria-live="polite"
                >
                  {reviewing
                    ? plural(total, 'opération à revoir', 'opérations à revoir')
                    : plural(total, 'opération')}
                </p>
              </div>
              {list.isFetching && !list.isFetchingNextPage && (
                <span className="text-muted-foreground text-xs">
                  Mise à jour…
                </span>
              )}
              <div className="flex min-w-[min(100%,12rem)] flex-1 items-center justify-end gap-2">
                {canValidateAll && (
                  <Button
                    size="sm"
                    variant="success"
                    outline
                    iconStart={<CheckIcon />}
                    disabled={bulkBusy}
                    className="shrink-0"
                    onClick={() =>
                      void applyBulk(toValidate, { needsReview: false })
                    }
                  >
                    Tout valider
                  </Button>
                )}
                <NativeSelect
                  aria-label="Tri"
                  size="sm"
                  value={sort}
                  onChange={(event) => {
                    const next = event.target.value as TransactionSort
                    onSearchChange(
                      compactSearch({
                        ...search,
                        sort: next === 'date_desc' ? undefined : next,
                      }),
                    )
                  }}
                  className="w-auto min-w-0 flex-1 @[672px]:flex-none"
                >
                  {SORTS.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {SORT_LABELS[option]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <TransactionList
              items={items}
              categories={categoryList}
              groupByDate={sort === 'date_desc' || sort === 'date_asc'}
              showAccount={
                !search.account &&
                visibleAccounts.filter((account) => account.archivedAt === null)
                  .length > 1
              }
              selected={selected}
              onSelectedChange={toggle}
              actionsFor={(item) => ({
                onChange: (changes) =>
                  void actions.update(item, changes, {
                    leaveReview: reviewing && leavesReview(changes),
                  }),
                onUpdateManual: (changes) =>
                  actions.updateManual(item, changes),
                onCorrect: (body) => void actions.correct(item, body),
                onRestoreBank: () => void actions.restoreBank(item),
                onSplit: (parts) => void actions.split(item, parts),
                onUnsplit: () => void actions.unsplit(item),
              })}
              onValidate={
                reviewing
                  ? (item) =>
                      void actions.update(
                        item,
                        { needsReview: false },
                        { leaveReview: true },
                      )
                  : undefined
              }
              remaining={total - items.length}
              hasMore={list.hasNextPage}
              loadingMore={list.isFetchingNextPage}
              onLoadMore={() => {
                if (!list.isFetchingNextPage) void list.fetchNextPage()
              }}
            />
          </>
        )}
      </Card>

      {selectedItems.length > 0 && (
        <BulkActionsBar
          selected={selectedItems}
          categories={categoryList}
          busy={bulkBusy}
          onApply={(changes) => void applyBulk(selectedItems, changes)}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* The investment values to update, as the review queue had them. */}
      {reviewing && <StaleValuesReminder />}

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
