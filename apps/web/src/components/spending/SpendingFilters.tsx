import { FilterControl } from '@capi/ui'
import { LandmarkIcon } from 'lucide-react'
import { useState } from 'react'
import type { AccountDto } from '#/api/types.gen'
import { PageTitleEnd } from '#/components/app-shell/PageTitleEnd'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { MonthToolbar } from '#/components/month/MonthToolbar'
import {
  filterValue,
  FilterOptionsList,
} from '#/components/transactions/filter-options'
import { compactSearch } from './search'
import type { SpendingSearch } from './search'

interface SpendingFiltersProps {
  search: SpendingSearch
  onSearchChange: (next: SpendingSearch) => void
  /** Month shown (`YYYY-MM`). */
  month: string
  /** Month shown without a month in the URL (picked by the API). */
  defaultMonth: string
  accounts: readonly AccountDto[]
}

/**
 * The month bar of Mouvements and its one page-wide filter (#410, the
 * owner's « A. À sa place »): the navigator, and « Compte » at the end of
 * the title's row since it acts on the whole page. No period note (the
 * comparison bars say how far the month goes and what it is compared
 * with); « Exceptionnelles » sits under the bars it changes. Both read and
 * write the URL search params only.
 */
export function SpendingFilters({
  search,
  onSearchChange,
  month,
  defaultMonth,
  accounts,
}: SpendingFiltersProps) {
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<SpendingSearch>) =>
    onSearchChange(compactSearch({ ...search, ...patch }))
  return (
    <>
      <MonthToolbar
        navigator={
          <MonthNavigator
            month={month}
            // The default month stays out of the URL.
            onMonthChange={(target) =>
              set({ month: target === defaultMonth ? undefined : target })
            }
          />
        }
      />
      <PageTitleEnd>
        <FilterControl
          label="Compte"
          icon={<LandmarkIcon />}
          emptyLabel="Tous"
          value={filterValue('account', search.account, accounts, [])}
          onClear={() => set({ account: undefined })}
          open={open}
          onOpenChange={setOpen}
          className="w-[7.5rem] sm:w-[9rem]"
        >
          <FilterOptionsList
            filter="account"
            value={search.account}
            accounts={accounts}
            categories={[]}
            onPick={(value) => {
              setOpen(false)
              set({ account: value })
            }}
          />
        </FilterControl>
      </PageTitleEnd>
    </>
  )
}
