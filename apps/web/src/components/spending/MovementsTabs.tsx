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
 * « Résumé · Opérations » (#498, with #434, the owner's choice: folder
 * tabs right above the month, part of the glass month bar, the current one
 * a rounded tab in light blue opening onto the month's band, no line): Mouvements and Opérations as two
 * tabs of one page, each its own URL, one tap between them both ways (they
 * were a « ⋮ » item and a breadcrumb, #393). Rendered by `MonthBarSlot` on
 * the routes that declare `staticData.movementsTab`, in the bar's colours. The month shown
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
      // The app's segmented control (#506) made of links (#505, the owner:
      // « dans le design system »): a glass track, the current page a raised
      // white segment, two equal halves of the page's width.
      // On a computer, the current page in the light blue pill of the menu's
      // current page (the owner, #505), no track.
      className="bg-glass-fill rounded-control md:gap-1.5 grid grid-cols-2 gap-0.5 p-[3px] md:bg-transparent md:p-0"
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
              'relative flex h-[calc(2rem-6px)] md:h-[calc(2rem-4px)] md:rounded-control min-w-0 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-3px)] text-sm font-medium whitespace-nowrap no-underline transition-[color,background-color,box-shadow] outline-none pointer-coarse:touch-hitbox',
              'focus-visible:ring-ring/85 focus-visible:ring-[3px]',
              active
                ? 'bg-card text-foreground font-semibold shadow-[var(--glass-edge),var(--glass-shadow-sm)] dark:bg-[oklch(from_var(--card)_calc(l+0.06)_c_h)] md:bg-month-band md:shadow-none md:dark:bg-month-band'
                : 'text-glass-muted-foreground hover:text-foreground',
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
