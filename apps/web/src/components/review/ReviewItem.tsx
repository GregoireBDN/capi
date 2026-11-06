import { Button, Checkbox, Switch } from '@finances/ui'
import { CheckIcon } from 'lucide-react'
import { useId } from 'react'
import type {
  CategoryDto,
  TransactionDto,
  TransactionKind,
} from '#/api/types.gen'
import { Amount } from '#/components/transactions/Amount'
import { CategoryBadge } from '#/components/transactions/CategoryBadge'
import { CategoryPicker } from '#/components/transactions/CategoryPicker'
import { KindSelect } from '#/components/transactions/KindSelect'
import { formatCalendarDate } from '#/lib/money'

interface ReviewItemProps {
  item: TransactionDto
  categories: readonly CategoryDto[]
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  onCategory: (categoryId: string) => void
  onKind: (kind: TransactionKind) => void
  onOneOff: (isOneOff: boolean) => void
  onValidate: () => void
}

/** One transaction of the review queue with its quick corrections. */
export function ReviewItem({
  item,
  categories,
  selected,
  onSelectedChange,
  onCategory,
  onKind,
  onOneOff,
  onValidate,
}: ReviewItemProps) {
  const oneOffId = useId()
  const name = item.rawLabel

  return (
    <li
      className="bg-card rounded-xl border p-3 sm:p-4"
      aria-label={name}
      data-selected={selected || undefined}
    >
      <div className="flex gap-3">
        <Checkbox
          className="mt-1"
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
          aria-label={`Sélectionner ${name}`}
        />
        <div className="min-w-0 flex-1 space-y-3">
          {/* The amount goes under the label when both don't fit abreast. */}
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-[7rem] flex-1 space-y-0.5">
              <p className="text-sm font-medium break-words sm:text-base">
                {item.rawLabel}
              </p>
              {item.merchant && (
                <p className="text-sm break-words">{item.merchant}</p>
              )}
              <p className="text-muted-foreground text-xs">
                <time dateTime={item.bookingDate}>
                  {formatCalendarDate(item.bookingDate)}
                </time>
                {' · '}
                {item.accountName}
              </p>
            </div>
            <Amount
              cents={item.amountCents}
              className="ml-auto pt-0.5 whitespace-nowrap"
            />
          </div>

          {item.category && (
            <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
              Catégorie actuelle : <CategoryBadge category={item.category} />
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <CategoryPicker
              categories={categories}
              value={item.categoryId}
              onChange={onCategory}
              label={`Catégorie de ${name}`}
              className="w-full sm:w-60"
            />
            <KindSelect
              value={item.kind}
              onChange={onKind}
              label={`Type de ${name}`}
              className="min-w-[min(10rem,100%)] flex-1 sm:w-44 sm:flex-none"
            />
            <div className="flex shrink-0 items-center gap-2">
              <Switch
                id={oneOffId}
                checked={item.isOneOff}
                onCheckedChange={onOneOff}
              />
              <label htmlFor={oneOffId} className="text-sm">
                Ponctuel
              </label>
            </div>
            <Button
              size="sm"
              variant="success"
              outline
              iconStart={<CheckIcon />}
              className="ml-auto"
              disabled={!item.categoryId}
              title={
                item.categoryId
                  ? 'Garder la catégorie actuelle'
                  : 'Choisissez d’abord une catégorie'
              }
              onClick={onValidate}
              aria-label={`Valider ${name}`}
            >
              Valider
            </Button>
          </div>
        </div>
      </div>
    </li>
  )
}
