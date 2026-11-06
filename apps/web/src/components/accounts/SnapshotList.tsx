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

interface SnapshotListProps {
  snapshots: SnapshotDto[]
  withContributions: boolean
  /** Opens the editor; absent when the account cannot be changed. */
  onEdit?: (snapshot: SnapshotDto) => void
}

function SnapshotDetails({
  snapshot,
  withContributions,
}: {
  snapshot: SnapshotDto
  withContributions: boolean
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{formatCalendarDate(snapshot.date)}</p>
        {snapshot.note && (
          <p className="text-muted-foreground text-xs break-words">
            {snapshot.note}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-medium tabular-nums">
          {formatCents(snapshot.valueCents)}
        </p>
        {withContributions && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {snapshot.contributionsCents === null
              ? 'Versements inconnus'
              : `Versé ${formatCents(snapshot.contributionsCents)}`}
          </p>
        )}
      </div>
    </>
  )
}

/** Every snapshot, newest first; a tap opens it for correction. */
export function SnapshotList({
  snapshots,
  withContributions,
  onEdit,
}: SnapshotListProps) {
  const newestFirst = [...snapshots].reverse()
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
          <ul className="divide-y" aria-label="Valeurs enregistrées">
            {newestFirst.map((snapshot) => {
              const row = 'flex items-center gap-3 py-2.5 text-left text-sm'
              return (
                <li key={snapshot.id}>
                  {onEdit ? (
                    <button
                      type="button"
                      aria-label={`Modifier la valeur du ${formatCalendarDate(snapshot.date)}`}
                      onClick={() => onEdit(snapshot)}
                      className={cn(
                        row,
                        'hover:bg-muted/50 focus-visible:ring-ring -mx-2 w-[calc(100%+1rem)] rounded-md px-2 outline-none focus-visible:ring-2',
                      )}
                    >
                      <SnapshotDetails
                        snapshot={snapshot}
                        withContributions={withContributions}
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
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
