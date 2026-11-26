import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, CardContent, FieldError, cn } from '@capi/ui'
import { ChevronDownIcon, CircleAlertIcon, CopyCheckIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { importsControllerUnfixLine } from '#/api'
import type {
  CategoryDto,
  ConflictAction,
  ImportDetailDto,
  ImportPreviewRowDto,
  ParseIssueDto,
} from '#/api'
import { importKeys, unwrap } from './api'
import {
  conflictAction,
  effectiveCategoryId,
  willImport,
} from './commit-payload'
import type { PreviewChoices } from './commit-payload'
import { fixLineErrorMessage } from './errors'
import {
  conflictReasonFr,
  fileValuesOf,
  formatDate,
  issueSentence,
  plural,
} from './format'
import { LineFixForm } from './LineFixForm'
import type { LineValues } from './LineFixForm'
import {
  Amount,
  CategorySelect,
  ConflictChoice,
  ConflictCompare,
  ExistingMatch,
  FixedBadge,
  KindIcon,
  LINE_KIND,
  ManualMatchNote,
} from './preview-parts'
import type { LineKind } from './preview-parts'

interface PreviewRowsProps {
  detail: ImportDetailDto
  categories: CategoryDto[]
  choices: PreviewChoices
  onConflictChange: (lineNumber: number, action: ConflictAction) => void
  onCategoryChange: (lineNumber: number, categoryId: string) => void
  /** The preview checked again after a line was typed or put back (#433). */
  onDetail: (detail: ImportDetailDto) => void
}

/** A line typed in the preview being typed again, if any. */
type Editing = number | null

interface LineProps extends PreviewRowsProps {
  editing: Editing
  setEditing: (lineNumber: Editing) => void
}

const byLine = <T extends { lineNumber: number }>(a: T, b: T) =>
  a.lineNumber - b.lineNumber

/**
 * The lines of the file, what needs the owner first (#433, direction « À
 * faire d'abord »): numbered steps to type the unreadable lines, answer the
 * probable duplicates and check the new transactions, then the lines already
 * imported folded into one row. Nothing is written before « Valider ».
 */
export function PreviewRows(props: PreviewRowsProps) {
  const preview = props.detail.preview!
  const [editing, setEditing] = useState<Editing>(null)
  const lineProps: LineProps = { ...props, editing, setEditing }
  const issues = [...preview.issues].sort(byLine)
  const rows = [...preview.rows].sort(byLine)
  const conflicts = rows.filter((row) => row.status === 'conflict')
  const news = rows.filter((row) => row.status === 'new')
  const duplicates = rows.filter((row) => row.status === 'duplicate')

  const steps: { kind: LineKind; title: string; body: ReactNode }[] = []
  if (issues.length > 0) {
    steps.push({
      kind: 'invalid',
      title: `Corriger ${plural(issues.length, 'ligne illisible', 'lignes illisibles')}`,
      body: (
        <ul className="space-y-3">
          {issues.map((issue) => (
            <IssueCard key={issue.lineNumber} {...lineProps} issue={issue} />
          ))}
        </ul>
      ),
    })
  }
  if (conflicts.length > 0) {
    steps.push({
      kind: 'conflict',
      title: `Confirmer ${plural(conflicts.length, 'doublon probable', 'doublons probables')}`,
      body: (
        <ul className="space-y-3">
          {conflicts.map((row) => (
            <ConflictCard key={row.lineNumber} {...lineProps} row={row} />
          ))}
        </ul>
      ),
    })
  }
  if (news.length > 0) {
    steps.push({
      kind: 'new',
      title: `Vérifier ${plural(news.length, 'nouvelle opération', 'nouvelles opérations')}`,
      body: (
        <Card size="sm" className="py-0">
          <ul className="space-y-1">
            {news.map((row) => (
              <NewRow key={row.lineNumber} {...lineProps} row={row} />
            ))}
          </ul>
        </Card>
      ),
    })
  }

  return (
    <section aria-label="Opérations du fichier" className="space-y-5">
      {steps.length === 0 && (
        <Card size="sm">
          <CardContent className="text-muted-foreground text-center text-sm">
            Aucune nouvelle opération : toutes les lignes sont déjà
            enregistrées.
          </CardContent>
        </Card>
      )}
      {steps.map((step, index) => (
        <Step key={step.kind} number={index + 1} {...step} />
      ))}
      {duplicates.length > 0 && (
        <AlreadyStored {...lineProps} rows={duplicates} />
      )}
    </section>
  )
}

function Step({
  number,
  kind,
  title,
  body,
}: {
  number: number
  kind: LineKind
  title: string
  body: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="flex items-center gap-2 font-semibold">
        <span
          aria-hidden
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums',
            LINE_KIND[kind].solid,
          )}
        >
          {number}
        </span>
        {title}
      </h3>
      {body}
    </section>
  )
}

