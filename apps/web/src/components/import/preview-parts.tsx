import { Link } from '@tanstack/react-router'
import { Badge, Button, cn } from '@capi/ui'
import {
  ArrowDownIcon,
  ArrowRightIcon,
  CheckIcon,
  FileWarningIcon,
  PlusIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type {
  CategoryDto,
  ConflictAction,
  ExistingTransactionDto,
  ImportPreviewRowDto,
  ParseIssueDto,
} from '#/api'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { CategoryField } from '#/components/categories/CategoryPicker'
import { formatDate, issueFields, monthOf } from './format'

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
  const options: { action: ConflictAction; label: string }[] = [
    { action: 'skip', label: 'C’est la même' },
    { action: 'import', label: 'Ce sont deux opérations' },
  ]
  return (
    <div
      role="group"
      aria-label={`Décision pour « ${row.rawLabel} »`}
      className="grid gap-2 @sm:grid-cols-2"
    >
      {options.map(({ action, label }) => (
        <Button
          key={action}
          type="button"
          variant="secondary"
          outline={value !== action}
          aria-pressed={value === action}
          className="h-auto min-h-9 min-w-0 py-1.5 break-normal whitespace-normal"
          onClick={() => onChange(action)}
        >
          {value === action && <CheckIcon />}
          {label}
        </Button>
      ))}
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

/**
 * What an unreadable line holds (#433): its cells as chips, the ones the
 * error blames in red, so it can be typed from them.
 */
export function IssueCells({ issue }: { issue: ParseIssueDto }) {
  if (!issue.cells) {
    return (
      <p className="text-muted-foreground text-xs">
        La ligne n’a pas pu être découpée en colonnes : saisissez-la d’après le
        fichier.
      </p>
    )
  }
  const blamed = issueFields(issue.message)
  return (
    <ul
      aria-label={`Contenu de la ligne ${issue.lineNumber}`}
      className="flex flex-wrap gap-1.5"
    >
      {issue.cells.map((cell, index) => {
        const bad = cell.field !== null && blamed.has(cell.field)
        const value = cell.value.trim()
        // Empty cells the error does not blame add nothing.
        if (value === '' && !bad) return null
        return (
          <li
            key={index}
            data-bad={bad || undefined}
            className={cn(
              'inline-flex max-w-full min-w-0 items-baseline gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs',
              bad
                ? 'border-destructive/60 bg-destructive/10 text-destructive ring-destructive/30 ring-2'
                : 'bg-muted/60',
            )}
          >
            <span className="text-muted-foreground shrink-0 font-sans">
              {cell.column || `Colonne ${index + 1}`}
            </span>
            <span className="min-w-0 truncate">{value || '—'}</span>
          </li>
        )
      })}
    </ul>
  )
}
