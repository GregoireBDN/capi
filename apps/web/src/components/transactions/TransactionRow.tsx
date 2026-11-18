import {
  Checkbox,
  cn,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import { SplitIcon, StickyNoteIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  CategoryDto,
  CorrectTransactionDto,
  TransactionDto,
  UpdateManualTransactionDto,
} from '#/api/types.gen'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import {
  expenseAmountError,
  ManualTransactionSheet,
} from '#/components/expenses/ManualTransactionSheet'
import { formatCalendarDate } from '#/lib/money'
import { Amount } from './Amount'
import { CategoryBadge } from './CategoryBadge'
import { CategoryPicker } from './CategoryPicker'
import type { TransactionChanges } from './changes'
import { displayLabel } from './labels'
import { TransactionEditor } from './TransactionEditor'

/**
 * Table-like columns once the page is ≥ 36rem wide (rems of the 22px root,
 * container query on the page), header included: selection, label,
 * category, account, flags, amount.
 */
export const ROW_GRID =
  '@xl:grid @xl:grid-cols-[2.25rem_minmax(0,1fr)_8rem_5rem_4.5rem_5.5rem] @xl:items-center @xl:gap-2'

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
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  /** Show the date in the row (lists not grouped by day). */
  showDate?: boolean
}

function Flags({ item }: { item: TransactionDto }) {
  const corrected =
    item.originalAmountCents !== null || item.originalBookingDate !== null
  return (
    <span className="flex flex-wrap items-center gap-1">
      {item.needsReview && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.7rem] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          À revoir
        </span>
      )}
      {item.manual && (
        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[0.7rem] font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-200">
          À la main
        </span>
      )}
      {corrected && (
        <span
          className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[0.7rem] font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-200"
          title="Montant ou date corrigé à la main"
        >
          Corrigée
        </span>
      )}
      {item.isOneOff && (
        <span className="bg-muted rounded-full px-1.5 py-0.5 text-[0.7rem] font-medium">
          Ponctuelle
        </span>
      )}
      {item.kind === 'transfer' && (
        <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[0.7rem] font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-200">
          Interne
        </span>
      )}
      {item.note && (
        <span title={item.note} className="text-muted-foreground">
          <StickyNoteIcon className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Note : {item.note}</span>
        </span>
      )}
    </span>
  )
}

/** Category of the row: its badge, or its split parts. */
function CategoryLabel({ item }: { item: TransactionDto }) {
  if (item.splits.length > 0) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <SplitIcon className="size-3.5" aria-hidden="true" />
        Répartie ({item.splits.length})
      </span>
    )
  }
  return item.category ? (
    <CategoryBadge category={item.category} />
  ) : (
    <span className="text-muted-foreground text-xs italic">Sans catégorie</span>
  )
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
 * One transaction: label, category, account, flags and amount, stacked on
 * narrow pages and in columns on wide ones (`ROW_GRID`). Activating the label
 * opens its editor (popover on desktop, bottom sheet on phones). On wide
 * pages the category is edited in the row, as is the amount of a transaction
 * entered by hand.
 */
export function TransactionRow({
  item,
  categories,
  selected,
  onSelectedChange,
  onChange,
  onUpdateManual,
  onCorrect,
  onRestoreBank,
  onSplit,
  onUnsplit,
  showDate = false,
}: TransactionRowProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [editingAmount, setEditingAmount] = useState(false)
  const amountButton = useRef<HTMLButtonElement>(null)
  const name = displayLabel(item)

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
      className="hover:bg-muted/50 focus-visible:ring-ring/50 min-w-0 flex-1 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-[3px]"
      onClick={() => setOpen(true)}
    >
      <span className="flex min-w-0 items-start justify-between gap-3 @xl:block">
        <span className="min-w-0">
          <span className="line-clamp-2 text-sm font-medium break-words @xl:line-clamp-1 @xl:break-all">
            {name}
          </span>
          {(item.merchant || showDate) && (
            <span className="text-muted-foreground block truncate text-xs">
              {showDate && (
                <time dateTime={item.bookingDate}>
                  {formatCalendarDate(item.bookingDate)}
                </time>
              )}
              {showDate && item.merchant && ' · '}
              {item.merchant && item.rawLabel}
            </span>
          )}
        </span>
        <Amount cents={item.amountCents} className="text-sm @xl:hidden" />
      </span>
      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 @xl:hidden">
        <CategoryLabel item={item} />
        <span className="text-muted-foreground truncate text-xs">
          {item.accountName}
        </span>
        <Flags item={item} />
      </span>
    </button>
  )

  const editor = (
    <TransactionEditor
      item={item}
      categories={categories}
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
      className={cn('flex flex-wrap items-center gap-1 px-1', ROW_GRID)}
      data-selected={selected || undefined}
      aria-label={name}
    >
      <Checkbox
        className="m-2"
        checked={selected}
        onCheckedChange={(checked) => onSelectedChange(checked === true)}
        aria-label={`Sélectionner ${name}`}
      />
      {isMobile ? (
        <>
          {triggerButton}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl"
            >
              <SheetHeader className="pb-0">
                <SheetTitle>Modifier l’opération</SheetTitle>
                <SheetDescription className="sr-only">
                  Catégorie, type, indicateurs et note de {name}
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">{editor}</div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[min(36rem,var(--radix-popover-content-available-height))] w-80 overflow-y-auto"
            aria-label={`Modifier ${name}`}
          >
            {editor}
          </PopoverContent>
        </Popover>
      )}

      {/* Wide pages: cells edited in place. */}
      <span className="hidden min-w-0 @xl:block">
        {item.splits.length > 0 ? (
          <CategoryLabel item={item} />
        ) : (
          <CategoryPicker
            categories={categories}
            value={item.categoryId}
            onChange={(categoryId) => change({ categoryId })}
            label={`Catégorie de ${name}`}
            placeholder="Sans catégorie"
            size="sm"
            className="w-full"
          />
        )}
      </span>
      <span className="text-muted-foreground hidden truncate text-xs @xl:block">
        {item.accountName}
      </span>
      <span className="hidden @xl:block">
        <Flags item={item} />
      </span>
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
            <Amount cents={item.amountCents} />
          </button>
        ) : (
          <Amount cents={item.amountCents} />
        )}
      </span>

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
