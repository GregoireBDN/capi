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
 * « Résumé · Opérations » (#498, then #505: pills on the month's toolbar,
 * before the month on a computer, a bar of their own above it on a phone,
 * the current one raised on a hollow bar): Mouvements and Opérations as two
 * tabs of one page, each its own URL, one tap between them both ways (they
 * were a « ⋮ » item and a breadcrumb, #393). Rendered by `MonthBarSlot` on
 * the routes that declare `staticData.movementsTab`. The month shown
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
      // On the month's hollow bar (#505, the owner), two equal halves: the
      // current page a key in relief (`glass-raised`), the other flat in the
      // text's colour, tinted on hover, so it reads as a choice.
      className="grid grid-cols-2 gap-1"
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
              'relative flex h-[calc(2rem-8px)] min-w-0 items-center justify-center gap-2 rounded-full text-sm leading-none font-medium whitespace-nowrap no-underline transition-[color,background-color] outline-none pointer-coarse:touch-hitbox',
              'focus-visible:ring-ring/85 focus-visible:ring-[3px]',
              active
                ? 'glass-raised text-foreground font-semibold'
                : 'text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground',
            )}
          >
            {label}
            {key === 'operations' &&
              reviewCount !== null &&
              reviewCount > 0 && (
                <CountPill
                  // A round disc, not a tag (the owner, #434).
                  className="h-[20px] min-w-[20px] px-0 text-[11px] normal-nums [&>span]:[text-box:trim-both_cap_alphabetic]"
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
