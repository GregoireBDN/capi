import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  cn,
} from '@finances/ui'
import {
  CircleCheckIcon,
  CopyIcon,
  FileWarningIcon,
  InfoIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type {
  ContinuityGapDto,
  ContinuityReportDto,
  ImportDetailDto,
  ParseIssueDto,
} from '#/api'
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatPeriod,
  parseIssueFr,
  plural,
} from './format'

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: 'success' | 'warning' | 'muted' | 'danger'
}) {
  return (
    <Card size="sm">
      <CardContent className="mb-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={cn(
            'text-lg leading-tight font-semibold tabular-nums',
            tone === 'success' && 'text-success-foreground dark:text-success',
            tone === 'warning' && 'text-warning-foreground dark:text-warning',
            tone === 'danger' && 'text-destructive',
            tone === 'muted' && 'text-muted-foreground',
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

export function PreviewSummary({ detail }: { detail: ImportDetailDto }) {
  const { counts } = detail
  return (
    <section aria-label="Résumé" className="space-y-3">
      <Card size="sm">
        <CardContent className="mb-0 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p
            className="min-w-0 truncate text-sm font-medium"
            title={detail.fileName}
          >
            {detail.fileName}
          </p>
          <p className="text-muted-foreground text-sm">
            {detail.accountName} · {plural(counts.rows, 'ligne')}{' '}
            {formatPeriod(detail.periodStart, detail.periodEnd)}
          </p>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Nouvelles" value={counts.new} tone="success" />
        <SummaryCard label="Doublons" value={counts.duplicates} tone="muted" />
        <SummaryCard
          label="À confirmer"
          value={counts.conflicts}
          tone={counts.conflicts > 0 ? 'warning' : 'muted'}
        />
        <SummaryCard
          label="Lignes illisibles"
          value={counts.issues}
          tone={counts.issues > 0 ? 'danger' : 'muted'}
        />
      </div>
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

export function ParseIssuesPanel({ issues }: { issues: ParseIssueDto[] }) {
  if (issues.length === 0) return null
  return (
    <Alert variant="destructive">
      <FileWarningIcon />
      <AlertTitle>
        {plural(issues.length, 'ligne ignorée', 'lignes ignorées')}
      </AlertTitle>
      <AlertDescription>
        <p>Ces lignes n’ont pas pu être lues et ne seront pas importées :</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {issues.map((issue) => (
            <li key={issue.lineNumber}>
              Ligne {issue.lineNumber} : {parseIssueFr(issue.message)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
