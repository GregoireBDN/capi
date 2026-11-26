import { cn, CountPill } from '@capi/ui'
import { Link } from '@tanstack/react-router'
import { plural } from '#/lib/plural'
import { useKnownReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'

export type MovementsTab = 'summary' | 'operations'

const TABS = [
  {
    key: 'summary',
    to: ROUTES.spending,
    label: 'Résumé',
  },
  {
    key: 'operations',
    to: ROUTES.transactions,
    label: 'Opérations',
  },
] as const

/**
 * « Résumé · Opérations » (#498, with #434, the owner's choice: compact
 * tabs right above the month, part of the glass month bar): Mouvements and Opérations as two
 * tabs of one page, each its own URL, one tap between them both ways (they
 * were a « ⋮ » item and a breadcrumb, #393). Rendered by `MonthBarSlot` on
 * the routes that declare `staticData.movementsTab`, in the bar's colours,
 * the current tab underlined. The month shown
 * is carried (none from « Toutes les dates »); « Opérations » carries the
 * number of transactions to review, as the sidebar's « Mouvements » does.
 */
export function MovementsTabs({
  current,
  month,
}: {
  current: MovementsTab
  /** The month in the URL (`YYYY-MM`, `all`), if any. */
  month?: string
}) {
  const reviewCount = useKnownReviewCount()
  const search = month && month !== 'all' ? { month } : {}
  return (
    <nav
      aria-label="Mouvements"
      data-slot="movements-tabs"
      className="grid grid-cols-2"
    >
      {TABS.map(({ key, to, label }) => {
        const active = key === current
        return (
          <Link
            key={key}
            to={to}
            search={search}
            aria-current={active ? 'page' : undefined}
            data-active={active || undefined}
            className={cn(
              'relative flex h-10 min-w-0 border-b-2 items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-colors outline-none',
              'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-inset',
              active
                ? 'border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {label}
            {key === 'operations' &&
              reviewCount !== null &&
              reviewCount > 0 && (
                <CountPill
                  value={reviewCount}
                  label={plural(
                    reviewCount,
                    'opération à revoir',
                    'opérations à revoir',
                  )}
                />
              )}
          </Link>
        )
      })}
    </nav>
  )
}
