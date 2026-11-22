import { Button, FieldError } from '@finances/ui'
import { PlusIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { useId } from 'react'
import { AmountField } from '#/components/amount/AmountField'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { centsToInput } from '#/components/budget/amount'
import { formatCents } from '#/lib/money'
import { CategoryField } from '#/components/categories/CategoryPicker'
import { isRefundPart, remainingCents, splitError } from './edits'
import { typedSplitParts } from './edit-draft'
import type { SplitPartDraft } from './edit-draft'

/** Most parts the API accepts. */
const MAX_PARTS = 20

interface SplitEditorProps {
  /** The transaction as the draft has it: its amount (and sign). */
  item: TransactionDto
  /** The parts of the draft; empty when not split. */
  parts: readonly SplitPartDraft[]
  onChange: (parts: SplitPartDraft[]) => void
  categories: readonly CategoryDto[]
  /** Say what is wrong (after ✓ « Enregistrer »). */
  showError?: boolean
  /** Back to the parts as the editor opened (shown once they changed). */
  onReset?: () => void
  /** Ends a split the transaction had (empty parts). */
  onUnsplit?: () => void
}

/**
 * Splits a transaction between categories, e.g. a supermarket receipt
 * between groceries and household. Amounts are typed without sign (the
 * transaction's applies) and must add up exactly to its amount; what is
 * left to allocate shows as you type. Each part counts with its category's
 * kind (#357): on money received, a part in an expense category is labelled
 * « remboursement », since it is deducted from that category's spending.
 *
 * The editor's draft (#435): every change goes into it at once, nothing to
 * validate here; ‹ keeps it, « Réinitialiser » puts back the parts as the
 * editor opened, ✓ « Enregistrer » saves it with the rest. Not split yet,
 * it starts from the whole amount in the transaction's category and a
 * second part to fill, which become the draft at the first change.
 */
export function SplitEditor({
  item,
  parts: draftParts,
  onChange,
  categories,
  showError = false,
  onReset,
  onUnsplit,
}: SplitEditorProps) {
  const id = useId()
  const parts: SplitPartDraft[] =
    draftParts.length > 0
      ? [...draftParts]
      : [
          {
            categoryId: item.categoryId ?? '',
            amount: centsToInput(Math.abs(item.amountCents)),
          },
          { categoryId: '', amount: '' },
        ]
  const sign = Math.sign(item.amountCents)
  const typed = typedSplitParts(parts, item.amountCents)
  const byId = new Map(categories.map((category) => [category.id, category]))
  const left = remainingCents(item.amountCents, typed)
  const error = splitError(
    item.amountCents,
    typed,
    (categoryId) => byId.get(categoryId)?.kind,
  )

  function change(index: number, patch: Partial<SplitPartDraft>) {
    onChange(
      parts.map((part, at) => (at === index ? { ...part, ...patch } : part)),
    )
  }

  function addPart() {
    onChange([
      ...parts,
      {
        categoryId: '',
        // Offer what is left.
        amount: left * sign > 0 ? centsToInput(Math.abs(left)) : '',
      },
    ])
  }

  return (
    <div
      role="group"
      aria-label="Répartir entre catégories"
      className="space-y-3"
    >
      <ul className="space-y-2">
        {parts.map((part, index) => {
          const category = byId.get(part.categoryId)
          const refund = category && isRefundPart(item, category.kind)
          return (
            // The parts have no id of their own: their place is theirs.
            <li key={index} className="flex flex-wrap items-center gap-2">
              <CategoryField
                id={`${id}-category-${index}`}
                categories={categories}
                value={part.categoryId || null}
                onPick={(categoryId) => change(index, { categoryId })}
                label={`Catégorie de la part ${index + 1}`}
                className="min-w-[8rem] flex-1"
              />
              {/* The amount and its ✕ stay together: under the category
                  when both don't fit (a phone). */}
              <span className="ml-auto flex shrink-0 items-center gap-2">
                <AmountField
                  groupClassName="w-[6.5rem]"
                  aria-label={`Montant de la part ${index + 1}`}
                  placeholder="0,00"
                  value={part.amount}
                  onValueChange={(amount) => change(index, { amount })}
                />
                <Button
                  type="button"
                  iconOnly
                  ghost
                  variant="secondary"
                  aria-label={`Retirer la part ${index + 1}`}
                  disabled={parts.length <= 2}
                  onClick={() =>
                    onChange(parts.filter((_, at) => at !== index))
                  }
                >
                  <XIcon />
                </Button>
              </span>
              {refund && (
                <p className="w-full text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Remboursement
                  </span>{' '}
                  : déduit des dépenses {category.name}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button
          type="button"
          size="sm"
          ghost
          variant="secondary"
          disabled={parts.length >= MAX_PARTS}
          onClick={addPart}
        >
          <PlusIcon />
          Ajouter une part
        </Button>
        <span
          aria-live="polite"
          className={
            left === 0
              ? 'text-muted-foreground'
              : 'font-medium text-amber-700 dark:text-amber-300'
          }
        >
          {left === 0
            ? 'Tout est réparti'
            : `Reste à répartir : ${formatCents(Math.abs(left))}`}
        </span>
      </div>
      {showError && error && draftParts.length > 0 && (
        <FieldError>{error}</FieldError>
      )}
      {(onReset || onUnsplit) && (
        <div className="flex flex-wrap gap-2">
          {onReset && (
            <Button
              type="button"
              size="sm"
              ghost
              variant="secondary"
              onClick={onReset}
            >
              <RotateCcwIcon />
              Réinitialiser
            </Button>
          )}
          {onUnsplit && (
            <Button
              type="button"
              size="sm"
              ghost
              variant="secondary"
              onClick={onUnsplit}
            >
              Ne plus répartir
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
