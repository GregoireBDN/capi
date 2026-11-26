import { cn } from '@capi/ui'
import { formatWholeEuros } from '#/lib/money'

export interface AccountChip {
  accountId: string
  name: string
  /** What can be taken there: « libre », or what the envelope holds. */
  cents: number
}

/**
 * The account of « Ajouter », « Retirer » and « Déjà de côté ? » (#430, the
 * owner: no « Sur Livret A · Autre compte » line): one chip per account
 * with what can be taken there, the likely one already chosen, one tap to
 * change. Hidden with a single account.
 */
export function AccountChips({
  accounts,
  value,
  onChange,
}: {
  accounts: readonly AccountChip[]
  value: string | null
  onChange: (accountId: string) => void
}) {
  if (accounts.length < 2) return null
  return (
    <div role="radiogroup" aria-label="Compte" className="flex flex-wrap gap-2">
      {accounts.map((account) => {
        const current = account.accountId === value
        return (
          <button
            key={account.accountId}
            type="button"
            role="radio"
            aria-checked={current}
            disabled={account.cents <= 0}
            onClick={() => onChange(account.accountId)}
            className={cn(
              'focus-visible:ring-ring flex min-h-11 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left outline-none focus-visible:ring-2 disabled:opacity-40',
              current
                ? 'border-primary bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))]'
                : 'bg-card hover:bg-muted/60',
            )}
          >
            <span className="text-sm font-medium break-normal">
              {account.name}
            </span>
            <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
              {formatWholeEuros(account.cents)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
