import {
  Button,
  cn,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import {
  CheckIcon,
  HandIcon,
  PencilLineIcon,
  SparkleIcon,
  StickyNoteIcon,
  TagIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  CategoryDto,
  CorrectTransactionDto,
  TransactionDto,
  UpdateManualTransactionDto,
} from '#/api/types.gen'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { CategoryAvatar } from '#/components/categories/category-icons'
import {
  expenseAmountError,
  ManualTransactionSheet,
} from '#/components/expenses/ManualTransactionSheet'
import { formatCalendarDate } from '#/lib/money'
import { Amount } from './Amount'
import { CategoryMenu } from './CategoryMenu'
import type { TransactionChanges } from './changes'
import { counterpartLabel, displayLabel, secondaryLabel } from './labels'
import { TransactionEditor } from './TransactionEditor'

/**
 * Columns once the page is ≥ 36rem wide (rems of the 22px root, container
 * query on the page): selection, label, category, amount; the account gets
 * its own column from 42rem, when it is shown at all (#266).
 */
const ROW_COLUMNS =
  '@xl:grid @xl:grid-cols-[2rem_minmax(0,1fr)_11rem_7.5rem] @xl:items-center @xl:gap-3'
const ROW_COLUMNS_WITH_ACCOUNT =
  '@2xl:grid-cols-[2rem_minmax(0,1fr)_11rem_8rem_7.5rem]'
/** The same with « Valider » last, while « À revoir » is filtered (#322). */
const REVIEW_ROW_COLUMNS =
  '@xl:grid-cols-[2rem_minmax(0,1fr)_11rem_7.5rem_6.5rem]'
const REVIEW_ROW_COLUMNS_WITH_ACCOUNT =
  '@2xl:grid-cols-[2rem_minmax(0,1fr)_11rem_8rem_7.5rem_6.5rem]'
/**
 * The review action: a 44px icon on narrow pages (the label keeps its
 * room), its name beside the icon in the wide row.
 */
const REVIEW_ACTION = 'size-8 p-0 @xl:size-auto @xl:pr-2 @xl:pl-1.5'
const REVIEW_ACTION_TEXT = 'sr-only @xl:not-sr-only'

export interface TransactionRowActions {
  onChange: (changes: TransactionChanges) => void
  onUpdateManual: (changes: UpdateManualTransactionDto) => Promise<boolean>
  onCorrect: (body: CorrectTransactionDto) => void
  onRestoreBank: () => void
  onSplit: (parts: { categoryId: string; amountCents: number }[]) => void
  onUnsplit: () => void
}

interface TransactionRowProps extends TransactionRowActions {
  item: TransactionDto
  categories: readonly CategoryDto[]
  selected?: boolean
  /**
   * Selects the row (its category icon is a checkbox); without it the row
   * cannot be selected (a short list with no bulk actions).
   */
  onSelectedChange?: (selected: boolean) => void
  /** Show the date in the row (lists not grouped by day). */
  showDate?: boolean
  /** Show the account (more than one open account, list not filtered to one). */
  showAccount?: boolean
  /**
   * The list is filtered on « À revoir » (#322): a row to review ends with
   * « Valider » (it keeps its category), or, without a category, on phones,
   * « Classer » (the editor opens on the categories).
   */
  onValidate?: () => void
}

/** Small flags of a row, as icons with an accessible name (#266). */
function Flags({ item }: { item: TransactionDto }) {
  const corrected =
    item.originalAmountCents !== null || item.originalBookingDate !== null
  const flags: { on: boolean; icon: LucideIcon; label: string }[] = [
    { on: item.isOneOff, icon: SparkleIcon, label: 'Ponctuelle' },
    { on: item.manual, icon: HandIcon, label: 'Saisie à la main' },
    {
      on: corrected,
      icon: PencilLineIcon,
      label: 'Montant ou date corrigé à la main',
    },
    {
      on: item.note !== null && item.note !== '',
      icon: StickyNoteIcon,
      label: `Note : ${item.note ?? ''}`,
    },
  ]
  return flags
    .filter((flag) => flag.on)
    .map(({ icon: Icon, label }) => (
      <span key={label} title={label} className="inline-flex">
        <Icon className="size-[0.6rem]" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    ))
}

/** Names of a split's categories, or the category of the row. */
function categoryText(item: TransactionDto): string | null {
  if (item.splits.length > 0) {
    return [...new Set(item.splits.map((part) => part.category.name))].join(
      ', ',
    )
  }
  return item.category?.name ?? null
}

function InlineAmount({
  item,
  onSave,
  onDone,
}: {
  item: TransactionDto
  onSave: (amountCents: number) => Promise<boolean>
  onDone: () => void
}) {
  const [value, setValue] = useState(centsToInput(Math.abs(item.amountCents)))
  const [error, setError] = useState<string | null>(null)
  const name = displayLabel(item)
  return (
    <form
      className="flex justify-end"
      onSubmit={(event) => {
        event.preventDefault()
        const invalid = expenseAmountError(value)
        if (invalid) {
          setError(invalid)
          return
        }
        const cents = parseEurosToCents(value)!
        onDone()
        if (cents !== Math.abs(item.amountCents)) void onSave(cents)
      }}
    >
      <InputGroup className="w-full">
        <InputGroupInput
          autoFocus
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Montant de ${name}`}
          aria-invalid={error !== null}
          title={error ?? 'Entrée pour enregistrer, Échap pour annuler'}
          className="text-right"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onDone()
            }
          }}
          onBlur={onDone}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>€</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

/**
 * One transaction (#266): the category's icon (which selects the row), one
 * label, the category, the account when it helps, small flag icons and the
 * amount. Stacked on narrow pages, in columns on wide ones. Activating the
 * label opens its editor (#280: a bottom sheet on phones, a right-hand panel
 * on wide pages); on
 * wide pages the category is picked in the row, as is the amount of a
 * transaction entered by hand.
 */
export function TransactionRow({
  item,
  categories,
  selected = false,
  onSelectedChange,
  onChange,
  onUpdateManual,
  onCorrect,
  onRestoreBank,
  onSplit,
  onUnsplit,
  showDate = false,
  showAccount = true,
  onValidate,
}: TransactionRowProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [openOn, setOpenOn] = useState<'list' | 'category'>('list')
  const [manualOpen, setManualOpen] = useState(false)
  const [editingAmount, setEditingAmount] = useState(false)
  const amountButton = useRef<HTMLButtonElement>(null)
  const name = displayLabel(item)
  const raw = secondaryLabel(item)
  const category = categoryText(item)
  const transfer = item.kind === 'transfer'

  // Leaving the amount edit hands the focus back to its button.
  const wasEditing = useRef(editingAmount)
  useEffect(() => {
    if (wasEditing.current && !editingAmount) amountButton.current?.focus()
    wasEditing.current = editingAmount
  }, [editingAmount])

  function change(changes: TransactionChanges) {
    // A new category offers a rule above the list: get out of the way.
    if (changes.categoryId !== undefined) setOpen(false)
    onChange(changes)
  }

  const triggerButton = (
    <button
      type="button"
      aria-label={`Modifier ${name}`}
      aria-haspopup="dialog"
      className="hover:bg-muted/50 focus-visible:ring-ring/50 min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-left outline-none focus-visible:ring-[3px]"
      onClick={() => {
        setOpenOn('list')
        setOpen(true)
      }}
    >
      {/* The amount goes under the label when both don't fit (320px). */}
      <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-3">
        <span className="line-clamp-2 min-w-[7rem] flex-1 text-sm font-medium break-words @xl:line-clamp-1 @xl:min-w-0 @xl:break-all">
          {name}
        </span>
        <Amount
          cents={item.amountCents}
          transfer={transfer}
          className="ml-auto text-sm @xl:hidden"
        />
      </span>
      <span className="text-muted-foreground mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs empty:hidden">
        {showDate && (
          <time dateTime={item.bookingDate} className="whitespace-nowrap">
            {formatCalendarDate(item.bookingDate)}
          </time>
        )}
        {/* Phones: the category and the account; wide pages have columns. */}
        <span
          className={cn(
            'max-w-full truncate @xl:hidden',
            category === null && 'italic',
          )}
        >
          {category ?? 'Sans catégorie'}
        </span>
        {showAccount && (
          <span className="max-w-full truncate @xl:hidden">
            <span aria-hidden="true">{'·\u00a0'}</span>
            {item.accountName}
          </span>
        )}
        {transfer && item.counterpartAccountName && (
          <span className="max-w-full truncate">
            <span aria-hidden="true">{'·\u00a0'}</span>
            {counterpartLabel(item)} {item.counterpartAccountName}
          </span>
        )}
        {raw && (
          <span className="hidden max-w-full truncate @xl:inline">{raw}</span>
        )}
        {showAccount && (
          <span className="hidden whitespace-nowrap @xl:inline @2xl:hidden">
            {item.accountName}
          </span>
        )}
        {/* Filtered on « À revoir », every row is: no badge (#322). */}
        {item.needsReview && !onValidate && (
          <span className="bg-warning text-warning-foreground rounded-full px-1.5 text-[0.7rem] font-medium whitespace-nowrap">
            À revoir
          </span>
        )}
        <Flags item={item} />
      </span>
    </button>
  )

  const avatar = (
    <CategoryAvatar
      category={
        item.splits.length > 0
          ? 'split'
          : item.category && {
              color: item.category.color,
              icon: item.category.icon,
            }
      }
      selected={selected}
      review={item.needsReview}
    />
  )

  const editor = (
    <TransactionEditor
      item={item}
      categories={categories}
      initialScreen={openOn}
      onChange={change}
      onEditManual={() => {
        setOpen(false)
        setManualOpen(true)
      }}
      onCorrect={(body) => {
        setOpen(false)
        onCorrect(body)
      }}
      onRestoreBank={() => {
        setOpen(false)
        onRestoreBank()
      }}
      onSplit={(parts) => {
        setOpen(false)
        onSplit(parts)
      }}
      onUnsplit={() => {
        setOpen(false)
        onUnsplit()
      }}
    />
  )

  return (
    <li
      className={cn(
        'flex items-center gap-1 px-1 py-0.5',
        ROW_COLUMNS,
        showAccount && ROW_COLUMNS_WITH_ACCOUNT,
        onValidate && REVIEW_ROW_COLUMNS,
        onValidate && showAccount && REVIEW_ROW_COLUMNS_WITH_ACCOUNT,
      )}
      data-selected={selected || undefined}
      aria-label={name}
    >
      {onSelectedChange ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Sélectionner ${name}`}
          title={selected ? 'Désélectionner' : 'Sélectionner'}
          onClick={() => onSelectedChange(!selected)}
          className="focus-visible:ring-ring/50 relative flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
        >
          {avatar}
        </button>
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center">
          {avatar}
        </span>
      )}
      {triggerButton}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={cn(
            'overflow-y-auto',
            isMobile &&
              'max-h-[calc(90svh-var(--keyboard-inset,0px))] rounded-t-xl',
          )}
        >
          <SheetHeader className="pb-0">
            <SheetTitle>Modifier l’opération</SheetTitle>
            <SheetDescription className="sr-only">
              Catégorie, note, indicateurs, répartition et correction de {name}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{editor}</div>
        </SheetContent>
      </Sheet>

      {/* Wide pages: the category, picked in place. */}
      <span className="hidden min-w-0 @xl:block">
        {item.splits.length > 0 ? (
          <span
            className="text-muted-foreground block truncate px-1.5 text-sm"
            title={category ?? undefined}
          >
            {category}
          </span>
        ) : (
          <CategoryMenu
            categories={categories}
            value={item.categoryId}
            onChange={(categoryId) => change({ categoryId })}
            label={`Catégorie de ${name}`}
          />
        )}
      </span>
      {showAccount && (
        <span
          className="text-muted-foreground hidden truncate text-xs @2xl:block"
          title={item.accountName}
        >
          {item.accountName}
        </span>
      )}
      <span className="hidden text-right text-sm @xl:block">
        {editingAmount && item.manual ? (
          <InlineAmount
            item={item}
            onSave={(amountCents) => onUpdateManual({ amountCents })}
            onDone={() => setEditingAmount(false)}
          />
        ) : item.manual ? (
          <button
            ref={amountButton}
            type="button"
            className="hover:bg-muted/50 rounded-md px-1 py-0.5"
            aria-label={`Modifier le montant de ${name}`}
            title="Modifier le montant"
            onClick={() => setEditingAmount(true)}
          >
            <Amount cents={item.amountCents} transfer={transfer} />
          </button>
        ) : (
          <Amount cents={item.amountCents} transfer={transfer} />
        )}
      </span>

      {onValidate && (
        <span className="flex shrink-0 justify-end">
          {item.needsReview && item.categoryId !== null && (
            <Button
              size="sm"
              variant="success"
              outline
              iconStart={<CheckIcon />}
              aria-label={`Valider ${name}`}
              title="Garder la catégorie et sortir de « À revoir »"
              className={REVIEW_ACTION}
              onClick={onValidate}
            >
              <span className={REVIEW_ACTION_TEXT}>Valider</span>
            </Button>
          )}
          {item.needsReview && item.categoryId === null && (
            // Wide pages pick the category in its column.
            <Button
              size="sm"
              variant="secondary"
              outline
              iconStart={<TagIcon />}
              aria-label={`Classer ${name}`}
              title="Choisir une catégorie"
              className={cn(REVIEW_ACTION, '@xl:hidden')}
              onClick={() => {
                setOpenOn('category')
                setOpen(true)
              }}
            >
              <span className={REVIEW_ACTION_TEXT}>Classer</span>
            </Button>
          )}
        </span>
      )}

      {item.manual && (
        <ManualTransactionSheet
          open={manualOpen}
          onOpenChange={setManualOpen}
          expense={item}
        />
      )}
    </li>
  )
}
