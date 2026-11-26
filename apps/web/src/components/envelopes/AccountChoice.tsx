import type { AccountType } from '#/api/types.gen'
import { ACCOUNT_TYPE_ICONS } from '#/components/accounts/labels'
import { formatWholeEuros } from '#/lib/money'
import { ChoiceList } from './ChoiceList'

export interface AccountChoiceItem {
  accountId: string
  name: string
  /** Its type's badge; unknown while the accounts load. */
  type?: AccountType
  /** What can be taken there: « libre », or what the envelope holds. */
  cents: number
}

/**
 * The account of « Ajouter », « Retirer » and « Déjà de côté ? » (#430, the
 * owner: « une liste, avec les badges »): a row per account with its type
 * badge and what can be taken there, the likely one already chosen. Hidden
 * with a single account.
 */
export function AccountChoice({
  accounts,
  value,
  onChange,
}: {
  accounts: readonly AccountChoiceItem[]
  value: string | null
  onChange: (accountId: string) => void
}) {
  if (accounts.length < 2) return null
  return (
    <ChoiceList
      label="Compte"
      value={value}
      onChange={onChange}
      choices={accounts.map((account) => {
        const badge = account.type ? ACCOUNT_TYPE_ICONS[account.type] : null
        return {
          id: account.accountId,
          icon: badge ? (
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-[0.8rem] ${badge.className}`}
            >
              <badge.icon aria-hidden />
            </span>
          ) : (
            <span className="bg-muted size-7 shrink-0 rounded-full" />
          ),
          label: account.name,
          value: formatWholeEuros(account.cents),
          disabled: account.cents <= 0,
        }
      })}
    />
  )
}
