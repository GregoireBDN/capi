import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
  Switch,
} from '@finances/ui'
import { SearchIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AccountDto, CategoryDto, TransactionKind } from '#/api/types.gen'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { MonthToolbar } from '#/components/month/MonthToolbar'
import { currentMonth } from '#/lib/calendar'
import { plural } from '#/lib/plural'
import { FilterChip, ToggleChip } from './FilterChip'
import type { FilterChipOption } from './FilterChip'
import { KIND_GROUP_LABELS, TRANSACTION_KINDS } from './labels'
import { ALL_MONTHS, compactSearch, UNCATEGORIZED } from './search'
import type { TransactionsSearch } from './search'

/** Delay between the last keystroke and the URL (and list) update. */
export const SEARCH_DEBOUNCE_MS = 300

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
   * some wait, « À revoir » comes first, with their number, on every width
   * and opens them over every date; with none, it is offered nowhere unless
   * already on (#393).
   */
  reviewCount?: number | null
}

/** Filters the chips and the sheet set (not the search, month or sort). */
export function chipFilterCount(search: TransactionsSearch): number {
  return [
    search.account,
    search.category,
    search.kind,
    search.review,
    search.oneOff,
    // An empty value (`?account=`) is no filter.
  ].filter((value) => value !== undefined && value !== '').length
}

/** The search without the chips' filters (« Effacer »). */
function withoutChipFilters(search: TransactionsSearch): TransactionsSearch {
  return compactSearch({ month: search.month, q: search.q, sort: search.sort })
}

interface FilterOptions {
  accounts: FilterChipOption[]
  categories: FilterChipOption[]
  kinds: FilterChipOption[]
}

function filterOptions(
  accounts: readonly AccountDto[],
  categories: readonly CategoryDto[],
): FilterOptions {
  return {
    accounts: accounts.map((account) => ({
      value: account.id,
      label: account.name,
    })),
    categories: [
      { value: UNCATEGORIZED, label: 'Sans catégorie' },
      ...TRANSACTION_KINDS.flatMap((kind) =>
        categories
          .filter((category) => category.kind === kind)
          .map((category) => ({
            value: category.id,
            label: category.archivedAt
              ? `${category.name} (archivée)`
              : category.name,
            group: KIND_GROUP_LABELS[kind],
          })),
      ),
    ],
    kinds: TRANSACTION_KINDS.map((kind) => ({
      value: kind,
      label: KIND_GROUP_LABELS[kind],
    })),
  }
}

type Setter = <TKey extends keyof TransactionsSearch>(
  key: TKey,
  value: TransactionsSearch[TKey] | undefined,
) => void