/** Step 1: an unreadable line, said in one sentence, and its form, always open. */
function IssueCard({
  issue,
  detail,
  onDetail,
}: LineProps & { issue: ParseIssueDto }) {
  return (
    <li data-testid={`line-${issue.lineNumber}`} className="min-w-0">
      <Card
        size="sm"
        className="bg-[color-mix(in_oklch,var(--destructive)_5%,var(--card))]"
      >
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-2 text-sm">
            <span className="text-destructive flex min-w-0 items-start gap-1.5 font-medium">
              <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span data-slot="issue-sentence">
                {issueSentence(issue).map((part, index) =>
                  typeof part === 'string' ? (
                    part
                  ) : (
                    <span key={index} className="font-mono">
                      {part.value}
                    </span>
                  ),
                )}
              </span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              Ligne {issue.lineNumber}
            </span>
          </div>
          {!issue.cells && (
            <p className="text-muted-foreground text-xs">
              La ligne n’a pas pu être découpée en colonnes : saisissez-la
              d’après le fichier.
            </p>
          )}
          <LineFixForm
            importId={detail.id}
            lineNumber={issue.lineNumber}
            initial={issue.draft}
            fileValues={fileValuesOf(issue)}
            onFixed={onDetail}
          />
          <p className="text-muted-foreground text-xs">
            Laissée de côté tant qu’elle n’est pas corrigée.
          </p>
        </CardContent>
      </Card>
    </li>
  )
}

function RowCategory({
  row,
  categories,
  choices,
  onCategoryChange,
}: LineProps & { row: ImportPreviewRowDto }) {
  return (
    <CategorySelect
      row={row}
      categories={categories}
      value={effectiveCategoryId(row, choices)}
      disabled={!willImport(row, choices)}
      onChange={(categoryId) => onCategoryChange(row.lineNumber, categoryId)}
    />
  )
}

/** Step 2: a probable duplicate, side by side with the stored one. */
function ConflictCard(props: LineProps & { row: ImportPreviewRowDto }) {
  const { row, choices, onConflictChange } = props
  const action = conflictAction(row, choices)
  const reason = conflictReasonFr(row.conflictReason)
  return (
    <li data-testid={`line-${row.lineNumber}`}>
      <Card
        size="sm"
        className="bg-[color-mix(in_oklch,var(--warning)_7%,var(--card))]"
      >
        <CardContent className="@container space-y-3">
          <div className="text-muted-foreground flex justify-between gap-2 text-xs">
            <span>{reason ?? 'Doublon probable'}</span>
            <span className="shrink-0 tabular-nums">
              Ligne {row.lineNumber}
            </span>
          </div>
          <ConflictCompare row={row} />
          <ConflictChoice
            row={row}
            value={action}
            onChange={(next) => onConflictChange(row.lineNumber, next)}
          />
          {action === 'import' ? (
            <RowCategory {...props} />
          ) : (
            <p className="text-muted-foreground text-xs">
              Pas importée : l’opération est déjà enregistrée.
            </p>
          )}
          {row.fixedFrom && <FixedActions {...props} />}
        </CardContent>
      </Card>
    </li>
  )
}

