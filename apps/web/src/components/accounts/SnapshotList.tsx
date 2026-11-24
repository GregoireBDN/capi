import { cn } from '@capi/ui'
import { PencilIcon } from 'lucide-react'
import type { SnapshotDto } from '#/api/types.gen'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { DIVIDED_LIST, ROW_BUTTON } from '#/lib/row-list'

interface SnapshotListProps {
  snapshots: SnapshotDto[]
  withContributions: boolean
  /** Opens the editor; absent when the account cannot be changed. */
  onEdit?: (snapshot: SnapshotDto) => void
  /**
   * The invested amount that counts at each snapshot date (#360): the
   * invested base, the linked transfers (#296) or what was typed. Shown in
   * place of what is typed on the snapshot; editing still shows that.
   */
  invested?: ReadonlyMap<string, number | null>
}

/** « Investi 13 800,00 € », or nothing when it is unknown. */
function investedText(
  snapshot: SnapshotDto,
  invested: number | null | undefined,
): string | null {
  const cents = invested ?? snapshot.contributionsCents
  return cents === null ? null : `Investi ${formatCents(cents)}`
}

function SnapshotDetails({
  snapshot,
  withContributions,
  invested,
}: {
  snapshot: SnapshotDto
  withContributions: boolean
  invested?: number | null
}) {
  const investedLine = withContributions
    ? investedText(snapshot, invested)
    : null
  return (
    // The amounts go under the date when both don't fit side by side.
    <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">
      <div className="min-w-[6rem] flex-1">
        <p className="font-medium whitespace-nowrap">
          {formatCalendarDate(snapshot.date)}
        </p>
        {snapshot.note && (
          <p className="text-muted-foreground text-xs break-words">
            {snapshot.note}
          </p>
        )}
        {/* A PEA's value from its lines (#413); crypto lists none. */}
        {snapshot.source === 'computed' && (
          <p className="text-muted-foreground text-xs">D’après vos lignes</p>
        )}
      </div>
      <div className="ml-auto text-right whitespace-nowrap">
        <p className="font-medium tabular-nums">
          {formatCents(snapshot.valueCents)}
        </p>
        {investedLine && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {investedLine}
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
  invested,
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
                  invested={invested?.get(snapshot.date)}
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
                  invested={invested?.get(snapshot.date)}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
