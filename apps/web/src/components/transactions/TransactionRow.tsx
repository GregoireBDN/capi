import {
  Checkbox,
  cn,
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
import { StickyNoteIcon } from 'lucide-react'
import { useState } from 'react'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { ManualExpenseSheet } from '#/components/expenses/ManualExpenseSheet'
import { formatCalendarDate } from '#/lib/money'
import { Amount } from './Amount'
import { CategoryBadge } from './CategoryBadge'
import type { TransactionChanges } from './changes'
import { displayLabel } from './labels'
import { TransactionEditor } from './TransactionEditor'

/** Table-like columns once the page is ≥ 42rem wide (rems of the 22px root) (container query on the page), header included. */
export const ROW_GRID =
  '@2xl:grid @2xl:grid-cols-[minmax(0,1fr)_8rem_6rem_5rem_5.5rem] @2xl:items-center @2xl:gap-3'

interface TransactionRowProps {
  item: TransactionDto
  categories: readonly CategoryDto[]
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  onChange: (changes: TransactionChanges) => void
  /** Show the date in the row (lists not grouped by day). */
  showDate?: boolean
}

function Flags({ item }: { item: TransactionDto }) {
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

/**
 * One transaction: label, category, account, flags and amount, stacked on
 * narrow pages and in columns on wide ones (`ROW_GRID`). Activating it opens its editor (popover on
 * desktop, bottom sheet on phones).
 */
export function TransactionRow({
  item,
  categories,
  selected,
  onSelectedChange,
  onChange,
  showDate = false,
}: TransactionRowProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const name = displayLabel(item)

  function change(changes: TransactionChanges) {
    // A new category offers a rule above the list: get out of the way.
    if (changes.categoryId !== undefined) setOpen(false)
    onChange(changes)
  }

  const trigger = (
    <button
      type="button"
      aria-label={`Modifier ${name}`}
      aria-haspopup="dialog"
      className={cn(
        'hover:bg-muted/50 focus-visible:ring-ring/50 min-w-0 flex-1 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-[3px]',
        ROW_GRID,
      )}
      onClick={() => setOpen(true)}
    >
      <span className="flex min-w-0 items-start justify-between gap-3 @2xl:block">
        <span className="min-w-0">
          <span className="line-clamp-2 text-sm font-medium break-words @2xl:line-clamp-1 @2xl:break-all">
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
        <Amount cents={item.amountCents} className="text-sm @2xl:hidden" />
      </span>
      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 @2xl:contents">
        <span className="min-w-0 @2xl:block">
          {item.category ? (
            <CategoryBadge category={item.category} />
          ) : (
            <span className="text-muted-foreground text-xs italic">
              Sans catégorie
            </span>
          )}
        </span>
        <span className="text-muted-foreground truncate text-xs @2xl:block">
          {item.accountName}
        </span>
        <Flags item={item} />
      </span>
      <Amount
        cents={item.amountCents}
        className="hidden text-right text-sm @2xl:block"
      />
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
    />
  )

  return (
    <li
      className="flex items-center gap-1 px-1"
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
          {trigger}
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
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[min(36rem,var(--radix-popover-content-available-height))] w-80 overflow-y-auto"
            aria-label={`Modifier ${name}`}
          >
            {editor}
          </PopoverContent>
        </Popover>
      )}
      {item.manual && (
        <ManualExpenseSheet
          open={manualOpen}
          onOpenChange={setManualOpen}
          expense={item}
        />
      )}
    </li>
  )
}
