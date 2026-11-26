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
 * the current one a key in the primary colour): Mouvements and Opérations as two
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
      // On the month's white bar (#505, the owner's « piste 4 »), two equal
      // halves: the current page a key in the primary colour (`glass-key`),
      // the other flat in the text's colour, tinted on hover.
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
              'relative flex h-[calc(2rem+4px)] md:h-[calc(2rem-8px)] min-w-0 items-center justify-center gap-2 rounded-full text-sm leading-none font-medium whitespace-nowrap no-underline transition-[color,background-color] outline-none pointer-coarse:touch-hitbox',
              'focus-visible:ring-ring/85 focus-visible:ring-[3px]',
              active
                ? 'glass-key font-semibold'
                : 'text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground',
            )}
          >
            {/* The label alone is centred in its half, as « Résumé » is; the
                count is a small badge on its top right corner on a phone,
                beside it on a computer (the owner, #505). */}
            <span className="relative">
              {label}
              {key === 'operations' &&
                reviewCount !== null &&
                reviewCount > 0 && (
                  <CountPill
                    // A round disc, not a tag (the owner, #434), like a
                    // notification on a phone, on the label's capitals on a
                    // computer.
                    className="absolute bottom-[calc(100%-0.45em)] left-[calc(100%-0.1em)] h-[18px] min-w-[18px] px-0.5 text-[10px] tabular-nums md:top-1/2 md:bottom-auto md:left-full md:ml-1.5 md:h-[20px] md:min-w-[20px] md:-translate-y-[calc(50%+1px)] md:px-0 md:text-[11px] [&>span]:[text-box:trim-both_cap_alphabetic]"
                    value={reviewCount}
                    label={plural(
                      reviewCount,
                      'opération à revoir',
                      'opérations à revoir',
                    )}
                  />
                )}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
