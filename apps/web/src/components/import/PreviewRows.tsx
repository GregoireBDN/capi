import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SegmentedControl,
  SegmentedControlItem,
} from '@capi/ui'
import { Fragment, useEffect, useState } from 'react'
import type { CategoryDto, ConflictAction, ImportPreviewRowDto } from '#/api'
import {
  conflictAction,
  effectiveCategoryId,
  willImport,
} from './commit-payload'
import type { PreviewChoices } from './commit-payload'
import { conflictReasonFr, formatDate } from './format'
import {
  Amount,
  CategorySelect,
  ConflictCompare,
  ConflictToggle,
  ManualMatchNote,
  RowLabel,
  RowStatusBadge,
} from './preview-parts'

/**
 * The table needs the width left by the sidebar on a large screen (the app's
 * root font size is 22px); below `xl` (phones, tablets, laptops with a narrow
 * window) rows are stacked cards.
 */
function useWideLayout(): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1280px)')
    const onChange = () => setWide(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return wide
}

export type RowFilter = 'todo' | 'new' | 'conflict' | 'duplicate' | 'all'

const FILTERS: { value: RowFilter; label: string }[] = [
  { value: 'todo', label: 'À traiter' },
  { value: 'new', label: 'Nouvelles' },
  { value: 'conflict', label: 'À confirmer' },
  { value: 'duplicate', label: 'Doublons' },
  { value: 'all', label: 'Toutes' },
]

function matches(row: ImportPreviewRowDto, filter: RowFilter): boolean {
  switch (filter) {
    case 'todo':
      return row.status !== 'duplicate'
    case 'all':
      return true
    default:
      return row.status === filter
  }
}

interface PreviewRowsProps {
  rows: ImportPreviewRowDto[]
  categories: CategoryDto[]
  choices: PreviewChoices
  onConflictChange: (rowIndex: number, action: ConflictAction) => void
  onCategoryChange: (rowIndex: number, categoryId: string) => void
}

export function PreviewRows(props: PreviewRowsProps) {
  const { rows } = props
  const [filter, setFilter] = useState<RowFilter>('todo')
  const wide = useWideLayout()
  const visible = rows.filter((row) => matches(row, filter))
  const duplicates = rows.filter((row) => row.status === 'duplicate').length

  return (
    <section aria-label="Opérations du fichier" className="space-y-3">
      <SegmentedControl
        fullWidth
        aria-label="Filtrer les opérations"
        value={filter}
        onValueChange={setFilter}
      >
        {FILTERS.map(({ value, label }) => (
          <SegmentedControlItem key={value} value={value}>
            {label}
            <span className="text-muted-foreground tabular-nums">
              {rows.filter((row) => matches(row, value)).length}
            </span>
          </SegmentedControlItem>
        ))}
      </SegmentedControl>

      {visible.length === 0 ? (
        <Card size="sm">
          <CardContent className="space-y-2 text-center text-sm">
            <p className="text-muted-foreground">
              {filter === 'todo' && duplicates > 0
                ? 'Aucune nouvelle opération : toutes les lignes sont déjà enregistrées.'
                : 'Aucune opération dans cette catégorie.'}
            </p>
            {filter === 'todo' && duplicates > 0 && (
              <Button
                size="sm"
                variant="secondary"
                outline
                onClick={() => setFilter('duplicate')}
              >
                Voir les doublons
              </Button>
            )}
          </CardContent>
        </Card>
      ) : wide ? (
        <RowTable {...props} rows={visible} />
      ) : (
        <RowCards {...props} rows={visible} />
      )}
    </section>
  )
}

function CategoryCell({
  row,
  categories,
  choices,
  onCategoryChange,
}: PreviewRowsProps & { row: ImportPreviewRowDto }) {
  if (row.status === 'duplicate') {
    return (
      <span className="text-muted-foreground text-xs">Déjà enregistrée</span>
    )
  }
  return (
    <CategorySelect
      row={row}
      categories={categories}
      value={effectiveCategoryId(row, choices)}
      disabled={!willImport(row, choices)}
      onChange={(categoryId) => onCategoryChange(row.index, categoryId)}
    />
  )
}

function ConflictDetails({
  row,
  choices,
  onConflictChange,
}: PreviewRowsProps & { row: ImportPreviewRowDto }) {
  const reason = conflictReasonFr(row.conflictReason)
  return (
    <div className="space-y-2">
      <ConflictCompare row={row} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {reason ? `${reason}. ` : ''}Doublon probable : importer quand même ?
        </p>
        <ConflictToggle
          row={row}
          value={conflictAction(row, choices)}
          onChange={(action) => onConflictChange(row.index, action)}
        />
      </div>
    </div>
  )
}

function RowTable(props: PreviewRowsProps) {
  return (
    <Card size="sm" className="py-0">
      {/* Fixed layout: long labels truncate instead of widening the table. */}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[6.5rem]">Statut</TableHead>
            <TableHead className="w-[5.5rem]">Date</TableHead>
            <TableHead>Libellé</TableHead>
            <TableHead className="w-[6.5rem] text-right">Montant</TableHead>
            <TableHead className="w-[11rem]">Catégorie</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.map((row) => (
            <Fragment key={row.index}>
              <TableRow
                data-testid={`row-${row.index}`}
                className={row.status === 'conflict' ? 'border-b-0' : undefined}
              >
                <TableCell>
                  <RowStatusBadge status={row.status} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatDate(row.bookingDate)}
                </TableCell>
                <TableCell>
                  <RowLabel row={row} />
                </TableCell>
                <TableCell className="text-right">
                  <Amount cents={row.amountCents} />
                </TableCell>
                <TableCell>
                  <CategoryCell {...props} row={row} />
                </TableCell>
              </TableRow>
              {row.status === 'conflict' && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="pt-0 whitespace-normal">
                    <ConflictDetails {...props} row={row} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function RowCards(props: PreviewRowsProps) {
  return (
    <ul className="space-y-2">
      {props.rows.map((row) => (
        <li key={row.index} data-testid={`row-${row.index}`}>
          <Card size="sm">
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <RowStatusBadge status={row.status} />
                <Amount cents={row.amountCents} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium" title={row.rawLabel}>
                  {row.rawLabel}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  <span className="tabular-nums">
                    {formatDate(row.bookingDate)}
                  </span>
                  {row.merchant && ` · ${row.merchant}`}
                </p>
                <ManualMatchNote row={row} />
              </div>
              {row.status === 'conflict' && (
                <ConflictDetails {...props} row={row} />
              )}
              {row.status !== 'duplicate' && (
                <CategoryCell {...props} row={row} />
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
