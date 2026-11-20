import { Card, CardContent, Skeleton } from '@finances/ui'
import { DashboardCardHeader } from '#/components/dashboard/DashboardCardHeader'

/*
 * First-load placeholders of the crypto pages (#381): one per card, shaped
 * like it (its title already written, a total line and a bar, rows of a
 * badge and two lines), shown only while nothing is in the cache. Once the
 * stored data is there, the cards stay and only what changes says so.
 */

/** A list row: a 32px badge, two lines, a value at the end. */
export function RowSkeleton() {
  return (
    <div className="flex min-h-11 items-center gap-3 px-2 py-2">
      <Skeleton className="hidden size-[32px] shrink-0 rounded-full @[12rem]:block" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-4 w-16 shrink-0" />
    </div>
  )
}

/** A card of rows under its title. */
export function RowsCardSkeleton({
  title,
  rows = 3,
  action = false,
}: {
  title: string
  rows?: number
  /** A full-width button closes the card. */
  action?: boolean
}) {
  return (
    <Card className="min-w-0" aria-hidden>
      <DashboardCardHeader title={title} />
      <CardContent className="@container space-y-3">
        <div className="space-y-0.5">
          {Array.from({ length: rows }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
        {action && <Skeleton className="h-11 w-full rounded-lg" />}
      </CardContent>
    </Card>
  )
}

/** A value card: its label, the figure, a line under it, a status, a bar. */
export function ValueCardSkeleton({
  label,
  bar = true,
}: {
  label: string
  bar?: boolean
}) {
  return (
    <Card className="min-w-0" aria-hidden>
      <CardContent className="space-y-4 pt-5">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">{label}</p>
          <Skeleton className="h-[2.8rem] w-48 max-w-full" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-4 w-44 max-w-full" />
        {bar && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** The Crypto page before its first answer. */
export function PortfolioSkeleton() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-busy="true"
      aria-label="Chargement de vos cryptos"
    >
      <ValueCardSkeleton label="Valeur de vos cryptos" />
      <RowsCardSkeleton title="Actifs" rows={3} />
      <RowsCardSkeleton title="Où sont mes cryptos" rows={2} action />
    </div>
  )
}
