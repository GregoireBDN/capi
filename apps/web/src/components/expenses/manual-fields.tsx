import { OptionRow, cn } from '@capi/ui'
import type { ReactNode } from 'react'
import type { AccountDto } from '#/api/types.gen'
import { ACCOUNT_TYPE_ICONS } from '#/components/accounts/labels'
import { formatCents } from '#/lib/money'

/**
 * Quick-entry fields of `ManualTransactionSheet` (#196, #245): chips and
 * tiles a thumb can tap instead of a field to type in or a list to scroll
 * through.
 */

/**
 * A rounded, tappable chip (44px high: the 22px root makes h-8 44px), in
 * glass (#506): the glass fill, no border, like `Toggle`.
 */
export const CHIP_CLASS = cn(
  'h-8 shrink-0 rounded-full bg-glass-fill px-3',
  'text-sm font-medium whitespace-nowrap',
  'transition-colors outline-none active:translate-y-px',
  'hover:bg-foreground/10',
  'focus-visible:ring-3 focus-visible:ring-ring/85',
)

/** Chip look when chosen: tinted in the primary colour (#506). */
export const CHIP_ON = cn(
  'data-[state=on]:bg-primary/12 data-[state=on]:text-primary',
  'data-[state=on]:hover:bg-primary/15',
)

/** `YYYY-MM-DD` one calendar day before `day`, without time zones. */
export function previousDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date - 1))
    .toISOString()
    .slice(0, 10)
}

/**
 * « Payé avec » (#398, the owner's choice): one row per account, its type's
 * badge, its name and balance, a check on the chosen one. `children` ends
 * the choice (« Quelqu’un d’autre », #398).
 */
export function AccountRows({
  labelId,
  accounts,
  value,
  onChange,
  children,
}: {
  labelId: string
  accounts: readonly Pick<AccountDto, 'id' | 'name' | 'type' | 'balanceCents'>[]
  value: string
  onChange: (accountId: string) => void
  children?: ReactNode
}) {
  return (
    <div className="bg-muted/40 overflow-hidden rounded-control py-1">
      <div role="radiogroup" aria-labelledby={labelId} className="space-y-1">
        {accounts.map((account) => {
          const { icon: Icon, className } = ACCOUNT_TYPE_ICONS[account.type]
          return (
            <OptionRow
              key={account.id}
              selected={account.id === value}
              leading={
                <span
                  className={cn(
                    'flex size-[36px] shrink-0 items-center justify-center rounded-full',
                    className,
                  )}
                >
                  <Icon aria-hidden className="size-[18px]" />
                </span>
              }
              label={account.name}
              detail={
                account.balanceCents === null
                  ? undefined
                  : `Solde ${formatCents(account.balanceCents)}`
              }
              onClick={() => onChange(account.id)}
            />
          )
        })}
        {children}
      </div>
    </div>
  )
}

/**
 * The meal-voucher card's day (#298): a bar of the 25 € cap with what is
 * already paid that day, then this payment (red when it goes over), and
 * what is left after it, or the most the card can still pay.
 */
export function VoucherDayGauge({
  capCents,
  paidCents,
  amountCents,
  when,
}: {
  capCents: number
  paidCents: number
  amountCents: number
  /** « aujourd’hui », « hier », « le 12 nov. 2026 ». */
  when: string
}) {
  const left = Math.max(0, capCents - paidCents)
  const over = amountCents > left
  const share = (cents: number) =>
    `${(Math.min(Math.max(cents, 0), capCents) / capCents) * 100}%`
  const euros = (cents: number) =>
    euroFormat.format(cents / 100).replace(/[,.]00(?=\s?€)/, '')
  return (
    <div className="w-full space-y-1 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground truncate">
          Plafond {euros(capCents)} · {when}
        </span>
        <span
          className={cn(
            'shrink-0 font-medium tabular-nums',
            over && 'text-destructive',
          )}
        >
          {over ? `${euros(left)} max` : `Reste ${euros(left - amountCents)}`}
        </span>
      </div>
      <div
        aria-hidden
        className="bg-muted flex h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-muted-foreground/40"
          style={{ width: share(paidCents) }}
        />
        <div
          className={over ? 'bg-destructive' : 'bg-primary'}
          style={{ width: share(over ? left : amountCents) }}
        />
      </div>
    </div>
  )
}

const euroFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