/** Step 3: a new transaction, with its category. */
function NewRow(props: LineProps & { row: ImportPreviewRowDto }) {
  const { row } = props
  return (
    <li
      data-testid={`line-${row.lineNumber}`}
      className="space-y-2 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <KindIcon kind="new" />
        <div className="min-w-[7rem] flex-1">
          <p className="truncate text-sm font-medium" title={row.rawLabel}>
            {row.rawLabel}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            <span className="tabular-nums">{formatDate(row.bookingDate)}</span>
            {row.merchant && ` · ${row.merchant}`}
          </p>
          <ManualMatchNote row={row} />
        </div>
        {row.fixedFrom && <FixedBadge />}
        <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-[9rem] sm:flex-none">
            <RowCategory {...props} />
          </div>
          <Amount
            cents={row.amountCents}
            className="text-right sm:min-w-[5rem]"
          />
        </div>
      </div>
      {row.fixedFrom && <FixedActions {...props} />}
    </li>
  )
}

function rowValues(row: ImportPreviewRowDto): LineValues {
  return {
    bookingDate: row.bookingDate,
    valueDate: row.valueDate,
    amountCents: row.amountCents,
    balanceAfterCents: row.balanceAfterCents,
    rawLabel: row.rawLabel,
  }
}

/**
 * A line typed in the preview: type it again, or leave it out again (it
 * goes back to the unreadable lines).
 */
function FixedActions(props: LineProps & { row: ImportPreviewRowDto }) {
  const { row, detail, onDetail, editing, setEditing } = props
  const queryClient = useQueryClient()
  const unfix = useMutation({
    mutationFn: () =>
      unwrap(
        importsControllerUnfixLine({
          path: { id: detail.id, lineNumber: row.lineNumber },
          throwOnError: false,
        }),
      ),
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: importKeys.imports })
      onDetail(next)
    },
  })
  if (editing === row.lineNumber) {
    return (
      <LineFixForm
        importId={detail.id}
        lineNumber={row.lineNumber}
        initial={rowValues(row)}
        onFixed={(next) => {
          setEditing(null)
          onDetail(next)
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground w-full text-xs sm:mr-auto sm:w-auto">
          Ligne {row.lineNumber} saisie à la main.
        </p>
        <Button
          size="sm"
          variant="secondary"
          outline
          disabled={unfix.isPending}
          onClick={() => setEditing(row.lineNumber)}
        >
          Modifier
        </Button>
        <Button
          size="sm"
          variant="secondary"
          outline
          loading={unfix.isPending}
          onClick={() => unfix.mutate()}
        >
          Ne pas importer
        </Button>
      </div>
      {unfix.isError && (
        <FieldError>{fixLineErrorMessage(unfix.error)}</FieldError>
      )}
    </div>
  )
}

/** The lines already imported, folded into one row. */
function AlreadyStored(props: LineProps & { rows: ImportPreviewRowDto[] }) {
  const { rows, detail } = props
  const [open, setOpen] = useState(false)
  const listId = useId()
  return (
    <div className="bg-muted/50 rounded-2xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm"
        onClick={() => setOpen(!open)}
      >
        <CopyCheckIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
        <span className="flex-1">
          {plural(
            rows.length,
            'ligne déjà dans vos opérations',
            'lignes déjà dans vos opérations',
          )}
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <ul id={listId} className="space-y-1 px-3">
          {rows.map((row) => (
            <li
              key={row.lineNumber}
              data-testid={`line-${row.lineNumber}`}
              className="space-y-1 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <KindIcon kind="duplicate" />
                <div className="min-w-[7rem] flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    title={row.rawLabel}
                  >
                    {row.rawLabel}
                  </p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {formatDate(row.bookingDate)} · ligne {row.lineNumber}
                  </p>
                </div>
                {row.fixedFrom && <FixedBadge />}
                <Amount cents={row.amountCents} className="ml-auto" />
              </div>
              {row.existing && (
                <ExistingMatch
                  existing={row.existing}
                  accountId={detail.accountId}
                />
              )}
              {row.fixedFrom && <FixedActions {...props} row={row} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
