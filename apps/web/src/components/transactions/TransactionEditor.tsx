import { Button, cn, Input, Switch, Textarea, useIsMobile } from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  FlagIcon,
  PencilIcon,
  SearchIcon,
  SparkleIcon,
  SplitIcon,
  StickyNoteIcon,
  TagIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AccountDto,
  CategoryDto,
  CorrectTransactionDto,
  TransactionDto,
  TransactionKind,
} from '#/api/types.gen'
import {
  CategoryAvatar,
  categoryIconComponent,
} from '#/components/categories/category-icons'
import { pickableCategories } from '#/lib/categories'
import { formatCalendarDate } from '#/lib/money'
import { accountsQuery } from '#/lib/queries'
import { Amount } from './Amount'
import type { TransactionChanges } from './changes'
import { ImportedCorrection } from './ImportedCorrection'
import {
  counterpartLabel,
  displayLabel,
  KIND_GROUP_LABELS,
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
  | 'counterpart'

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
}

/**
 * A group of settings, iPhone style (#280): a tinted block without border,
 * square rows and straight full-width hairlines between them.
 */
const GROUP = 'bg-muted/60 divide-border divide-y overflow-hidden rounded-md'
/** A row of a group: square, hover and focus inside its block. */
const ROW =
  'hover:bg-muted focus-visible:ring-ring/50 flex min-h-9 w-full items-center gap-3 px-3 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-inset'

/** Lowercase, without accents, for the category search. */
function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** A row of the list that opens a screen: icon, name, value and ›. */
function SettingButton({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: LucideIcon
  label: string
  value?: ReactNode
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className={ROW}>
      <Icon
        className="text-muted-foreground size-[0.8rem] shrink-0"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 py-2">{label}</span>
      {value !== undefined && (
        <span className="text-muted-foreground max-w-[55%] truncate text-right">
          {value}
        </span>
      )}
      <ChevronRightIcon
        className="text-muted-foreground size-[0.7rem] shrink-0"
        aria-hidden="true"
      />
    </button>
  )
}

