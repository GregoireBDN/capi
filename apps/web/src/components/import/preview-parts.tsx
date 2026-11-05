import {
  Badge,
  cn,
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
  ToggleGroup,
  ToggleGroupItem,
} from '@finances/ui'
import type {
  CategoryDto,
  ConflictAction,
  ImportPreviewRowDto,
  ImportRowStatus,
} from '#/api'
import { formatCents, formatDate } from './format'

const STATUS: Record<
  ImportRowStatus,
  { label: string; variant: 'success' | 'secondary' | 'warning' }
> = {
  new: { label: 'Nouvelle', variant: 'success' },
  duplicate: { label: 'Doublon', variant: 'secondary' },
  conflict: { label: 'À confirmer', variant: 'warning' },
}

export function RowStatusBadge({ status }: { status: ImportRowStatus }) {
  const { label, variant } = STATUS[status]
  return (
    <Badge variant={variant} outline>
      {label}
    </Badge>
  )
}

/** Signed amount, red for debits and green for credits. */
export function Amount({
  cents,
  className,
}: {
  cents: number
  className?: string
}) {
  return (
    <span
      className={cn(
        'font-medium whitespace-nowrap tabular-nums',
        cents < 0
          ? 'text-destructive'
          : 'text-success-foreground dark:text-success',
        className,
      )}
    >
      {cents > 0 ? '+' : ''}
      {formatCents(cents)}
    </span>
  )
}

export function RowLabel({ row }: { row: ImportPreviewRowDto }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium" title={row.rawLabel}>
        {row.rawLabel}
      </p>
      {row.merchant && (
        <p className="text-muted-foreground truncate text-xs">{row.merchant}</p>
      )}
    </div>
  )
}

const KIND_GROUPS = [
  { kind: 'expense', label: 'Dépenses' },
  { kind: 'income', label: 'Revenus' },
  { kind: 'transfer', label: 'Mouvements' },
] as const

interface CategorySelectProps {
  row: ImportPreviewRowDto
  categories: CategoryDto[]
  value: string | null
  disabled?: boolean
  onChange: (categoryId: string) => void
}

/**
 * Category picker. "À catégoriser" is offered only while the row has no
 * category: the commit can replace a category, not remove one.
 */
export function CategorySelect({
  row,
  categories,
  value,
  disabled,
  onChange,
}: CategorySelectProps) {
  return (
    <NativeSelect
      size="sm"
      className="w-full"
      aria-label={`Catégorie de « ${row.rawLabel} »`}
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value) onChange(event.target.value)
      }}
    >
      {value === null && (
        <NativeSelectOption value="">À catégoriser</NativeSelectOption>
      )}
      {KIND_GROUPS.map((group) => {
        const options = categories.filter((c) => c.kind === group.kind)
        if (options.length === 0) return null
        return (
          <NativeSelectOptGroup key={group.kind} label={group.label}>
            {options.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        )
      })}
    </NativeSelect>
  )
}

/** A clearer "on" state than the outline toggle's default muted fill. */
export const SELECTED =
  'data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary'

interface ConflictToggleProps {
  row: ImportPreviewRowDto
  value: ConflictAction
  onChange: (action: ConflictAction) => void
}

export function ConflictToggle({ row, value, onChange }: ConflictToggleProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      aria-label={`Décision pour « ${row.rawLabel} »`}
      onValueChange={(next) => {
        if (next === 'import' || next === 'skip') onChange(next)
      }}
    >
      <ToggleGroupItem value="import" className={SELECTED}>
        Importer
      </ToggleGroupItem>
      <ToggleGroupItem value="skip" className={SELECTED}>
        Ignorer
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

/** The file row next to the stored transaction it may duplicate. */
export function ConflictCompare({ row }: { row: ImportPreviewRowDto }) {
  const existing = row.existing
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 text-xs sm:grid-cols-2">
      <div className="bg-muted/50 min-w-0 rounded-md border p-2">
        <p className="text-muted-foreground mb-1 font-medium">
          Dans le fichier
        </p>
        <p className="truncate">{row.rawLabel}</p>
        <p className="flex justify-between gap-2">
          <span>{formatDate(row.bookingDate)}</span>
          <Amount cents={row.amountCents} />
        </p>
      </div>
      <div className="bg-muted/50 min-w-0 rounded-md border p-2">
        <p className="text-muted-foreground mb-1 font-medium">
          Déjà enregistrée
        </p>
        {existing ? (
          <>
            <p className="truncate">{existing.rawLabel}</p>
            <p className="flex justify-between gap-2">
              <span>{formatDate(existing.bookingDate)}</span>
              <Amount cents={existing.amountCents} />
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Opération introuvable</p>
        )}
      </div>
    </div>
  )
}
