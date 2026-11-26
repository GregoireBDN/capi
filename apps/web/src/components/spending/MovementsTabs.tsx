import { cn, CountPill } from '@capi/ui'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRightIcon, ChartPieIcon } from 'lucide-react'
import { plural } from '#/lib/plural'
import { useKnownReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'

export type MovementsTab = 'summary' | 'operations'

const TABS = [
  {
    key: 'summary',
    to: ROUTES.spending,
    label: 'Résumé',
    icon: ChartPieIcon,
  },
  {
    key: 'operations',
    to: ROUTES.transactions,
    label: 'Opérations',
    icon: ArrowLeftRightIcon,
  },
] as const

/**
 * « Résumé · Opérations » (#498, with #434, the owner's choice: tabs right
 * under the month, part of the month bar): Mouvements and Opérations as two
 * tabs of one page, each its own URL, one tap between them both ways (they
 * were a « ⋮ » item and a breadcrumb, #393). Rendered by `MonthBarSlot` on
 * the routes that declare `staticData.movementsTab`, in the bar's colours,
 * the current tab underlined on the bar's own bottom line. The month shown
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
      {TABS.map(({ key, to, label, icon: Icon }) => {
        const active = key === current
        return (
          <Link
            key={key}
            to={to}
            search={search}
            aria-current={active ? 'page' : undefined}
            data-active={active || undefined}
            className={cn(
              '-mb-px flex h-11 min-w-0 items-center justify-center gap-2 border-b-2 text-[15px] font-medium whitespace-nowrap transition-colors outline-none',
              'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-inset',
              active
                ? 'border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            <Icon aria-hidden className="size-[18px] shrink-0" />
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
