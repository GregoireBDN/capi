import {
  cn,
  SETTING_GROUP_CLASS,
  SETTING_ROW_CLASS,
  SettingRow,
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronRightIcon,
  HandCoinsIcon,
  HandshakeIcon,
  ReceiptTextIcon,
  SplitIcon,
} from 'lucide-react'
import type {
  AccountDto,
  CategoryDto,
  SaveTransactionEditDto,
  TransactionDto,
  UpdateManualTransactionDto,
} from '#/api/types.gen'
import {
  RepaymentScreen,
  repaymentTitle,
} from '#/components/owed/RepaymentScreen'
import { contactsQuery, owedSummaryQuery } from '#/components/owed/queries'
import { ShareFields } from '#/components/owed/ShareScreen'
import { PrepaidScreen } from '#/components/subscriptions/PrepaidScreen'
import { formatCents } from '#/lib/money'
import { accountsQuery, categoriesQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import type { TransactionChanges } from './changes'
import { draftSplitError } from './edit-draft'
import type { EditDraft } from './edit-draft'
import { counterpartLabel } from './labels'
import { SplitEditor } from './SplitEditor'

/**
 * What only exists once a transaction is there (#398): the settings the
 * « Options » step of an edit adds, each opening its own screen in the
 * editor's frame (‹ back to « Options »). Each changes the editor's draft
 * only, saved with everything else by « Enregistrer » (#435).
 */
export type EditDetour =
  | 'counterpart'
  | 'share'
  | 'repayment'
  | 'split'
  | 'prepaid'

/**
 * What a transaction's row applies (`useTransactionActions`): one change at
 * once (the category picked in the row, « Classer », « Valider »), the amount
 * typed in the row, and the editor's « Enregistrer » (#435), each with its
 * toast « Annuler ».
 */
export interface TransactionEditActions {
  onChange: (changes: TransactionChanges) => void
  onUpdateManual: (changes: UpdateManualTransactionDto) => Promise<boolean>
  /** Saves every change of the editor at once; false when refused. */
  onSave: (edit: SaveTransactionEditDto) => Promise<boolean>
}

export function detourTitle(detour: EditDetour, item: TransactionDto): string {
  switch (detour) {
    case 'counterpart':
      return counterpartLabel(item)
    case 'share':
      return 'J’ai payé pour quelqu’un'
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
  saved,
  draft,
  onOpen,
  onLeave,
}: {
  /** The transaction as the draft has it (kind, amount, account). */
  item: TransactionDto
  /** The transaction as saved: its repayments and debts. */
  saved: TransactionDto
  draft: EditDraft
  onOpen: (detour: EditDetour) => void
  /** Leaves the editor for another page (asks first when unsaved). */
  onLeave: (go: () => void) => void
}) {
  const navigate = useNavigate()
  const owed = useQuery(owedSummaryQuery)
  const accounts = useQuery(accountsQuery)
  const iOweCents = owed.data?.iOwe.totalCents ?? 0
  const owedToMeCents = owed.data?.owedToMe.totalCents ?? 0
  const split = draft.splits.length > 0
  const onAccount = item.accountId !== null
  const out = item.amountCents < 0
  // Money owed (#359): who owes what on it, what it repays.
  const debt = saved.shares.find((s) => s.direction === 'i_owe')
  const shareable = onAccount && item.kind === 'expense' && out && !split
  const repaidNames = [
    ...new Set([
      ...saved.repayments
        .filter((r) => !draft.repayment.unlink.includes(r.id))
        .map((r) => r.contactName),
      ...(draft.repayment.link?.items ?? []).map((i) => i.contactName),
    ]),
  ]
    .filter(Boolean)
    .join(', ')
  const linkedSomething =
    saved.repayments.length > 0 || draft.repayment.link !== null
  const counterpartName =
    draft.counterpartAccountId === null
      ? null
      : ((accounts.data ?? []).find((a) => a.id === draft.counterpartAccountId)
          ?.name ??
        (draft.counterpartAccountId === saved.counterpartAccountId
          ? saved.counterpartAccountName
          : null))
  const categories = useQuery(categoriesQuery)
  const categoryNames = new Map(
    (categories.data ?? []).map((category) => [category.id, category.name]),
  )

  const rows = [
    item.kind === 'transfer' && (
      <SettingRow
        key="counterpart"
        icon={ArrowRightIcon}
        label={counterpartLabel(item)}
        value={counterpartName ?? 'Choisir'}
        onClick={() => onOpen('counterpart')}
      />
    ),
    shareable && (
      <SettingRow
        key="share"
        icon={HandCoinsIcon}
        label="J’ai payé pour quelqu’un"
        // No « Non »: beside the long label it would be cut (#409).
        value={
          draft.share.people.length > 0
            ? draft.share.people.map((person) => person.name).join(', ')
            : undefined
        }
        onClick={() => onOpen('share')}
      />
    ),
    debt && (
      <button
        key="debt"
        type="button"
        className={SETTING_ROW_CLASS}
        onClick={() =>
          onLeave(
            () =>
              void navigate({
                to: ROUTES.owedContact,
                params: { contactId: debt.contactId },
              }),
          )
        }
      >
        <ReceiptTextIcon
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
                : formatCents(
                    debt.amountCents - debt.repaidCents - debt.forgivenCents,
                  )}
          </span>
        </span>
        <ChevronRightIcon
          className="text-muted-foreground size-[0.7rem] shrink-0"
          aria-hidden="true"
        />
      </button>
    ),
    // A repayment, named by its direction (#398), only when there is
    // something to repay that way.
    onAccount && !out && (linkedSomething || owedToMeCents > 0) && (
      <SettingRow
        key="repaid"
        icon={HandshakeIcon}
        label="On me rembourse"
        value={repaidNames || 'Non'}
        onClick={() => onOpen('repayment')}
      />
    ),
    onAccount && out && (linkedSomething || iOweCents > 0) && (
      <SettingRow
        key="repay"
        icon={HandshakeIcon}
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
        // Started but not adding up yet: ✓ is refused until it does.
        split &&
        draftSplitError(draft.splits, item.amountCents, categories.data ?? [])
          ? 'À compléter'
          : split
            ? [
                ...new Set(
                  draft.splits.map(
                    (part) => categoryNames.get(part.categoryId) ?? '…',
                  ),
                ),
              ].join(', ')
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
          draft.prepaidTermMonths
            ? `${draft.prepaidTermMonths} mois`
            : // Not prepaid: the term #439 suggests, until one is chosen.
              !saved.prepaidItemId && saved.prepaidSuggestion
              ? `${saved.prepaidSuggestion.termMonths} mois ?`
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
  value,
  onPick,
}: {
  item: TransactionDto
  value: string | null
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
            const current = option.id === value
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

/**
 * One detour's screen, in the editor's scrolling body: it changes the draft
 * (#435), nothing is saved before « Enregistrer ».
 */
export function EditDetourScreen({
  detour,
  item,
  saved,
  categories,
  draft,
  initial,
  showErrors,
  onDraftChange,
  onDone,
}: {
  detour: EditDetour
  /** The transaction as the draft has it (kind, amount, day). */
  item: TransactionDto
  /** The transaction as saved: what is linked to it now. */
  saved: TransactionDto
  categories: readonly CategoryDto[]
  draft: EditDraft
  /** The draft as the editor opened: what « Réinitialiser » puts back. */
  initial: EditDraft
  /** ✓ was tried: say what is wrong. */
  showErrors: boolean
  onDraftChange: (draft: EditDraft) => void
  /** Back to « Options ». */
  onDone: () => void
}) {
  const contacts = useQuery({ ...contactsQuery(), enabled: detour === 'share' })
  switch (detour) {
    case 'counterpart':
      return (
        <CounterpartScreen
          item={item}
          value={draft.counterpartAccountId}
          onPick={(counterpartAccountId) => {
            onDraftChange({ ...draft, counterpartAccountId })
            onDone()
          }}
        />
      )
    case 'share':
      if (draft.splits.length > 0) {
        return (
          <p className="text-muted-foreground text-sm">
            Cette opération est répartie entre plusieurs catégories : retirez la
            répartition pour la partager.
          </p>
        )
      }
      return (
        <ShareFields
          totalCents={-item.amountCents}
          draft={draft.share}
          onChange={(share) => onDraftChange({ ...draft, share })}
          contacts={contacts.data ?? []}
        />
      )
    case 'repayment':
      return (
        <RepaymentScreen
          item={saved}
          draft={draft.repayment}
          onChange={(repayment) => onDraftChange({ ...draft, repayment })}
          onDone={onDone}
        />
      )
    case 'prepaid':
      return (
        <PrepaidScreen
          item={item}
          value={draft.prepaidTermMonths}
          onChange={(prepaidTermMonths) => {
            onDraftChange({ ...draft, prepaidTermMonths })
            onDone()
          }}
        />
      )
    case 'split': {
      const changed =
        JSON.stringify(draft.splits) !== JSON.stringify(initial.splits)
      // Changed as typed (#435): ‹ keeps it, ✓ saves it with the rest.
      return (
        <SplitEditor
          item={item}
          parts={draft.splits}
          categories={categories}
          showError={showErrors}
          onChange={(splits) => onDraftChange({ ...draft, splits })}
          onReset={
            changed
              ? () => onDraftChange({ ...draft, splits: initial.splits })
              : undefined
          }
          onUnsplit={
            initial.splits.length > 0 && draft.splits.length > 0
              ? () => onDraftChange({ ...draft, splits: [] })
              : undefined
          }
        />
      )
    }
  }
}
