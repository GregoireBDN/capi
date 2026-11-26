import {
  Button,
  cn,
  CountPill,
  FilterControl,
  FilterToggle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Switch,
} from '@capi/ui'
import {
  ChevronRightIcon,
  InboxIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  ZapIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { AccountDto, CategoryDto, TransactionKind } from '#/api/types.gen'
import { PageTitleEnd } from '#/components/app-shell/PageTitleEnd'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { FiltersSheet, MonthToolbar } from '#/components/month/MonthToolbar'
import { currentMonth } from '#/lib/calendar'
import { plural } from '#/lib/plural'
import {
  FilterBadge,
  FilterOptionsList,
  filterValue,
  LIST_FILTERS,
} from './filter-options'
import type { ListFilter } from './filter-options'
import { ALL_MONTHS, compactSearch } from './search'
import type { TransactionsSearch } from './search'
import { useContainerNarrow } from './use-container-narrow'

/** Delay between the last keystroke and the URL (and list) update. */
export const SEARCH_DEBOUNCE_MS = 300

/** Width of the toolbar (px) from which the filters are a row of controls. */
const WIDE_TOOLBAR_PX = 672

export interface SearchChangeOptions {
  /** Replace the history entry (typing) instead of pushing one. */
  replace?: boolean
}

interface TransactionFiltersProps {
  search: TransactionsSearch
  onSearchChange: (
    next: TransactionsSearch,
    options?: SearchChangeOptions,
  ) => void
  accounts: readonly AccountDto[]
  categories: readonly CategoryDto[]
  /**
   * Month shown without a month in the URL (`YYYY-MM`): the current month
   * when it has data, else the month the data stops in.
   */
  defaultMonth?: string
  /**
   * The transactions to review over every date (null while unknown): while
   * some wait, « À revoir » shows their number and opens them over every
   * date; with none, it is offered nowhere unless already on (#393).
   */
  reviewCount?: number | null
  /**
   * The page shows the count as its big figure (#434): no « À revoir » at
   * the end of the title then, the figure's button opens the queue.
   */
  reviewInAnswer?: boolean
}

/** The filters of the toolbar and the sheet, « À revoir » apart. */
const LISTS: readonly ListFilter[] = ['account', 'category', 'kind']

/** Filters set besides the search, the month, the sort and « À revoir ». */
export function chipFilterCount(search: TransactionsSearch): number {
  return [search.account, search.category, search.kind, search.oneOff].filter(
    // An empty value (`?account=`) is no filter.
    (value) => value !== undefined && value !== '',
  ).length
}

/** The search without the toolbar's filters (« Effacer »). */
function withoutChipFilters(search: TransactionsSearch): TransactionsSearch {
  return compactSearch({
    month: search.month,
    q: search.q,
    sort: search.sort,
    review: search.review,
  })
}

/**
 * « À revoir » at the end of the page title (#406, the owner's 1a): amber,
 * the colour of the rows to review, never one of the filters; its number
 * while some wait. A round pill with its word on a phone, a button with its
 * icon on a computer.
 */
function ReviewButton({
  on,
  count,
  onToggle,
}: {
  on: boolean
  count: number | null
  onToggle: () => void
}) {
  const counted = !on && count !== null && count > 0
  // The same size on and off (the owner): « À revoir » never moves the
  // title's row; its slot holds the count, × once on.
  return (
    <button
      type="button"
      data-slot="review-toggle"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        // In glass (#506): no border; on, the solid warning button with its
        // sheen and shadow, off, its tint
        'inline-flex h-[44px] shrink-0 items-center justify-center gap-2 rounded-full pr-2 pl-3 text-[15px] font-semibold whitespace-nowrap transition-colors outline-none active:translate-y-px @[672px]:rounded-control @[672px]:pr-3',
        'focus-visible:ring-ring/85 focus-visible:ring-[3px]',
        on
          ? 'bg-warning text-warning-foreground glass-solid [--glass-tint:var(--warning)]'
          : 'text-warning-foreground bg-[color-mix(in_srgb,var(--warning)_20%,var(--card))] hover:bg-[color-mix(in_srgb,var(--warning)_30%,var(--card))] dark:text-foreground',
      )}
    >
      <InboxIcon aria-hidden className="hidden size-[18px] @[672px]:block" />À
      revoir
      {/* One slot for the count or ×: the same size on or off. */}
      <span className="flex h-[22px] w-[32px] shrink-0 items-center justify-center">
        {counted ? (
          <span className="bg-warning text-warning-foreground flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[13px] font-bold tabular-nums">
            <span aria-hidden>{count > 99 ? '99+' : count}</span>
            <span className="sr-only">
              , {plural(count, 'opération à revoir', 'opérations à revoir')}
            </span>
          </span>
        ) : on ? (
          <XIcon aria-hidden className="size-[16px]" />
        ) : null}
      </span>
    </button>
  )
}

