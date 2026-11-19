import {
  cn,
  formatSignedPercent,
  ItemList,
  ItemListGroup,
  ItemListRow,
} from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { LandmarkIcon, TrendingUpIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AccountType } from '#/api/types.gen'
import { ACCOUNT_TYPE_LABELS } from '#/components/dashboard/labels'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { NewAccountButton } from './AccountEditor'
import { AddInvestmentButton } from './AddInvestmentSheet'
import { todayInParis } from './dates'
import { ACCOUNT_TYPE_ICONS } from './labels'

export interface AccountListItem {
  id: string
  name: string
  type: AccountType
  institution: string | null
  valueCents: number | null
  /** Date the value is known at; null without any. */
  valueDate: string | null
  /** Investments: value - contributions, null when contributions are unknown. */
  gainCents?: number | null
  returnRate?: number | null
  /** Investments: the value is older than the account's update rhythm. */
  stale?: boolean
  /**
   * What the row opens: the account page (default), or the transactions of
   * the account (cash accounts on the dashboard).
   */
  link?: 'account' | 'transactions'
}

export interface AccountListGroup {
  id: string
  /** Sentence case; without one the rows stand alone. */
  title?: string
  totalCents?: number
  /** Types the title already names: their rows don't repeat the type. */
  impliedTypes?: AccountType[]
  accounts: AccountListItem[]
}

/** The add buttons under the list, and which of them is the usual action. */
export type AccountListPrimaryAction = 'investment' | 'account'

/** Words that, in an account's name, already say its type. */
const TYPE_WORDS: Record<AccountType, string[]> = {
  checking: ['compte courant', 'courant', 'compte cheques', 'compte joint'],
  savings: ['livret', 'ldds', 'lep', 'pel', 'cel', 'epargne'],
  brokerage: ['pea', 'cto', 'compte titres', 'compte-titres', 'bourse'],
  life_insurance: ['assurance vie', 'assurance-vie', 'per'],
  employee_savings: ['pee', 'perco', 'pereco', 'epargne salariale'],
  crypto: ['crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'wallet'],
  meal_voucher: [
    'titres-restaurant',
    'titres restaurant',
    'titre-restaurant',
    'titre restaurant',
    'tickets restaurant',
    'ticket restaurant',
    'ticket resto',
    'carte resto',
  ],
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** True when the account's name already says its type (« Livret A »). */
export function nameSaysType(name: string, type: AccountType): boolean {
  const words = ` ${normalize(name).replace(/[^a-z0-9-]+/g, ' ')} `
  return TYPE_WORDS[type].some((word) => words.includes(` ${word} `))
}

const shortDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const longDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** `au 31 oct.` this year (Europe/Paris), `au 31 oct. 2025` before. */
export function valueDateText(date: string, today = todayInParis()): string {
  const [year, month, day] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  const format = date.slice(0, 4) === today.slice(0, 4) ? shortDate : longDate
  return `au ${format.format(utc)}`
}

function signedCents(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatCents(cents)}`
}

/** Right, second line: what to do (stale), else the gain, else nothing. */
function rowDetail(account: AccountListItem): ReactNode {
  if (account.stale) {
    return (
      <span className="text-warning-foreground dark:text-warning inline-flex items-center gap-1 font-medium">
        <span aria-hidden className="bg-warning size-1.5 rounded-full" />à
        mettre à jour
      </span>
    )
  }
  if (account.gainCents == null) return null
  return (
    <span
      className={cn(
        account.gainCents > 0 && 'text-chart-delta-good',
        account.gainCents < 0 && 'text-chart-delta-bad',
        account.gainCents === 0 && 'text-muted-foreground',
      )}
    >
      {signedCents(account.gainCents)}
      {account.returnRate != null &&
        ` · ${formatSignedPercent(account.returnRate)}`}
    </span>
  )
}

/**
 * One account: its type badge, name, institution · value date, value, and
 * on the right the gain over contributions or « à mettre à jour ». The whole
 * row is the link; no other control sits on it.
 */
export function AccountListRow({
  account,
  impliedTypes = [],
}: {
  account: AccountListItem
  impliedTypes?: AccountType[]
}) {
  const { icon: Icon, className: iconClassName } =
    ACCOUNT_TYPE_ICONS[account.type]
  const showType =
    !impliedTypes.includes(account.type) &&
    !nameSaysType(account.name, account.type)
  const parts = [
    showType ? ACCOUNT_TYPE_LABELS[account.type] : null,
    account.institution,
    account.valueDate === null
      ? 'aucune valeur'
      : valueDateText(account.valueDate),
  ].filter((part): part is string => Boolean(part))
  // One string: the row cuts it with … at its end when it doesn't fit.
  const subtitle = parts.join(' · ')
  const row = {
    icon: <Icon />,
    iconClassName,
    title: account.name,
    subtitle,
    value: account.valueCents === null ? '—' : formatCents(account.valueCents),
    detail: rowDetail(account),
  }
  return (
    <ItemListRow asChild {...row}>
      {account.link === 'transactions' ? (
        <Link
          to={ROUTES.transactions}
          search={{ account: account.id }}
          title="Voir les opérations"
        />
      ) : (
        <Link
          to={ROUTES.account}
          params={{ accountId: account.id }}
          title="Voir le détail du compte"
        />
      )}
    </ItemListRow>
  )
}

/**
 * The account list of Épargne, the dashboard and Comptes: groups with their
 * total, rows without rules or per-row buttons, and optionally the two add
 * buttons, stacked at full width, `primaryAction` the solid one.
 */
export function AccountList({
  groups,
  primaryAction,
}: {
  groups: AccountListGroup[]
  /** Shows the add buttons, this one primary; omit for none. */
  primaryAction?: AccountListPrimaryAction
}) {
  const investment = (
    <AddInvestmentButton
      key="investment"
      icon={<TrendingUpIcon />}
      outline={primaryAction !== 'investment'}
      className="w-full"
    />
  )
  const account = (
    <NewAccountButton
      key="account"
      label="Ajouter un compte"
      icon={<LandmarkIcon />}
      outline={primaryAction !== 'account'}
      className="w-full"
    />
  )
  return (
    <ItemList>
      {groups
        .filter((group) => group.accounts.length > 0)
        .map((group) => (
          <ItemListGroup
            key={group.id}
            title={group.title}
            total={
              group.totalCents === undefined
                ? undefined
                : formatCents(group.totalCents)
            }
          >
            {group.accounts.map((item) => (
              <AccountListRow
                key={item.id}
                account={item}
                impliedTypes={group.impliedTypes}
              />
            ))}
          </ItemListGroup>
        ))}
      {primaryAction && (
        <div className="grid gap-2">
          {primaryAction === 'investment'
            ? [investment, account]
            : [account, investment]}
        </div>
      )}
    </ItemList>
  )
}

/**
 * A list card's figures: the total as the main figure and, when known, the
 * unrealised gain beside it (not in a sentence).
 */
export function AccountListTotal({
  totalCents,
  gainCents = null,
}: {
  totalCents: number
  gainCents?: number | null
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="text-2xl font-semibold whitespace-nowrap tabular-nums">
        {formatCents(totalCents)}
      </span>
      {gainCents !== null && (
        <span
          className={cn(
            'text-sm whitespace-nowrap tabular-nums',
            gainCents > 0 && 'text-chart-delta-good',
            gainCents < 0 && 'text-chart-delta-bad',
            gainCents === 0 && 'text-muted-foreground',
          )}
        >
          {signedCents(gainCents)} de plus-value
        </span>
      )}
    </p>
  )
}
