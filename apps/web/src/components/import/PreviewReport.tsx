import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  cn,
} from '@capi/ui'
import {
  CircleCheckIcon,
  Columns3Icon,
  CopyIcon,
  InfoIcon,
  NotebookPenIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type {
  ContinuityGapDto,
  ContinuityReportDto,
  ImportDetailDto,
  ImportPreviewDto,
} from '#/api'
import { formatCents } from '#/lib/money'
import {
  formatDate,
  formatDateTime,
  formatPeriod,
  plural,
  sourceLabel,
} from './format'
import { LINE_KIND } from './preview-parts'
import type { LineKind } from './preview-parts'

const TILES: {
  kind: LineKind
  title: string
  hint: string
  count: (counts: ImportDetailDto['counts']) => number
}[] = [
  {
    kind: 'invalid',
    title: 'À corriger',
    hint: 'illisibles',
    count: (c) => c.issues,
  },
  {
    kind: 'conflict',
    title: 'À confirmer',
    hint: 'doublons',
    count: (c) => c.conflicts,
  },
  {
    kind: 'new',
    title: 'Nouvelles',
    hint: 'à importer',
    count: (c) => c.new,
  },
  {
    kind: 'duplicate',
    title: 'Déjà là',
    hint: 'ignorées',
    count: (c) => c.duplicates,
  },
]

/** One of the four counts of a preview (#433), tinted when it asks for action. */
function CountTile({
  kind,
  title,
  hint,
  value,
}: {
  kind: LineKind
  title: string
  hint: string
  value: number
}) {
  const { icon: Icon, tint, text } = LINE_KIND[kind]
  // Nothing to correct or confirm: the tile steps back.
  const idle = value === 0 && kind !== 'new'
  return (
    <li
      className={cn(
        '@container min-w-0 rounded-xl px-3 py-2',
        idle ? 'bg-muted/50' : tint,
      )}
    >
      {/* Narrow tiles (phones) stack the title under the count. */}
      <div className="flex flex-col gap-1 @[180px]:flex-row @[180px]:items-center @[180px]:gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-full',
              idle
                ? 'bg-muted text-muted-foreground/70'
                : cn('bg-background/70', text),
            )}
          >
            <Icon className="size-5" />
          </span>
          <p
            data-slot="count"
            className={cn(
              'text-xl leading-none font-semibold tabular-nums',
              idle && 'text-muted-foreground',
            )}
          >
            {value}
          </p>
        </div>
        <div className="min-w-0 leading-tight">
          <p
            className={cn(
              'truncate text-sm font-medium break-normal',
              idle ? 'text-muted-foreground' : text,
            )}
          >
            {title}
          </p>
          <p className="text-muted-foreground truncate text-xs">{hint}</p>
        </div>
      </div>
    </li>
  )
}

export function PreviewSummary({ detail }: { detail: ImportDetailDto }) {
  const { counts } = detail
  return (
    <section aria-label="Résumé" className="space-y-3">
      <Card size="sm">
        <CardContent className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p
            className="min-w-0 truncate text-sm font-medium"
            title={detail.fileName}
          >
            {detail.fileName}
          </p>
          <p className="text-muted-foreground text-sm">
            {detail.accountName} · {sourceLabel(detail)} ·{' '}
            {plural(counts.rows, 'ligne')}{' '}
            {formatPeriod(detail.periodStart, detail.periodEnd)}
          </p>
        </CardContent>
      </Card>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {TILES.map((tile) => (
          <CountTile
            key={tile.kind}
            kind={tile.kind}
            title={tile.title}
            hint={tile.hint}
            value={tile.count(counts)}
          />
        ))}
      </ul>
    </section>
  )
}

export function AlreadyImportedBanner({ detail }: { detail: ImportDetailDto }) {
  if (!detail.alreadyImported) return null
  return (
    <Alert variant="warning">
      <CopyIcon />
      <AlertTitle>Fichier déjà importé</AlertTitle>
      <AlertDescription>
        Ce fichier a déjà été importé sur ce compte le{' '}
        {formatDateTime(detail.alreadyImported.committedAt)}. Les opérations
        déjà enregistrées sont reconnues comme doublons et ne seront pas
        ajoutées une seconde fois.
      </AlertDescription>
    </Alert>
  )
}