/** The phone's « Filtres » page: « Exceptionnelles », then a row per list. */
function SheetFilters({
  search,
  set,
  accounts,
  categories,
  onOpenList,
  onClear,
}: {
  search: TransactionsSearch
  set: Setter
  accounts: readonly AccountDto[]
  categories: readonly CategoryDto[]
  onOpenList: (filter: ListFilter) => void
  onClear: () => void
}) {
  const oneOffId = useId()
  return (
    <>
      <div className="divide-y border-b">
        <div className="flex min-h-[56px] items-center gap-3 px-4">
          <FilterBadge icon={ZapIcon} />
          <label htmlFor={oneOffId} className="flex-1 text-[16px]">
            Exceptionnelles
          </label>
          <Switch
            id={oneOffId}
            checked={search.oneOff === true}
            onCheckedChange={(on) => set('oneOff', on || undefined)}
          />
        </div>
        {LISTS.map((filter) => {
          const meta = LIST_FILTERS[filter]
          const chosen = filterValue(
            filter,
            search[filter],
            accounts,
            categories,
            'md',
          )
          return (
            <button
              key={filter}
              type="button"
              onClick={() => onOpenList(filter)}
              className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-h-[60px] w-full items-center gap-3 px-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
            >
              {chosen?.icon ?? <FilterBadge icon={meta.icon} />}
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground block text-[13px]">
                  {meta.label}
                </span>
                <span
                  className={cn(
                    'block truncate text-[16px]',
                    chosen && 'font-semibold',
                  )}
                >
                  {chosen?.label ?? meta.all}
                </span>
              </span>
              <ChevronRightIcon
                aria-hidden
                className="text-muted-foreground size-[18px] shrink-0"
              />
            </button>
          )
        })}
      </div>
      {chipFilterCount(search) > 0 && (
        <div className="p-4">
          <Button
            variant="secondary"
            outline
            className="w-full"
            onClick={onClear}
          >
            Effacer les filtres
          </Button>
        </div>
      )}
    </>
  )
}

type Setter = <TKey extends keyof TransactionsSearch>(
  key: TKey,
  value: TransactionsSearch[TKey] | undefined,
) => void

/**
 * The filters of Opérations (#406, the owner's « 1a », phones « 1a·A »):
 * the month in the app's frame (the shared navigator,
 * « Toutes les dates » in its picker), « À revoir » at the end of the page
 * title, then one toolbar. On a computer the search fills its row and the
 * filters follow as controls of the same family (44px, the search's corners
 * and background): « Compte Tous ⌄ », tinted with the value's colour once
 * set, « Exceptionnelles » with its check box, « Effacer ». On a phone
 * « Filtres » sits inside the search and opens a page with every filter;
 * the filters set show under the search as the computer's controls, each
 * on a row of its own at the full width, × clearing it and a tap opening
 * its list on that page. They only read and write the URL search params.
 */
