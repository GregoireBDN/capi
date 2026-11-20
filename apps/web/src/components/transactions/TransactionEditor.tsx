import {
  Button,
  cn,
  SETTING_GROUP_CLASS,
  SETTING_ROW_CLASS,
  SettingRow,
  SettingSwitchRow,
  Textarea,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  FlagIcon,
  HandCoinsIcon,
  PencilIcon,
  SparkleIcon,
  SplitIcon,
  StickyNoteIcon,
  TagIcon,
  UsersIcon,
} from 'lucide-react'
import { useState } from 'react'
import type {
  AccountDto,
  CategoryDto,
  CorrectTransactionDto,
  TransactionDto,
  TransactionKind,
} from '#/api/types.gen'
import { CategoryAvatar } from '#/components/categories/category-icons'
import { Link } from '@tanstack/react-router'
import {
  RepaymentScreen,
  repaymentTitle,
} from '#/components/owed/RepaymentScreen'
import { owedSummaryQuery } from '#/components/owed/queries'
import { othersPartCents } from '#/components/owed/shares'
import { ShareScreen } from '#/components/owed/ShareScreen'
import { PrepaidScreen } from '#/components/subscriptions/PrepaidScreen'
import { CategoryPicker } from '#/components/categories/CategoryPicker'
import { SheetScroll } from '#/components/sheets/form-sheet'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { accountsQuery } from '#/lib/queries'
import { Amount } from './Amount'
import type { TransactionChanges } from './changes'
import { ImportedCorrection } from './ImportedCorrection'
import {
  accountLabel,
  counterpartLabel,
  displayLabel,
  KIND_LABELS,
  secondaryLabel,
  TRANSACTION_KINDS,
} from './labels'
import { SplitEditor } from './SplitEditor'

const NOTE_MAX = 2000

/** Screens of the editor: the list of settings, then one per choice. */
type Screen =
  | 'list'
  | 'category'
  | 'note'
  | 'split'
  | 'correct'
  | 'kind'
  | 'kind-category'
  | 'counterpart'
  | 'prepaid'
  | 'share'
  | 'repayment'

interface TransactionEditorProps {
  item: TransactionDto
  categories: readonly CategoryDto[]
  onChange: (changes: TransactionChanges) => void
  /** Opens the editor of a transaction entered by hand (amount, date, ...). */
  onEditManual?: () => void
  /** "Corriger le montant ou la date" (bank values kept). */
  onCorrect?: (body: CorrectTransactionDto) => void
  onRestoreBank?: () => void
  /** Splits between categories (parts summing to the amount), or ends it. */
  onSplit?: (parts: { categoryId: string; amountCents: number }[]) => void
  onUnsplit?: () => void
  /** Screen shown first: the list, or the categories (« Classer », #322). */
  initialScreen?: 'list' | 'category'
}

/** A group of settings and its rows (#280, `@finances/ui` `setting-row`). */
const GROUP = SETTING_GROUP_CLASS
const ROW = SETTING_ROW_CLASS

/** Title of a screen with « Retour » to the list. */
function ScreenHeader({
  title,
  onBack,
}: {
  title: string
  onBack: () => void
}) {
  return (
    // One line (#326 feedback): ‹ then the screen's title, cut if too long.
    <div className="-ml-2 flex min-h-11 items-center gap-1">
      <Button
        type="button"
        variant="secondary"
        ghost
        iconOnly
        aria-label="Retour"
        title="Retour"
        onClick={onBack}
        className="shrink-0"
      >
        <ChevronLeftIcon />
      </Button>
      <h3 className="min-w-0 truncate text-base font-semibold">{title}</h3>
    </div>
  )
}

function NoteScreen({
  item,
  onSave,
}: {
  item: TransactionDto
  onSave: (note: string) => void
}) {
  const [note, setNote] = useState(item.note ?? '')
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(note.trim())
      }}
    >
      <Textarea
        autoFocus
        aria-label={`Note de ${displayLabel(item)}`}
        value={note}
        maxLength={NOTE_MAX}
        rows={4}
        placeholder="Ajouter une note…"
        onChange={(event) => setNote(event.target.value)}
      />
      <Button type="submit" className="justify-self-end">
        Enregistrer
      </Button>
    </form>
  )
}

