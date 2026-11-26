import { Link } from '@tanstack/react-router'
import { Badge, cn } from '@capi/ui'
import {
  ArrowDownIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyCheckIcon,
  CopyPlusIcon,
  FileWarningIcon,
  PlusIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type {
  CategoryDto,
  ConflictAction,
  ExistingTransactionDto,
  ImportPreviewRowDto,
} from '#/api'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { CategoryField } from '#/components/categories/CategoryPicker'
import { formatDate, monthOf } from './format'

/** The four kinds of lines of a preview (#433), each with its colours. */
export type LineKind = 'invalid' | 'conflict' | 'new' | 'duplicate'

export const LINE_KIND: Record<
  LineKind,
  { icon: typeof PlusIcon; tint: string; text: string; solid: string }
> = {
  invalid: {
    icon: FileWarningIcon,
    tint: 'bg-destructive/10',
    text: 'text-destructive',
    solid: 'bg-destructive text-white',
  },
  conflict: {
    icon: TriangleAlertIcon,
    tint: 'bg-warning/15',
    text: 'text-warning-foreground dark:text-warning',
    solid: 'bg-warning text-warning-foreground',
  },
  new: {
    icon: PlusIcon,
    tint: 'bg-success/12',
    text: 'text-success-foreground dark:text-success',
    solid: 'bg-success text-white',
  },
  duplicate: {
    icon: CheckIcon,
    tint: 'bg-muted',
    text: 'text-muted-foreground',
    solid: 'bg-muted-foreground text-background',
  },
}

/** The round coloured icon at the start of a line. */
export function KindIcon({ kind }: { kind: LineKind }) {
  const { icon: Icon, tint, text } = LINE_KIND[kind]
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full',
        tint,
        text,
      )}
    >
      <Icon className="size-3.5" />
    </span>
  )
}

/** A line typed in the preview in place of an unreadable one (#433). */
export function FixedBadge() {
  return (
    <Badge variant="secondary" outline>
      Corrigée
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
      <ManualMatchNote row={row} />
    </div>
  )
}

/** "Remplace « Ciné » du 08/11/2026" under a row matching a manual expense. */
export function ManualMatchNote({ row }: { row: ImportPreviewRowDto }) {
  const match = row.manualMatch
  if (!match) return null
  return (
    <p
      data-slot="manual-match"
      className="line-clamp-2 text-xs break-words whitespace-normal text-violet-800 dark:text-violet-300"
      title={`Dépense notée à la main le ${formatDate(match.bookingDate)} : ${match.rawLabel}`}
    >
      Remplace « {match.rawLabel} » du {formatDate(match.bookingDate)}
    </p>
  )
}

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
    <CategoryField
      label={`Catégorie de « ${row.rawLabel} »`}
      placeholder="À catégoriser"
      categories={categories}
      value={value}
      disabled={disabled}
      onPick={onChange}
      className="h-8 w-full text-sm"
    />
  )
}

/** The file row next to the stored transaction it may duplicate. */
export function ConflictCompare({ row }: { row: ImportPreviewRowDto }) {
  const existing = row.existing
  const side = 'bg-muted/50 min-w-0 rounded-xl p-2.5'
  return (
    <div className="grid min-w-0 grid-cols-1 items-center gap-1.5 text-sm @md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className={side}>
        <p className="text-muted-foreground text-xs">
          Dans le fichier · {formatDate(row.bookingDate)}
        </p>
        <p className="truncate font-medium" title={row.rawLabel}>
          {row.rawLabel}
        </p>
        <Amount cents={row.amountCents} />
      </div>
      <ArrowDownIcon
        aria-hidden
        className="text-muted-foreground mx-auto size-4 @md:hidden"
      />
      <ArrowRightIcon
        aria-hidden
        className="text-muted-foreground hidden size-4 @md:block"
      />
      <div className={side}>
        {existing ? (
          <>
            <p className="text-muted-foreground text-xs">
              Déjà enregistrée · {formatDate(existing.bookingDate)}
            </p>
            <p className="truncate font-medium" title={existing.rawLabel}>
              {existing.rawLabel}
            </p>
            <Amount cents={existing.amountCents} />
          </>
        ) : (
          <p className="text-muted-foreground text-xs">
            Opération enregistrée introuvable
          </p>
        )}
      </div>
    </div>
  )
}

interface ConflictChoiceProps {
  row: ImportPreviewRowDto
  value: ConflictAction
  onChange: (action: ConflictAction) => void
}

/**
 * The owner's answer for a probable duplicate: the same transaction (not
 * imported, the default) or two transactions (imported).
 */
export function ConflictChoice({ row, value, onChange }: ConflictChoiceProps) {
  const options: {
    action: ConflictAction
    kind: LineKind
    icon: typeof PlusIcon
    label: string
    hint: string
    ring: string
  }[] = [
    {
      action: 'skip',
      kind: 'duplicate',
      icon: CopyCheckIcon,
      label: 'C’est la même',
      hint: 'Pas importée',
      ring: 'border-muted-foreground/60',
    },
    {
      action: 'import',
      kind: 'new',
      icon: CopyPlusIcon,
      label: 'Ce sont deux opérations',
      hint: 'Importée en plus',
      ring: 'border-success',
    },
  ]
  return (
    <div
      role="group"
      aria-label={`Décision pour « ${row.rawLabel} »`}
      className="grid gap-2 @sm:grid-cols-2"
    >
      {options.map(({ action, kind, icon: Icon, label, hint, ring }) => {
        const selected = value === action
        const { tint, text } = LINE_KIND[kind]
        return (
          <button
            key={action}
            type="button"
            aria-pressed={selected}
            aria-label={label}
            className={cn(
              'touch-hitbox relative flex min-h-11 min-w-0 items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition-colors',
              'focus-visible:ring-ring/50 outline-none focus-visible:ring-3',
              selected
                ? cn(tint, ring)
                : 'glass-well border-transparent hover:bg-muted/50',
            )}
            onClick={() => onChange(action)}
          >
            <span
              aria-hidden
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full',
                selected
                  ? LINE_KIND[kind].solid
                  : cn('bg-muted', 'text-muted-foreground'),
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block text-sm font-medium break-normal',
                  selected && text,
                )}
              >
                {label}
              </span>
              <span className="text-muted-foreground block text-xs">
                {hint}
              </span>
            </span>
            {selected && (
              <CheckIcon aria-hidden className={cn('size-4 shrink-0', text)} />
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The stored transaction a line matches (#433), with a link to it on the
 * Opérations page (its month and account, searched by its label).
 */
export function ExistingMatch({
  existing,
  accountId,
}: {
  existing: ExistingTransactionDto
  accountId: string
}) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="min-w-0 break-normal">
        Déjà enregistrée le {formatDate(existing.bookingDate)} : «{' '}
        {existing.rawLabel} »
      </span>
      <Link
        to={ROUTES.transactions}
        search={{
          month: monthOf(existing.bookingDate),
          account: accountId,
          q: existing.rawLabel,
        }}
        className="text-foreground underline underline-offset-2"
      >
        Voir l’opération
      </Link>
    </p>
  )
}