function gapText(gap: ContinuityGapDto): string {
  const where = gap.fromDate
    ? `Entre le ${formatDate(gap.fromDate)} et le ${formatDate(gap.toDate)}`
    : `Le ${formatDate(gap.toDate)}`
  const diff = gap.actualCents - gap.expectedCents
  return `${where} (ligne ${gap.lineNumber}) : solde attendu ${formatCents(gap.expectedCents)}, solde du fichier ${formatCents(gap.actualCents)} (écart ${formatCents(diff)}).`
}

export function ContinuityPanel({ report }: { report: ContinuityReportDto }) {
  if (!report.checked) {
    return (
      <Alert>
        <InfoIcon />
        <AlertTitle>Soldes non vérifiés</AlertTitle>
        <AlertDescription>
          Le fichier ne contient pas assez de soldes pour vérifier qu’aucune
          opération ne manque.
        </AlertDescription>
      </Alert>
    )
  }
  if (report.ok) {
    return (
      <Alert variant="success">
        <CircleCheckIcon />
        <AlertTitle>Soldes cohérents</AlertTitle>
        <AlertDescription>
          Chaque solde suit le précédent : aucune opération ne semble manquer.
        </AlertDescription>
      </Alert>
    )
  }
  const opening = report.openingMismatch
  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>Des opérations semblent manquer</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {opening && (
            <li>
              Le premier solde du fichier ({formatDate(opening.toDate)}) ne suit
              pas le solde déjà enregistré : attendu{' '}
              {formatCents(opening.expectedCents)}, trouvé{' '}
              {formatCents(opening.actualCents)}.
            </li>
          )}
          {report.gaps.map((gap) => (
            <li key={`${gap.lineNumber}-${gap.toDate}`}>{gapText(gap)}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

/** Columns of the file its format does not read (#431): listed, never imported. */
export function IgnoredColumnsPanel({ columns }: { columns: string[] }) {
  if (columns.length === 0) return null
  return (
    <Alert>
      <Columns3Icon />
      <AlertTitle>
        {plural(columns.length, 'colonne ignorée', 'colonnes ignorées')}
      </AlertTitle>
      <AlertDescription>
        <p>
          Ces colonnes du fichier ne sont pas lues :{' '}
          {columns.map((name) => `« ${name} »`).join(', ')}.
        </p>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Expenses noted by hand during the month: how many the file replaces, and
 * the ones it should have replaced but did not (flagged for review).
 */
export function ManualExpensesPanel({
  preview,
}: {
  preview: ImportPreviewDto
}) {
  const matched = preview.rows.filter((row) => row.manualMatch).length
  const unmatched = preview.unmatchedManual
  if (matched === 0 && unmatched.length === 0) return null
  return (
    <Alert variant={unmatched.length > 0 ? 'warning' : 'default'}>
      <NotebookPenIcon />
      <AlertTitle>Dépenses notées à la main</AlertTitle>
      <AlertDescription>
        {matched > 0 && (
          <p>
            {plural(matched, 'dépense retrouvée', 'dépenses retrouvées')} dans
            le relevé : remplacée{matched > 1 ? 's' : ''} par l’opération de la
            banque, en gardant catégorie et note.
          </p>
        )}
        {unmatched.length > 0 && (
          <>
            <p>
              Sans opération correspondante, gardée
              {unmatched.length > 1 ? 's' : ''} et marquée
              {unmatched.length > 1 ? 's' : ''} à revoir :
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {unmatched.map((expense) => (
                <li key={expense.id}>
                  {formatDate(expense.bookingDate)} · {expense.rawLabel} ·{' '}
                  <span className="whitespace-nowrap tabular-nums">
                    {formatCents(-expense.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}