/**
 * « Type » (#368): a categorized transaction has its category's kind, so
 * another kind is chosen with a category of that kind (next screen); an
 * uncategorized one takes the kind alone.
 */
function KindScreen({
  value,
  categorized,
  onPick,
}: {
  value: TransactionKind
  categorized: boolean
  onPick: (kind: TransactionKind) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {categorized
          ? 'Le type vient de la catégorie : un autre type, c’est une catégorie de ce type.'
          : 'Sans catégorie, le type se choisit seul.'}
      </p>
      <div role="radiogroup" aria-label="Type" className={GROUP}>
        {TRANSACTION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => onPick(kind)}
            className={cn(ROW, 'justify-between')}
          >
            {KIND_LABELS[kind]}
            {kind === value && (
              <CheckIcon className="size-[0.8rem]" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
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
          className={GROUP}
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
                className={cn(ROW, 'justify-between')}
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
 * The editor of one transaction (#280), like a settings list: the frequent
 * settings first (category, note, one-off, review), the rarer ones below
 * (split, correction, type); each choice opens its own screen with
 * « Retour ». Shown in a bottom sheet on phones and a right-hand panel on
 * wide pages. Switches apply at once; the note has its own screen.
 */
export function TransactionEditor({
  item,
  categories,
  onChange,
  onEditManual,
  onCorrect,
  onRestoreBank,
  onSplit,
  onUnsplit,
  initialScreen = 'list',
}: TransactionEditorProps) {
  const [screen, setScreen] = useState<Screen>(initialScreen)
  // The kind picked on « Type » whose category is being chosen (#368).
  const [newKind, setNewKind] = useState<TransactionKind>(item.kind)
  const owed = useQuery(owedSummaryQuery)
  const iOweCents = owed.data?.iOwe.totalCents ?? 0
  const name = displayLabel(item)
  const raw = secondaryLabel(item)
  const split = item.splits.length > 0
  const back = () => setScreen('list')

  if (screen === 'category') {
    return (
      <>
        <div className="shrink-0 px-4 pt-2">
          <ScreenHeader title="Catégorie" onBack={back} />
        </div>
        <CategoryPicker
          categories={categories}
          value={item.categoryId}
          onPick={(categoryId) => {
            back()
            if (categoryId !== item.categoryId) onChange({ categoryId })
          }}
          headerClassName="pt-1"
        />
      </>
    )
  }
  if (screen === 'note') {
    return (
      <SheetScroll className="space-y-3 px-4 pb-6">
        <ScreenHeader title="Note" onBack={back} />
        <NoteScreen
          item={item}
          onSave={(note) => {
            back()
            if (note !== (item.note ?? '')) onChange({ note })
          }}
        />
      </SheetScroll>
    )
  }
  if (screen === 'split' && onSplit) {
    return (
      <SheetScroll className="space-y-3 px-4 pb-6">
        <ScreenHeader title="Répartir" onBack={back} />
        <SplitEditor
          item={item}
          categories={categories}
          onCancel={back}
          onSave={(parts) => {
            back()
            onSplit(parts)
          }}
        />
        {split && onUnsplit && (
          <Button
            type="button"
            size="sm"
            ghost
            variant="secondary"
            onClick={() => {
              back()
              onUnsplit()
            }}
          >
            Ne plus répartir
          </Button>
        )}
      </SheetScroll>
    )
  }
  if (screen === 'correct' && onCorrect && onRestoreBank) {
    return (
      <SheetScroll className="space-y-3 px-4 pb-6">
        <ScreenHeader title="Montant et date" onBack={back} />
        <p className="text-muted-foreground text-xs">
          Le solde du compte et les prochains imports gardent les valeurs de la
          banque.
        </p>
        <ImportedCorrection
          item={item}
          onCancel={back}
          onCorrect={(body) => {
            back()
            onCorrect(body)
          }}
          onRestore={() => {
            back()
            onRestoreBank()
          }}
        />
      </SheetScroll>
    )
  }
  if (screen === 'counterpart') {
    return (
      <SheetScroll className="space-y-3 px-4 pb-6">
        <ScreenHeader title={counterpartLabel(item)} onBack={back} />
        <CounterpartScreen
          item={item}
          onPick={(counterpartAccountId) => {
            back()
            if (counterpartAccountId !== item.counterpartAccountId) {
              onChange({ counterpartAccountId })
            }
          }}
        />
      </SheetScroll>
    )
  }
  if (screen === 'prepaid') {
    return (
      <SheetScroll className="space-y-3 px-4 pb-6">
        <ScreenHeader title="Abonnement prépayé" onBack={back} />
        <PrepaidScreen item={item} onDone={back} />
      </SheetScroll>
    )
  }
  if (screen === 'share') {
    return (
      <SheetScroll className="space-y-3 px-4 pb-6">
        <ScreenHeader title="Partager" onBack={back} />
        <ShareScreen item={item} />
      </SheetScroll>
    )
  }
  if (screen === 'repayment') {
    return (
      <SheetScroll className="space-y-3 px-4 pb-6">
        <ScreenHeader title={repaymentTitle(item)} onBack={back} />
        <RepaymentScreen item={item} onDone={back} />
      </SheetScroll>
    )
  }
  if (screen === 'kind') {
    return (
      <SheetScroll className="space-y-3 px-4 pb-6">
        <ScreenHeader title="Type" onBack={back} />
        <KindScreen
          value={item.kind}
          categorized={item.categoryId !== null}
          onPick={(kind) => {
            if (kind === item.kind) return back()
            if (item.categoryId === null) {
              back()
              return onChange({ kind })
            }
            setNewKind(kind)
            setScreen('kind-category')
          }}
        />
      </SheetScroll>
    )
  }
  if (screen === 'kind-category') {
    return (
      <>
        <div className="shrink-0 px-4 pt-2">
          <ScreenHeader
            title={`Classer en ${KIND_LABELS[newKind].toLowerCase()}`}
            onBack={() => setScreen('kind')}
          />
        </div>
        <CategoryPicker
          categories={categories}
          kinds={[newKind]}
          value={null}
          onPick={(categoryId) => {
            back()
            onChange({ categoryId })
          }}
          none={{
            label: 'Sans catégorie, à revoir',
            selected: false,
            onPick: () => {
              back()
              onChange({ categoryId: null, kind: newKind })
            },
          }}
          headerClassName="pt-1"
        />
      </>
    )
  }

  const categoryValue = split
    ? [...new Set(item.splits.map((part) => part.category.name))].join(', ')
    : (item.category?.name ?? 'Choisir')
  const corrected =
    item.originalAmountCents !== null || item.originalBookingDate !== null
  // Money owed (#359): who owes what on it, what it repays.
  const owedShares = item.shares.filter((s) => s.direction === 'owed_to_me')
  const debt = item.shares.find((s) => s.direction === 'i_owe')
  const sharedCents = othersPartCents(item)
  const onAccount = item.accountId !== null
  const shareable =
    onAccount && item.kind === 'expense' && item.amountCents < 0 && !split
  const repaidNames = [
    ...new Set(item.repayments.map((r) => r.contactName)),
  ].join(', ')

  return (
    <SheetScroll className="space-y-3 px-4 pb-6">
      <div className="flex items-start gap-3 px-2">
        <CategoryAvatar
          category={
            split
              ? 'split'
              : item.category && {
                  color: item.category.color,
                  icon: item.category.icon,
                }
          }
        />
        <div className="min-w-0 flex-1">
          {/* The amount goes under the name when both don't fit, so the
          name is never squeezed into broken words (#325). */}
          <div className="flex flex-wrap items-start justify-between gap-x-3">
            <p className="min-w-0 flex-[1_1_auto] font-medium break-words">
              {name}
            </p>
            <Amount
              cents={item.amountCents}
              transfer={item.kind === 'transfer'}
              className="ml-auto"
            />
          </div>
          <p className="text-muted-foreground text-xs">
            <time dateTime={item.bookingDate}>
              {formatCalendarDate(item.bookingDate)}
            </time>
            {' · '}
            {accountLabel(item)}
          </p>
          {raw && (
            <p className="text-muted-foreground text-xs break-words">{raw}</p>
          )}
          {sharedCents > 0 && (
            <p className="text-muted-foreground text-xs">
              ma part {formatCents(-item.amountCents - sharedCents)}
            </p>
          )}
          {debt && (
            <p className="text-muted-foreground text-xs">
              ma part, payée par {debt.contactName}
              {debt.billCents !== null &&
                ` sur une addition de ${formatCents(debt.billCents)}`}
            </p>
          )}
        </div>
      </div>

      <div className={GROUP}>
        <SettingRow
          icon={split ? SplitIcon : TagIcon}
          label={split ? 'Répartition' : 'Catégorie'}
          value={categoryValue}
          onClick={() => setScreen(split && onSplit ? 'split' : 'category')}
        />
        {item.kind === 'transfer' && (
          <SettingRow
            icon={ArrowRightIcon}
            label={counterpartLabel(item)}
            value={item.counterpartAccountName ?? 'Choisir'}
            onClick={() => setScreen('counterpart')}
          />
        )}
        {shareable && (
          <SettingRow
            icon={UsersIcon}
            label="Partager"
            value={
              owedShares.length > 0
                ? owedShares.map((s) => s.contactName).join(', ')
                : 'Non'
            }
            onClick={() => setScreen('share')}
          />
        )}
        {onAccount && item.amountCents > 0 && (
          <SettingRow
            icon={HandCoinsIcon}
            label="C’est un remboursement"
            value={repaidNames || 'Non'}
            onClick={() => setScreen('repayment')}
          />
        )}
        {debt && (
          <Link
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
        )}
        <SettingRow
          icon={StickyNoteIcon}
          label="Note"
          value={item.note || 'Ajouter'}
          onClick={() => setScreen('note')}
        />
        <SettingSwitchRow
          icon={SparkleIcon}
          label="Ponctuelle"
          checked={item.isOneOff}
          onCheckedChange={(isOneOff) => onChange({ isOneOff })}
        />
        <SettingSwitchRow
          icon={FlagIcon}
          label="À revoir"
          checked={item.needsReview}
          onCheckedChange={(needsReview) => onChange({ needsReview })}
        />
      </div>

      <div className={GROUP}>
        {onSplit && !split && (
          <SettingRow
            icon={SplitIcon}
            label="Répartir"
            onClick={() => setScreen('split')}
          />
        )}
        {item.kind === 'expense' && item.amountCents < 0 && (
          <SettingRow
            icon={CalendarClockIcon}
            // Short: « 24 mois » stays whole beside it on a phone.
            label="Prépayé"
            value={
              item.prepaidItemId && item.prepaidTermMonths
                ? `${item.prepaidTermMonths} mois`
                : 'Non'
            }
            onClick={() => setScreen('prepaid')}
          />
        )}
        {item.manual
          ? onEditManual && (
              <SettingRow
                icon={PencilIcon}
                label="Modifier ou supprimer"
                onClick={onEditManual}
              />
            )
          : onCorrect &&
            onRestoreBank && (
              <SettingRow
                icon={PencilIcon}
                label="Corriger montant ou date"
                value={corrected ? 'Corrigée' : undefined}
                onClick={() => setScreen('correct')}
              />
            )}
        {onAccount &&
          item.amountCents < 0 &&
          (item.repayments.length > 0 || iOweCents > 0) && (
            <SettingRow
              icon={HandCoinsIcon}
              label="Je rembourse"
              value={repaidNames || 'Non'}
              onClick={() => setScreen('repayment')}
            />
          )}
        {/* A split's type is its parts' categories' (#368). */}
        {!split && (
          <SettingRow
            icon={ArrowLeftRightIcon}
            label="Type"
            value={KIND_LABELS[item.kind]}
            onClick={() => setScreen('kind')}
          />
        )}
      </div>
      {item.manual && (
        <p className="text-muted-foreground px-2 text-xs">
          Saisie à la main : l’import du relevé la remplacera par l’opération de
          la banque, en gardant sa catégorie, sa note et sa répartition.
        </p>
      )}
    </SheetScroll>
  )
}
