import { Label, NativeSelect, NativeSelectOption, Switch } from '@finances/ui'
import { useId } from 'react'
import type { AccountDto, MonthPeriodDto } from '#/api/types.gen'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { MonthToolbar } from '#/components/month/MonthToolbar'
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
  /** Month shown without a month in the URL (picked by the API). */
  defaultMonth: string
  /** How far the month's figures go, once loaded. */
  period?: MonthPeriodDto
  accounts: readonly AccountDto[]
}

/**
 * Month navigation (with how far the month goes), then the account, the
 * average period and the one-off toggle beside it on wide pages. They only
 * read and write the URL search params.
 */
export function SpendingFilters({
  search,
  onSearchChange,
  month,
  defaultMonth,
  period,
  accounts,
}: SpendingFiltersProps) {
  const switchId = useId()

  function set<TKey extends keyof SpendingSearch>(
    key: TKey,
    value: SpendingSearch[TKey] | undefined,
  ) {
    onSearchChange(compactSearch({ ...search, [key]: value }))
  }

  // The default month stays out of the URL.
  const goTo = (target: string) =>
    set('month', target === defaultMonth ? undefined : target)

  return (
    <MonthToolbar
      navigator={<MonthNavigator month={month} onMonthChange={goTo} />}
      period={period}
    >
      <div className="grid grid-cols-2 gap-2 @[672px]:flex @[672px]:flex-wrap @[672px]:items-center [&_select]:pr-7 [&_select]:pl-2 [&_select]:text-xs [&_select]:tracking-tight @[672px]:[&_select]:text-sm">
        <NativeSelect
          aria-label="Compte"
          value={search.account ?? ''}
          onChange={(event) => set('account', event.target.value || undefined)}
          className="w-full @[672px]:w-auto @[672px]:max-w-56"
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
          className="w-full @[672px]:w-auto"
        >
          {AVERAGE_PERIODS.map((months) => (
            <NativeSelectOption key={months} value={String(months)}>
              Moy. {months} mois
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <div className="col-span-2 flex min-h-8 items-center gap-3">
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
    </MonthToolbar>
  )
}