/** The phone sheet behind « Filtres »: one native control per filter. */
function SheetFilters({
  search,
  set,
  options,
  onClear,
  offerReview,
  onReview,
}: {
  search: TransactionsSearch
  set: Setter
  options: FilterOptions
  onClear: () => void
  /** Whether « À revoir » is offered (some to review, or it is on). */
  offerReview: boolean
  onReview: (on: boolean) => void
}) {
  const reviewId = useId()
  const oneOffId = useId()
  const groups = TRANSACTION_KINDS.map((kind) => ({
    label: KIND_GROUP_LABELS[kind],
    options: options.categories.filter(
      (option) => option.group === KIND_GROUP_LABELS[kind],
    ),
  })).filter((group) => group.options.length > 0)
  return (
    <div className="grid gap-3">
      <NativeSelect
        aria-label="Compte"
        value={search.account ?? ''}
        onChange={(event) => set('account', event.target.value)}
        className="w-full"
      >
        <NativeSelectOption value="">Tous les comptes</NativeSelectOption>
        {options.accounts.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Catégorie"
        value={search.category ?? ''}
        onChange={(event) => set('category', event.target.value)}
        className="w-full"
      >
        <NativeSelectOption value="">Toutes les catégories</NativeSelectOption>
        <NativeSelectOption value={UNCATEGORIZED}>
          Sans catégorie
        </NativeSelectOption>
        {groups.map((group) => (
          <NativeSelectOptGroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Type"
        value={search.kind ?? ''}
        onChange={(event) => set('kind', event.target.value as TransactionKind)}
        className="w-full"
      >
        <NativeSelectOption value="">Tous les types</NativeSelectOption>
        {options.kinds.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {offerReview && (
        <div className="flex min-h-11 items-center gap-3">
          <Switch
            id={reviewId}
            checked={search.review === true}
            onCheckedChange={onReview}
          />
          <Label htmlFor={reviewId} className="text-sm font-normal">
            À revoir
          </Label>
        </div>
      )}
      <div className="flex min-h-11 items-center gap-3">
        <Switch
          id={oneOffId}
          checked={search.oneOff === true}
          onCheckedChange={(on) => set('oneOff', on || undefined)}
        />
        <Label htmlFor={oneOffId} className="text-sm font-normal">
          Exceptionnelles
        </Label>
      </div>
      {chipFilterCount(search) > 0 && (
        <Button outline variant="secondary" onClick={onClear}>
          Effacer les filtres
        </Button>
      )}
    </div>
  )
}

/**
 * The month bar of Opérations (#264): the period (the shared navigator,
 * « Toutes les dates » in its picker), the search filling the rest of its
 * row (below it on phones), then one
 * row of filter chips with « Effacer » when one is on. On phones the chips
 * that are on stay in view (× clears them) and « Filtres » opens a sheet
 * with every filter. They only read and write the URL search params.
 */
export function TransactionFilters({
  search,
  onSearchChange,
  accounts,
  categories,
  defaultMonth = currentMonth(),
  reviewCount = null,
}: TransactionFiltersProps) {
  const [text, setText] = useState(search.q ?? '')
  const latest = useRef({ search, onSearchChange })
  latest.current = { search, onSearchChange }

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

  const options = useMemo(
    () => filterOptions(accounts, categories),
    [accounts, categories],
  )
  const all = search.month === ALL_MONTHS
  // The default month is kept out of the URL.
  const goTo = (target: string) =>
    set('month', target === defaultMonth ? undefined : target)
  const count = chipFilterCount(search)
  const clear = () => onSearchChange(withoutChipFilters(search))
  const reviewing = search.review === true
  // Some wait for review: « À revoir » is put forward (#393).
  const toReview = !reviewing && reviewCount !== null && reviewCount > 0
  // None at all: no « À revoir » to offer, unless it is on.
  const offerReview = reviewing || reviewCount === null || reviewCount > 0
  // The count is over every date, so is the queue it opens.
  const setReview = (on: boolean) =>
    onSearchChange(
      compactSearch(
        on
          ? { ...search, review: true, month: ALL_MONTHS }
          : { ...search, review: undefined },
      ),
    )

  return (
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
      filters={() => (
        <SheetFilters
          search={search}
          set={set}
          options={options}
          onClear={clear}
          offerReview={offerReview}
          onReview={setReview}
        />
      )}
      filtersInline={false}
      activeFilters={count}
      search={
        <InputGroup>
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
          />
        </InputGroup>
      }
    >
      {/* Every chip from 672px; on phones only those that are on, and
          « À revoir » while some wait for review. */}
      <div
        data-slot="filter-chips"
        className={
          count === 0 && !toReview
            ? 'hidden flex-wrap items-center gap-2 @[672px]:flex'
            : 'flex flex-wrap items-center gap-2'
        }
      >
        {/* First: what waits for the owner (#393). */}
        {offerReview && (
          <ToggleChip
            label="À revoir"
            pressed={reviewing}
            onPressedChange={setReview}
            hideWhenOff
            // On a narrow bar (phones), while some wait, the whole row: the
            // owner's way in to the queue (#393).
            className={
              toReview ? 'w-full justify-center @[672px]:w-auto' : undefined
            }
            count={
              toReview
                ? {
                    value: reviewCount,
                    label: plural(
                      reviewCount,
                      'opération à revoir',
                      'opérations à revoir',
                    ),
                  }
                : undefined
            }
          />
        )}
        <FilterChip
          label="Compte"
          value={search.account}
          options={options.accounts}
          onChange={(value) => set('account', value)}
          hideWhenUnset
        />
        <FilterChip
          label="Catégorie"
          value={search.category}
          options={options.categories}
          onChange={(value) => set('category', value)}
          searchable
          hideWhenUnset
        />
        <FilterChip
          label="Type"
          value={search.kind}
          options={options.kinds}
          onChange={(value) => set('kind', value as TransactionKind)}
          hideWhenUnset
        />
        <ToggleChip
          label="Exceptionnelles"
          pressed={search.oneOff === true}
          onPressedChange={(on) => set('oneOff', on || undefined)}
          hideWhenOff
        />
        {count > 0 && (
          <Button variant="secondary" ghost onClick={clear} className="text-sm">
            Effacer
          </Button>
        )}
      </div>
    </MonthToolbar>
  )
}