/** A row of the list with a switch, saved at once. */
function SettingSwitch({
  icon: Icon,
  label,
  checked,
  onCheckedChange,
}: {
  icon: LucideIcon
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex min-h-9 items-center gap-3 px-3 text-sm">
      <Icon
        className="text-muted-foreground size-[0.8rem] shrink-0"
        aria-hidden="true"
      />
      <label htmlFor={id} className="flex-1 cursor-pointer py-2">
        {label}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

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

/** The categories as chips with their icon, by kind, with a search (#280). */
function CategoryScreen({
  item,
  categories,
  onPick,
}: {
  item: TransactionDto
  categories: readonly CategoryDto[]
  onPick: (categoryId: string) => void
}) {
  // Phones: no keyboard over the chips until the search is tapped.
  const isMobile = useIsMobile()
  const [query, setQuery] = useState('')
  const wanted = searchable(query.trim())
  const shown = pickableCategories(categories, item.categoryId).filter(
    (category) => wanted === '' || searchable(category.name).includes(wanted),
  )
  // The transaction's own kind first: what it most likely belongs to.
  const kinds = [
    item.kind,
    ...TRANSACTION_KINDS.filter((kind) => kind !== item.kind),
  ]
  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-[0.8rem] -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          type="search"
          autoFocus={!isMobile}
          aria-label="Rechercher une catégorie"
          placeholder="Rechercher"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </div>
      {shown.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucune catégorie.</p>
      )}
      {kinds.map((kind) => {
        const group = shown.filter((category) => category.kind === kind)
        if (group.length === 0) return null
        return (
          <section key={kind} className="space-y-2">
            <h4 className="text-muted-foreground text-xs font-medium">
              {KIND_GROUP_LABELS[kind]}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {group.map((category) => {
                const Icon = categoryIconComponent(category.icon)
                const current = category.id === item.categoryId
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={current}
                    onClick={() => onPick(category.id)}
                    className={cn(
                      'focus-visible:ring-ring/50 inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-sm outline-none focus-visible:ring-[3px]',
                      current
                        ? 'border-primary bg-primary/10 font-medium'
                        : 'hover:bg-muted/60',
                    )}
                  >
                    <Icon
                      className="size-[0.75rem] shrink-0"
                      style={{ color: category.color ?? undefined }}
                      aria-hidden="true"
                    />
                    {category.name}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
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

function KindScreen({
  value,
  onPick,
}: {
  value: TransactionKind
  onPick: (kind: TransactionKind) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        La catégorie donne le type ; changez-le seulement pour une exception.
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
        Les virements liés à un placement font ses versements.
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
}: TransactionEditorProps) {
  const [screen, setScreen] = useState<Screen>('list')
  const name = displayLabel(item)
  const raw = secondaryLabel(item)
  const split = item.splits.length > 0
  const back = () => setScreen('list')

  if (screen === 'category') {
    return (
      <div className="space-y-3">
        <ScreenHeader title="Catégorie" onBack={back} />
        <CategoryScreen
          item={item}
          categories={categories}
          onPick={(categoryId) => {
            back()
            if (categoryId !== item.categoryId) onChange({ categoryId })
          }}
        />
      </div>
    )
  }
  if (screen === 'note') {
    return (
      <div className="space-y-3">
        <ScreenHeader title="Note" onBack={back} />
        <NoteScreen
          item={item}
          onSave={(note) => {
            back()
            if (note !== (item.note ?? '')) onChange({ note })
          }}
        />
      </div>
    )
  }
  if (screen === 'split' && onSplit) {
    return (
      <div className="space-y-3">
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
      </div>
    )
  }
  if (screen === 'correct' && onCorrect && onRestoreBank) {
    return (
      <div className="space-y-3">
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
      </div>
    )
  }
  if (screen === 'counterpart') {
    return (
      <div className="space-y-3">
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
      </div>
    )
  }
  if (screen === 'kind') {
    return (
      <div className="space-y-3">
        <ScreenHeader title="Type" onBack={back} />
        <KindScreen
          value={item.kind}
          onPick={(kind) => {
            back()
            if (kind !== item.kind) onChange({ kind })
          }}
        />
      </div>
    )
  }

  const categoryValue = split
    ? [...new Set(item.splits.map((part) => part.category.name))].join(', ')
    : (item.category?.name ?? 'Choisir')
  const corrected =
    item.originalAmountCents !== null || item.originalBookingDate !== null

  return (
    <div className="space-y-3">
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
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-medium break-words">{name}</p>
            <Amount
              cents={item.amountCents}
              transfer={item.kind === 'transfer'}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            <time dateTime={item.bookingDate}>
              {formatCalendarDate(item.bookingDate)}
            </time>
            {' · '}
            {item.accountName}
          </p>
          {raw && (
            <p className="text-muted-foreground text-xs break-words">{raw}</p>
          )}
        </div>
      </div>

      <div className={GROUP}>
        <SettingButton
          icon={split ? SplitIcon : TagIcon}
          label={split ? 'Répartition' : 'Catégorie'}
          value={categoryValue}
          onClick={() => setScreen(split && onSplit ? 'split' : 'category')}
        />
        {item.kind === 'transfer' && (
          <SettingButton
            icon={ArrowRightIcon}
            label={counterpartLabel(item)}
            value={item.counterpartAccountName ?? 'Choisir'}
            onClick={() => setScreen('counterpart')}
          />
        )}
        <SettingButton
          icon={StickyNoteIcon}
          label="Note"
          value={item.note || 'Ajouter'}
          onClick={() => setScreen('note')}
        />
        <SettingSwitch
          icon={SparkleIcon}
          label="Ponctuelle"
          checked={item.isOneOff}
          onCheckedChange={(isOneOff) => onChange({ isOneOff })}
        />
        <SettingSwitch
          icon={FlagIcon}
          label="À revoir"
          checked={item.needsReview}
          onCheckedChange={(needsReview) => onChange({ needsReview })}
        />
      </div>

      <div className={GROUP}>
        {onSplit && !split && (
          <SettingButton
            icon={SplitIcon}
            label="Répartir"
            onClick={() => setScreen('split')}
          />
        )}
        {item.manual
          ? onEditManual && (
              <SettingButton
                icon={PencilIcon}
                label="Modifier ou supprimer"
                onClick={onEditManual}
              />
            )
          : onCorrect &&
            onRestoreBank && (
              <SettingButton
                icon={PencilIcon}
                label="Corriger montant ou date"
                value={corrected ? 'Corrigée' : undefined}
                onClick={() => setScreen('correct')}
              />
            )}
        <SettingButton
          icon={ArrowLeftRightIcon}
          label="Type"
          value={KIND_LABELS[item.kind]}
          onClick={() => setScreen('kind')}
        />
      </div>
      {item.manual && (
        <p className="text-muted-foreground px-2 text-xs">
          Saisie à la main : l’import du relevé la remplacera par l’opération de
          la banque, en gardant sa catégorie, sa note et sa répartition.
        </p>
      )}
    </div>
  )
}
