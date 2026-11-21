import {
  Button,
  cn,
  SETTING_GROUP_CLASS,
  SETTING_ROW_CLASS,
  SettingRow,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronRightIcon,
  HandCoinsIcon,
  SplitIcon,
  UsersIcon,
} from 'lucide-react'
import type {
  AccountDto,
  CategoryDto,
  TransactionDto,
  UpdateManualTransactionDto,
} from '#/api/types.gen'
import {
  RepaymentScreen,
  repaymentTitle,
} from '#/components/owed/RepaymentScreen'
import { owedSummaryQuery } from '#/components/owed/queries'
import { ShareScreen } from '#/components/owed/ShareScreen'
import { PrepaidScreen } from '#/components/subscriptions/PrepaidScreen'
import { formatCents } from '#/lib/money'
import { accountsQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import type { TransactionChanges } from './changes'
import { counterpartLabel } from './labels'
import { SplitEditor } from './SplitEditor'

/**
 * What only exists once a transaction is there (#398): the settings the
 * « Options » step of an edit adds, each opening its own screen in the
 * editor's frame (‹ back to « Options »), each applied at once with its
 * toast « Annuler », as before (#280, #296, #314, #357, #359).
 */
export type EditDetour =
  | 'counterpart'
  | 'share'
  | 'repayment'
  | 'split'
  | 'prepaid'

/** What the detours change, applied at once. */
export interface EditDetourActions {
  onChange: (changes: TransactionChanges) => void
  onSplit: (parts: { categoryId: string; amountCents: number }[]) => void
  onUnsplit: () => void
}

/**
 * What an edit applies to one transaction, bound to it by its row
 * (`useTransactionActions`: optimistic, a toast with « Annuler »).
 */
export interface TransactionEditActions extends EditDetourActions {
  onUpdateManual: (changes: UpdateManualTransactionDto) => Promise<boolean>
  onRestoreBank: () => void
}

export function detourTitle(detour: EditDetour, item: TransactionDto): string {
  switch (detour) {
    case 'counterpart':
      return counterpartLabel(item)
    case 'share':
      return 'Partager'
    case 'repayment':
      return repaymentTitle(item)
    case 'split':
      return 'Répartir'
    case 'prepaid':
      return 'Abonnement prépayé'
  }
}

/** The rows of an edit's « Options » that open a detour. */
export function EditOptionRows({
  item,
  onOpen,
}: {
  item: TransactionDto
  onOpen: (detour: EditDetour) => void
}) {
  const owed = useQuery(owedSummaryQuery)
  const iOweCents = owed.data?.iOwe.totalCents ?? 0
  const owedToMeCents = owed.data?.owedToMe.totalCents ?? 0
  const split = item.splits.length > 0
  const onAccount = item.accountId !== null
  const out = item.amountCents < 0
  // Money owed (#359): who owes what on it, what it repays.
  const owedShares = item.shares.filter((s) => s.direction === 'owed_to_me')
  const debt = item.shares.find((s) => s.direction === 'i_owe')
  const shareable = onAccount && item.kind === 'expense' && out && !split
  const repaidNames = [
    ...new Set(item.repayments.map((r) => r.contactName)),
  ].join(', ')

  const rows = [
    item.kind === 'transfer' && (
      <SettingRow
        key="counterpart"
        icon={ArrowRightIcon}
        label={counterpartLabel(item)}
        value={item.counterpartAccountName ?? 'Choisir'}
        onClick={() => onOpen('counterpart')}
      />
    ),
    shareable && (
      <SettingRow
        key="share"
        icon={UsersIcon}
        label="Partager"
        value={
          owedShares.length > 0
            ? owedShares.map((s) => s.contactName).join(', ')
            : 'Non'
        }
        onClick={() => onOpen('share')}
      />
    ),
    debt && (
      <Link
        key="debt"
        to={ROUTES.owedContact}
        params={{ contactId: debt.contactId }}
        className={SETTING_ROW_CLASS}
      >
        <HandCoinsIcon
          className="text-muted-foreground size-[0.8rem] shrink-0"
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
          <span className="break-normal">Je dois à {debt.contactName}</span>
          <span className="text-muted-foreground min-w-0 flex-[1_1_0%] truncate text-right">
            {debt.state === 'repaid'
              ? 'Remboursé'
              : debt.state === 'forgiven'
                ? 'Abandonné'
                : formatCents(debt.amountCents - debt.repaidCents)}
          </span>
        </span>
        <ChevronRightIcon
          className="text-muted-foreground size-[0.7rem] shrink-0"
          aria-hidden="true"
        />
      </Link>
    ),
    // A repayment, named by its direction (#398), only when there is
    // something to repay that way.
    onAccount && !out && (item.repayments.length > 0 || owedToMeCents > 0) && (
      <SettingRow
        key="repaid"
        icon={HandCoinsIcon}
        label="On me rembourse"
        value={repaidNames || 'Non'}
        onClick={() => onOpen('repayment')}
      />
    ),
    onAccount && out && (item.repayments.length > 0 || iOweCents > 0) && (
      <SettingRow
        key="repay"
        icon={HandCoinsIcon}
        label="Je rembourse"
        value={repaidNames || 'Non'}
        onClick={() => onOpen('repayment')}
      />
    ),
    <SettingRow
      key="split"
      icon={SplitIcon}
      label={split ? 'Répartition' : 'Répartir'}
      value={
        split
          ? [...new Set(item.splits.map((part) => part.category.name))].join(
              ', ',
            )
          : 'Non'
      }
      onClick={() => onOpen('split')}
    />,
    item.kind === 'expense' && out && (
      <SettingRow
        key="prepaid"
        icon={CalendarClockIcon}
        // Short: « 24 mois » stays whole beside it on a phone.
        label="Prépayé"
        value={
          item.prepaidItemId && item.prepaidTermMonths
            ? `${item.prepaidTermMonths} mois`
            : 'Non'
        }
        onClick={() => onOpen('prepaid')}
      />
    ),
  ].filter(Boolean)

  return <div className={SETTING_GROUP_CLASS}>{rows}</div>
}

/**
 * The owner's other account a transfer goes to or comes from (#296): every
 * open account but the transaction's own, then « Aucun ».
 */
function CounterpartScreen({
  item,
  onPick,
}: {
  item: TransactionDto
  onPick: (accountId: string | null) => void
}) {
  const accounts = useQuery(accountsQuery)
  const others = (accounts.data ?? []).filter(
    (account: AccountDto) => account.id !== item.accountId,
  )
  const options: { id: string | null; name: string }[] = [
    ...others.map((account) => ({ id: account.id, name: account.name })),
    { id: null, name: 'Aucun' },
  ]
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {item.amountCents < 0
          ? 'Le compte où cet argent est allé.'
          : 'Le compte d’où vient cet argent.'}{' '}
        Les virements liés à un placement comptent dans son montant investi.
      </p>
      {accounts.isPending ? (
        <p className="text-muted-foreground text-sm">Chargement…</p>
      ) : (
        <div
          role="radiogroup"
          aria-label={counterpartLabel(item)}
          className={SETTING_GROUP_CLASS}
        >
          {options.map((option) => {
            const current = option.id === item.counterpartAccountId
            return (
              <button
                key={option.id ?? 'none'}
                type="button"
                role="radio"
                aria-checked={current}
                onClick={() => onPick(option.id)}
                className={cn(SETTING_ROW_CLASS, 'justify-between')}
              >
                <span className="min-w-0 truncate py-2">{option.name}</span>
                {current && (
                  <CheckIcon
                    className="size-[0.8rem] shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** One detour's screen, in the editor's scrolling body. */
export function EditDetourScreen({
  detour,
  item,
  categories,
  actions,
  onDone,
}: {
  detour: EditDetour
  item: TransactionDto
  categories: readonly CategoryDto[]
  actions: EditDetourActions
  /** Back to « Options ». */
  onDone: () => void
}) {
  switch (detour) {
    case 'counterpart':
      return (
        <CounterpartScreen
          item={item}
          onPick={(counterpartAccountId) => {
            onDone()
            if (counterpartAccountId !== item.counterpartAccountId) {
              actions.onChange({ counterpartAccountId })
            }
          }}
        />
      )
    case 'share':
      return <ShareScreen item={item} />
    case 'repayment':
      return <RepaymentScreen item={item} onDone={onDone} />
    case 'prepaid':
      return <PrepaidScreen item={item} onDone={onDone} />
    case 'split':
      return (
        <div className="space-y-3">
          <SplitEditor
            item={item}
            categories={categories}
            onCancel={onDone}
            onSave={(parts) => {
              onDone()
              actions.onSplit(parts)
            }}
          />
          {item.splits.length > 0 && (
            <Button
              type="button"
              size="sm"
              ghost
              variant="secondary"
              onClick={() => {
                onDone()
                actions.onUnsplit()
              }}
            >
              Ne plus répartir
            </Button>
          )}
        </div>
      )
  }
}
