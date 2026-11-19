import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from '@finances/ui'
import { PencilIcon } from 'lucide-react'
import type { SnapshotDto } from '#/api/types.gen'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { DIVIDED_LIST, ROW_BUTTON } from '#/lib/row-list'

interface SnapshotListProps {
  snapshots: SnapshotDto[]
  withContributions: boolean
  /** Opens the editor; absent when the account cannot be changed. */
  onEdit?: (snapshot: SnapshotDto) => void
  /**
   * Contributions from the linked transfers by snapshot date (#296), shown
   * where none is typed; editing still shows what was typed.
   */
  linkedContributions?: ReadonlyMap<string, number | null>
  /** What the linked contributions come from: `virements`, `retraits`. */
  linkedSource?: string
}

function contributionsText(
  snapshot: SnapshotDto,
  linked: number | null | undefined,
  source: string,
): string {
  if (snapshot.contributionsCents !== null) {
    return `Versé ${formatCents(snapshot.contributionsCents)}`
  }
  return linked == null
    ? 'Versements inconnus'
    : `Versé ${formatCents(linked)} · ${source}`
}

function SnapshotDetails({
  snapshot,
  withContributions,
  linked,
  linkedSource = 'virements',
}: {
  snapshot: SnapshotDto
  withContributions: boolean
  linked?: number | null
  linkedSource?: string
}) {
  return (
    // The amounts go under the date when both don't fit side by side.
    <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">
      <div className="min-w-[7rem] flex-1">
        <p className="font-medium whitespace-nowrap">
          {formatCalendarDate(snapshot.date)}
        </p>
        {snapshot.note && (
          <p className="text-muted-foreground text-xs break-words">
            {snapshot.note}
          </p>
        )}
      </div>
      <div className="ml-auto text-right whitespace-nowrap">
        <p className="font-medium tabular-nums">
          {formatCents(snapshot.valueCents)}
        </p>
        {withContributions && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {contributionsText(snapshot, linked, linkedSource)}
          </p>
        )}
      </div>
    </div>
  )
}

/** Snapshots newest first; a tap opens one for correction. */
export function SnapshotRows({
  snapshots,
  withContributions,
  onEdit,
  linkedContributions,
  linkedSource,
  label = 'Valeurs enregistrées',
  editLabel = 'Modifier la valeur du',
}: SnapshotListProps & {
  /** Accessible name of the list. */
  label?: string
  /** Start of each row's accessible name, before its date. */
  editLabel?: string
}) {
  const newestFirst = [...snapshots].reverse()
  return (
    <ul className={DIVIDED_LIST} aria-label={label}>
      {newestFirst.map((snapshot) => {
        const row = 'flex items-center gap-3 px-2 py-2.5 text-left text-sm'
        return (
          <li key={snapshot.id}>
            {onEdit ? (
              <button
                type="button"
                aria-label={`${editLabel} ${formatCalendarDate(snapshot.date)}`}
                onClick={() => onEdit(snapshot)}
                className={cn(ROW_BUTTON, row)}
              >
                <SnapshotDetails
                  snapshot={snapshot}
                  withContributions={withContributions}
                  linked={linkedContributions?.get(snapshot.date)}
                  linkedSource={linkedSource}
                />
                <PencilIcon
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
              </button>
            ) : (
              <div className={row}>
                <SnapshotDetails
                  snapshot={snapshot}
                  withContributions={withContributions}
                  linked={linkedContributions?.get(snapshot.date)}
                  linkedSource={linkedSource}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Every snapshot, newest first; a tap opens it for correction. */
export function SnapshotList({
  snapshots,
  withContributions,
  onEdit,
  linkedContributions,
  linkedSource,
}: SnapshotListProps) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Valeurs</CardTitle>
        <CardDescription>
          {snapshots.length === 0
            ? 'Aucune valeur enregistrée.'
            : plural(
                snapshots.length,
                'valeur enregistrée',
                'valeurs enregistrées',
              )}
        </CardDescription>
      </CardHeader>
      {snapshots.length > 0 && (
        <CardContent>
          <SnapshotRows
            snapshots={snapshots}
            withContributions={withContributions}
            onEdit={onEdit}
            linkedContributions={linkedContributions}
            linkedSource={linkedSource}
          />
        </CardContent>
      )}
    </Card>
  )
}
