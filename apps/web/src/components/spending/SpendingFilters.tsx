import {
  cn,
  Label,
  NativeSelect,
  NativeSelectOption,
  Switch,
} from '@finances/ui'
import { useId } from 'react'
import type { AccountDto, MonthPeriodDto } from '#/api/types.gen'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { MonthToolbar } from '#/components/month/MonthToolbar'
import type { MonthToolbarFiltersLayout } from '#/components/month/MonthToolbar'
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

interface ControlsProps {
  search: SpendingSearch
  set: <TKey extends keyof SpendingSearch>(
    key: TKey,
    value: SpendingSearch[TKey] | undefined,
  ) => void
  accounts: readonly AccountDto[]
  layout: MonthToolbarFiltersLayout
}

/**
 * The account, the average period and the one-off switch: compact in the
 * month bar (`inline`), one per row in the phone sheet (`sheet`).
 */
function SpendingFilterControls({
  search,
  set,
  accounts,
  layout,
}: ControlsProps) {
  const switchId = useId()
  const inline = layout === 'inline'
  return (
    <div
      className={cn(
        inline
          ? 'flex flex-wrap items-center gap-1.5 [&_select]:pr-7 [&_select]:pl-2.5 [&_select]:text-sm'
          : 'grid gap-3',
      )}
    >
      <NativeSelect
        aria-label="Compte"
        value={search.account ?? ''}
        onChange={(event) => set('account', event.target.value || undefined)}
        className={inline ? 'w-auto max-w-32' : 'w-full'}
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
        className={inline ? 'w-auto' : 'w-full'}
      >
        {AVERAGE_PERIODS.map((months) => (
          <NativeSelectOption key={months} value={String(months)}>
            Moy. {months} mois
          </NativeSelectOption>
        ))}
      </NativeSelect>

      <div
        className={cn('flex min-h-8 items-center', inline ? 'gap-2' : 'gap-3')}
      >
        <Switch
          id={switchId}
          aria-label="Inclure les opérations exceptionnelles"
          checked={search.oneOffs === true}
          onCheckedChange={(on) => set('oneOffs', on ? true : undefined)}
        />
        <Label htmlFor={switchId} className="text-sm font-normal">
          {inline
            ? 'Exceptionnelles'
            : 'Inclure les opérations exceptionnelles'}
        </Label>
      </div>
    </div>
  )
}

/**
 * The month bar of Dépenses: the navigator (with how far the month goes),
 * then the account, the average period and the one-off switch, behind a
 * « Filtres » button on phones. They only read and write the URL search
 * params.
 */
export function SpendingFilters({
  search,
  onSearchChange,
  month,
  defaultMonth,
  period,
  accounts,
}: SpendingFiltersProps) {
  function set<TKey extends keyof SpendingSearch>(
    key: TKey,
    value: SpendingSearch[TKey] | undefined,
  ) {
    onSearchChange(compactSearch({ ...search, [key]: value }))
  }

  // The default month stays out of the URL.
  const goTo = (target: string) =>
    set('month', target === defaultMonth ? undefined : target)

  const activeFilters = [
    search.account !== undefined,
    search.avg !== undefined && search.avg !== DEFAULT_AVERAGE_PERIOD,
    search.oneOffs === true,
  ].filter(Boolean).length

  return (
    <MonthToolbar
      navigator={<MonthNavigator month={month} onMonthChange={goTo} />}
      period={period}
      activeFilters={activeFilters}
      filters={(layout) => (
        <SpendingFilterControls
          search={search}
          set={set}
          accounts={accounts}
          layout={layout}
        />
      )}
    />
  )
}
