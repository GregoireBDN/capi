import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
  Toggle,
} from '@finances/ui'
import { RotateCcwIcon, SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  AccountDto,
  CategoryDto,
  TransactionKind,
  TransactionSort,
} from '#/api/types.gen'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { currentMonth } from '#/lib/calendar'
import { KIND_GROUP_LABELS, TRANSACTION_KINDS } from './labels'
import {
  ALL_MONTHS,
  compactSearch,
  isDefaultSearch,
  SORT_LABELS,
  SORTS,
  UNCATEGORIZED,
} from './search'
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
}

/** The month navigator, or "Toutes les dates" while the toggle is on. */
function MonthFilter({
  month,
  defaultMonth,
  onMonthChange,
}: {
  month: string | undefined
  defaultMonth: string
  onMonthChange: (month: string | undefined) => void
}) {
  const all = month === ALL_MONTHS
  // The default month is kept out of the URL.
  const go = (target: string) =>
    onMonthChange(target === defaultMonth ? undefined : target)
  return (
    <MonthNavigator
      month={all ? defaultMonth : (month ?? defaultMonth)}
      label={all ? 'Toutes les dates' : undefined}
      onMonthChange={go}
    />
  )
}

/**
 * Filters of the transactions page. They only read and write the URL search
 * params (`search`); the page derives the API queries from them.
 */
export function TransactionFilters({
  search,
  onSearchChange,
  accounts,
  categories,
  defaultMonth = currentMonth(),
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

  function set<TKey extends keyof TransactionsSearch>(
    key: TKey,
    value: TransactionsSearch[TKey] | undefined,
  ) {
    onSearchChange(compactSearch({ ...search, [key]: value || undefined }))
  }

  return (
    <div className="space-y-3">
      <MonthFilter
        month={search.month}
        defaultMonth={defaultMonth}
        onMonthChange={(month) => set('month', month)}
      />

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

      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4 [&_select]:pr-7 [&_select]:pl-2 [&_select]:text-xs [&_select]:tracking-tight @2xl:[&_select]:text-sm">
        <NativeSelect
          aria-label="Compte"
          value={search.account ?? ''}
          onChange={(event) => set('account', event.target.value)}
          className="w-full"
        >
          <NativeSelectOption value="">Comptes</NativeSelectOption>
          {accounts.map((account) => (
            <NativeSelectOption key={account.id} value={account.id}>
              {account.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Catégorie"
          value={search.category ?? ''}
          onChange={(event) => set('category', event.target.value)}
          className="w-full"
        >
          <NativeSelectOption value="">Catégories</NativeSelectOption>
          <NativeSelectOption value={UNCATEGORIZED}>
            Sans catégorie
          </NativeSelectOption>
          {TRANSACTION_KINDS.map((kind) => {
            const group = categories.filter((c) => c.kind === kind)
            if (group.length === 0) return null
            return (
              <NativeSelectOptGroup key={kind} label={KIND_GROUP_LABELS[kind]}>
                {group.map((category) => (
                  <NativeSelectOption key={category.id} value={category.id}>
                    {category.archivedAt
                      ? `${category.name} (archivée)`
                      : category.name}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            )
          })}
        </NativeSelect>

        <NativeSelect
          aria-label="Type"
          value={search.kind ?? ''}
          onChange={(event) =>
            set('kind', event.target.value as TransactionKind)
          }
          className="w-full"
        >
          <NativeSelectOption value="">Types</NativeSelectOption>
          {TRANSACTION_KINDS.map((kind) => (
            <NativeSelectOption key={kind} value={kind}>
              {KIND_GROUP_LABELS[kind]}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Tri"
          value={search.sort ?? 'date_desc'}
          onChange={(event) => {
            const sort = event.target.value as TransactionSort
            set('sort', sort === 'date_desc' ? undefined : sort)
          }}
          className="w-full"
        >
          {SORTS.map((sort) => (
            <NativeSelectOption key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Toggle
          variant="outline"
          size="sm"
          pressed={search.month === ALL_MONTHS}
          onPressedChange={(on) => set('month', on ? ALL_MONTHS : undefined)}
        >
          Toutes les dates
        </Toggle>
        <Toggle
          variant="outline"
          size="sm"
          pressed={search.review === true}
          onPressedChange={(on) => set('review', on || undefined)}
        >
          À revoir
        </Toggle>
        <Toggle
          variant="outline"
          size="sm"
          pressed={search.oneOff === true}
          onPressedChange={(on) => set('oneOff', on || undefined)}
        >
          Ponctuelles
        </Toggle>
        {!isDefaultSearch(search) && (
          <Button
            size="sm"
            variant="secondary"
            ghost
            iconStart={<RotateCcwIcon />}
            className="ml-auto"
            onClick={() => onSearchChange({})}
          >
            Réinitialiser
          </Button>
        )}
      </div>
    </div>
  )
}
