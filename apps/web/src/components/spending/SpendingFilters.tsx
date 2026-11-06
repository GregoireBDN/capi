import {
  Button,
  Label,
  NativeSelect,
  NativeSelectOption,
  Switch,
} from '@finances/ui'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useId } from 'react'
import type { AccountDto } from '#/api/types.gen'
import { formatMonth, shiftMonth } from '#/lib/calendar'
import {
  AVERAGE_PERIODS,
  compactSearch,
  DEFAULT_AVERAGE_PERIOD,
} from './search'
import type { SpendingSearch } from './search'

interface SpendingFiltersProps {
  search: SpendingSearch
  onSearchChange: (next: SpendingSearch) => void
  /** Month shown (`YYYY-MM`). */
  month: string
  /** Current month in Europe/Paris: the default, and the latest reachable. */
  today: string
  accounts: readonly AccountDto[]
}

/**
 * Month navigation, one-off toggle, account and average period. They only
 * read and write the URL search params.
 */
export function SpendingFilters({
  search,
  onSearchChange,
  month,
  today,
  accounts,
}: SpendingFiltersProps) {
  const switchId = useId()

  function set<TKey extends keyof SpendingSearch>(
    key: TKey,
    value: SpendingSearch[TKey] | undefined,
  ) {
    onSearchChange(compactSearch({ ...search, [key]: value }))
  }

  // The current month is the default: keep it out of the URL.
  const goTo = (target: string) =>
    set('month', target === today ? undefined : target)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          ghost
          iconOnly
          aria-label="Mois précédent"
          onClick={() => goTo(shiftMonth(month, -1))}
        >
          <ChevronLeftIcon />
        </Button>
        <p
          className="min-w-0 flex-1 truncate text-center text-base font-semibold @2xl:w-44 @2xl:flex-none"
          aria-live="polite"
        >
          {formatMonth(month)}
        </p>
        <Button
          variant="secondary"
          ghost
          iconOnly
          aria-label="Mois suivant"
          disabled={month >= today}
          onClick={() => goTo(shiftMonth(month, 1))}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 @2xl:flex @2xl:items-center [&_select]:pr-7 [&_select]:pl-2 [&_select]:text-xs [&_select]:tracking-tight @2xl:[&_select]:text-sm">
        <NativeSelect
          aria-label="Compte"
          value={search.account ?? ''}
          onChange={(event) => set('account', event.target.value || undefined)}
          className="w-full @2xl:w-56"
        >
          <NativeSelectOption value="">Comptes</NativeSelectOption>
          {accounts.map((account) => (
            <NativeSelectOption key={account.id} value={account.id}>
              {account.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Période de la moyenne"
          value={String(search.avg ?? DEFAULT_AVERAGE_PERIOD)}
          onChange={(event) => {
            const avg = Number(event.target.value)
            set('avg', avg === 3 || avg === 12 ? avg : undefined)
          }}
          className="w-full @2xl:w-48"
        >
          {AVERAGE_PERIODS.map((period) => (
            <NativeSelectOption key={period} value={String(period)}>
              Moy. {period} mois
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <div className="col-span-2 flex items-center gap-3 @2xl:ml-auto">
          <Switch
            id={switchId}
            checked={search.oneOffs === true}
            onCheckedChange={(on) => set('oneOffs', on ? true : undefined)}
          />
          <Label htmlFor={switchId} className="text-sm font-normal">
            Inclure les dépenses ponctuelles
          </Label>
        </div>
      </div>
    </div>
  )
}
