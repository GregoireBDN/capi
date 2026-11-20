import { Button, FieldError } from '@finances/ui'
import { PlusIcon, XIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { AmountField } from '#/components/amount/AmountField'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { formatCents } from '#/lib/money'
import { CategoryField } from '#/components/categories/CategoryPicker'
import { isRefundPart, remainingCents, splitError } from './edits'

/** Most parts the API accepts. */
const MAX_PARTS = 20

interface Part {
  key: number
  categoryId: string
  /** Amount typed, in euros, without sign. */
  amount: string
}

interface SplitEditorProps {
  item: TransactionDto
  categories: readonly CategoryDto[]
  onSave: (parts: { categoryId: string; amountCents: number }[]) => void
  onCancel: () => void
}

/**
 * Splits a transaction between categories, e.g. a supermarket receipt
 * between groceries and household. Amounts are typed without sign (the
 * transaction's applies) and must add up exactly to its amount; what is
 * left to allocate shows as you type. Each part counts with its category's
 * kind (#357): on money received, a part in an expense category is labelled
 * « remboursement », since it is deducted from that category's spending.
 */
export function SplitEditor({
  item,
  categories,
  onSave,
  onCancel,
}: SplitEditorProps) {
  const id = useId()
  const sign = Math.sign(item.amountCents)
  const [parts, setParts] = useState<Part[]>(() =>
    item.splits.length > 0
      ? item.splits.map((part, key) => ({
          key,
          categoryId: part.categoryId,
          amount: centsToInput(Math.abs(part.amountCents)),
        }))
      : [
          {
            key: 0,
            categoryId: item.categoryId ?? '',
            amount: centsToInput(Math.abs(item.amountCents)),
          },
          { key: 1, categoryId: '', amount: '' },
        ],
  )
  const [submitted, setSubmitted] = useState(false)

  const typed = parts.map((part) => {
    const cents =
      part.amount.trim() === '' ? null : parseEurosToCents(part.amount)
    return {
      categoryId: part.categoryId,
      amountCents: cents === null ? null : cents * sign,
    }
  })
  const byId = new Map(categories.map((category) => [category.id, category]))
  const left = remainingCents(item.amountCents, typed)
  const error = splitError(
    item.amountCents,
    typed,
    (categoryId) => byId.get(categoryId)?.kind,
  )

  function change(key: number, patch: Partial<Part>) {
    setParts((current) =>
      current.map((part) => (part.key === key ? { ...part, ...patch } : part)),
    )
  }

  function addPart() {
    setParts((current) => [
      ...current,
      {
        key: Math.max(...current.map((part) => part.key)) + 1,
        categoryId: '',
        // Offer what is left.
        amount: left * sign > 0 ? centsToInput(Math.abs(left)) : '',
      },
    ])
  }

  return (
    <form
      noValidate
      aria-label="Répartir entre catégories"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
        if (error) return
        onSave(
          typed.map((part) => ({
            categoryId: part.categoryId,
            amountCents: part.amountCents!,
          })),
        )
      }}
    >
      <ul className="space-y-2">
        {parts.map((part, index) => {
          const category = byId.get(part.categoryId)
          const refund = category && isRefundPart(item, category.kind)
          return (
            <li key={part.key} className="flex flex-wrap items-center gap-2">
              <CategoryField
                id={`${id}-category-${part.key}`}
                categories={categories}
                value={part.categoryId || null}
                onPick={(categoryId) => change(part.key, { categoryId })}
                label={`Catégorie de la part ${index + 1}`}
                className="min-w-[8rem] flex-1"
              />
              <AmountField
                groupClassName="w-[6.5rem]"
                aria-label={`Montant de la part ${index + 1}`}
                placeholder="0,00"
                value={part.amount}
                onValueChange={(amount) => change(part.key, { amount })}
              />
              <Button
                type="button"
                iconOnly
                ghost
                variant="secondary"
                aria-label={`Retirer la part ${index + 1}`}
                disabled={parts.length <= 2}
                onClick={() =>
                  setParts((current) =>
                    current.filter((other) => other.key !== part.key),
                  )
                }
              >
                <XIcon />
              </Button>
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
      {submitted && error && <FieldError>{error}</FieldError>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          ghost
          variant="secondary"
          onClick={onCancel}
        >
          Annuler
        </Button>
        <Button type="submit" size="sm">
          Enregistrer la répartition
        </Button>
      </div>
    </form>
  )
}