export function TransactionFilters({
  search,
  onSearchChange,
  accounts,
  categories,
  defaultMonth = currentMonth(),
  reviewCount = null,
  reviewInAnswer = false,
}: TransactionFiltersProps) {
  const [text, setText] = useState(search.q ?? '')
  const latest = useRef({ search, onSearchChange })
  latest.current = { search, onSearchChange }
  const [openList, setOpenList] = useState<ListFilter | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetList, setSheetList] = useState<ListFilter | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const narrow = useContainerNarrow(toolbarRef, WIDE_TOOLBAR_PX)

  // Follow the URL (back button, reset) when it changes from elsewhere.
  useEffect(() => setText(search.q ?? ''), [search.q])

  // Debounced search: the URL (and the query) follow the box.
  useEffect(() => {
    const q = text.trim() || undefined
    if (q === (latest.current.search.q ?? undefined)) return
    const timer = setTimeout(() => {
      latest.current.onSearchChange(
        compactSearch({ ...latest.current.search, q }),
        { replace: true },
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  const set: Setter = (key, value) =>
    onSearchChange(compactSearch({ ...search, [key]: value || undefined }))

  const all = search.month === ALL_MONTHS
  // The default month is kept out of the URL.
  const goTo = (target: string) =>
    set('month', target === defaultMonth ? undefined : target)
  const count = chipFilterCount(search)
  const clear = () => onSearchChange(withoutChipFilters(search))
  const reviewing = search.review === true
  // None at all: no « À revoir » to offer, unless it is on (#393).
  const offerReview =
    reviewing || (!reviewInAnswer && (reviewCount === null || reviewCount > 0))
  // The count is over every date, so is the queue it opens.
  const setReview = (on: boolean) =>
    onSearchChange(
      compactSearch(
        on
          ? { ...search, review: true, month: ALL_MONTHS }
          : { ...search, review: undefined },
      ),
    )
  // Phones: the filters set, a row each (rendered only once measured
  // narrow, so the controls of a computer are never there twice).
  const phoneRows = narrow && count > 0

  const openSheet = (list: ListFilter | null = null) => {
    setSheetList(list)
    setSheetOpen(true)
  }

  return (
    <>
      {offerReview && (
        <PageTitleEnd>
          <ReviewButton
            on={reviewing}
            count={reviewCount}
            onToggle={() => setReview(!reviewing)}
          />
        </PageTitleEnd>
      )}
      <MonthToolbar
        navigator={
          <MonthNavigator
            month={all ? defaultMonth : (search.month ?? defaultMonth)}
            label={all ? 'Toutes les dates' : undefined}
            allDates={{
              selected: all,
              onSelect: () => set('month', ALL_MONTHS),
            }}
            onMonthChange={goTo}
          />
        }
      >
        <div
          ref={toolbarRef}
          data-slot="transactions-toolbar"
          className="flex flex-wrap items-center gap-2"
        >
          {/* The search fills its row; the filters follow on the next. */}
          <InputGroup className="bg-card h-[44px] min-w-0 flex-[1_1_320px] shadow-xs dark:bg-card">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Rechercher une opération"
              placeholder="Rechercher un libellé, un marchand…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              enterKeyHint="search"
              autoComplete="off"
              className="text-[16px]"
            />
            {/* Phones: « Filtres » inside the search, its word from 330px
                of toolbar (#406, the owner's 1a·A). */}
            <InputGroupAddon align="inline-end" className="@[672px]:hidden">
              <span aria-hidden className="bg-border h-6 w-px shrink-0" />
              <button
                type="button"
                aria-label={
                  count > 0
                    ? `Filtres, ${count} actif${count > 1 ? 's' : ''}`
                    : 'Filtres'
                }
                onClick={() => openSheet()}
                className="text-foreground hover:bg-muted focus-visible:ring-ring/50 pointer-coarse:touch-hitbox relative -mr-1 flex h-[38px] items-center gap-1.5 rounded-md px-2 text-[15px] font-medium outline-none focus-visible:ring-[3px]"
              >
                <SlidersHorizontalIcon aria-hidden className="size-[18px]" />
                <span className="hidden @[330px]:inline">Filtres</span>
                {count > 0 && (
                  <CountPill value={count} label="filtres actifs" aria-hidden />
                )}
              </button>
            </InputGroupAddon>
          </InputGroup>
          {/* A computer: the four filters under the search, one size each
              (the owner: nothing moves as they are set), then
              « Effacer », greyed out while none is. Room above them for the
              names that move onto their top edge. */}
          <div
            data-slot="filter-controls"
            className="hidden basis-full grid-cols-[repeat(4,minmax(0,1fr))_auto] items-center gap-2 pt-1.5 @[672px]:grid"
          >
            {LISTS.map((filter) => {
              const meta = LIST_FILTERS[filter]
              const Icon = meta.icon
              return (
                <FilterControl
                  key={filter}
                  label={meta.label}
                  icon={<Icon />}
                  emptyLabel={meta.empty}
                  value={filterValue(
                    filter,
                    search[filter],
                    accounts,
                    categories,
                  )}
                  onClear={() => set(filter, undefined)}
                  className="w-full"
                  open={openList === filter}
                  onOpenChange={(open) => setOpenList(open ? filter : null)}
                >
                  <FilterOptionsList
                    filter={filter}
                    value={search[filter] || undefined}
                    accounts={accounts}
                    categories={categories}
                    onPick={(value) => {
                      setOpenList(null)
                      set(filter, value as TransactionKind | undefined)
                    }}
                  />
                </FilterControl>
              )
            })}
            <FilterToggle
              label="Exceptionnelles"
              icon={<ZapIcon />}
              pressed={search.oneOff === true}
              onPressedChange={(on) => set('oneOff', on || undefined)}
              className="w-full"
            />
            <Button
              variant="secondary"
              ghost
              className="h-[44px]"
              onClick={clear}
              disabled={count === 0}
            >
              Effacer
            </Button>
          </div>
        </div>
        {phoneRows && (
          <div
            data-slot="filters-set"
            className="flex flex-col gap-3 pt-1.5 @[672px]:hidden"
          >
            {LISTS.map((filter) => {
              const chosen = filterValue(
                filter,
                search[filter],
                accounts,
                categories,
              )
              if (!chosen) return null
              const meta = LIST_FILTERS[filter]
              const Icon = meta.icon
              return (
                <FilterControl
                  key={filter}
                  label={meta.label}
                  icon={<Icon />}
                  value={chosen}
                  onClear={() => set(filter, undefined)}
                  onOpen={() => openSheet(filter)}
                  className="w-full"
                />
              )
            })}
            {search.oneOff === true && (
              <FilterToggle
                label="Exceptionnelles"
                icon={<ZapIcon />}
                pressed
                onPressedChange={(on) => set('oneOff', on || undefined)}
                className="w-full"
              />
            )}
            <Button
              variant="secondary"
              ghost
              className="h-[44px] self-start"
              onClick={clear}
            >
              Effacer
            </Button>
          </div>
        )}
      </MonthToolbar>
      <FiltersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={sheetList ? LIST_FILTERS[sheetList].label : 'Filtres'}
        description={
          sheetList
            ? `Filtrer par ${LIST_FILTERS[sheetList].label.toLowerCase()}`
            : 'Filtres des opérations'
        }
        onBack={sheetList ? () => setSheetList(null) : undefined}
      >
        {sheetList ? (
          <FilterOptionsList
            filter={sheetList}
            value={search[sheetList] || undefined}
            accounts={accounts}
            categories={categories}
            onPick={(value) => {
              set(sheetList, value as TransactionKind | undefined)
              setSheetList(null)
            }}
          />
        ) : (
          <SheetFilters
            search={search}
            set={set}
            accounts={accounts}
            categories={categories}
            onOpenList={setSheetList}
            onClear={clear}
          />
        )}
      </FiltersSheet>
    </>
  )
}
