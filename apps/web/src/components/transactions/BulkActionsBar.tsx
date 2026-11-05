import { Button, NativeSelect, NativeSelectOption } from '@finances/ui'
import { CheckIcon } from 'lucide-react'
import type {
  CategoryDto,
  TransactionDto,
  TransactionKind,
} from '#/api/types.gen'
import { plural } from '#/lib/plural'
import { CategoryPicker } from './CategoryPicker'
import type { BulkChanges } from './changes'
import { KIND_LABELS, TRANSACTION_KINDS } from './labels'

interface BulkActionsBarProps {
  selected: readonly TransactionDto[]
  categories: readonly CategoryDto[]
  busy: boolean
  onApply: (changes: BulkChanges) => void
  onClear: () => void
}

/** Actions on the selected transactions, docked at the bottom. */
export function BulkActionsBar({
  selected,
  categories,
  busy,
  onApply,
  onClear,
}: BulkActionsBarProps) {
  const allOneOff = selected.every((item) => item.isOneOff)
  const anyInReview = selected.some((item) => item.needsReview)

  return (
    <div
      role="region"
      aria-label="Actions groupées"
      className="bg-card sticky bottom-4 z-10 flex flex-col gap-2 rounded-xl border p-3 shadow-lg @2xl:flex-row @2xl:flex-wrap @2xl:items-center @2xl:gap-3"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 @2xl:justify-start">
        <p className="text-sm font-medium whitespace-nowrap">
          {plural(
            selected.length,
            'opération sélectionnée',
            'opérations sélectionnées',
          )}
        </p>
        <Button size="sm" variant="secondary" ghost onClick={onClear}>
          Désélectionner
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 @2xl:flex @2xl:min-w-0 @2xl:flex-1 @2xl:flex-wrap @2xl:items-center @2xl:justify-end">
        <CategoryPicker
          categories={categories}
          value={null}
          onChange={(categoryId) => onApply({ categoryId })}
          label="Classer la sélection dans"
          placeholder="Classer dans…"
          disabled={busy}
          className="w-full @2xl:w-44"
        />
        <NativeSelect
          aria-label="Changer le type de la sélection"
          value=""
          disabled={busy}
          className="w-full @2xl:w-40"
          onChange={(event) => {
            if (event.target.value) {
              onApply({ kind: event.target.value as TransactionKind })
            }
          }}
        >
          <NativeSelectOption value="" disabled>
            Changer le type…
          </NativeSelectOption>
          {TRANSACTION_KINDS.map((kind) => (
            <NativeSelectOption key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          outline
          variant="secondary"
          disabled={busy}
          onClick={() => onApply({ isOneOff: !allOneOff })}
        >
          {allOneOff ? 'Non ponctuelles' : 'Ponctuelles'}
        </Button>
        <Button
          size="sm"
          variant="success"
          outline
          iconStart={<CheckIcon />}
          disabled={busy || !anyInReview}
          onClick={() => onApply({ needsReview: false })}
        >
          Marquer revues
        </Button>
      </div>
    </div>
  )
}
