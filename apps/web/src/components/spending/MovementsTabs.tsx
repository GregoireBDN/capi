import { CountPill, NavTabs, NavTabsLink } from '@capi/ui'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRightIcon, ChartPieIcon } from 'lucide-react'
import { plural } from '#/lib/plural'
import { useKnownReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'
import { ALL_MONTHS } from '#/components/transactions/search'

/**
 * « Résumé · Opérations » (#498, with #434): Mouvements and Opérations as
 * two tabs of one page, each its own URL, one tap between them both ways
 * (they were a « ⋮ » item and a breadcrumb, #393). The month shown is
 * carried (none from « Toutes les dates »); « Opérations » carries the
 * number of transactions to review, as the sidebar's « Mouvements » does.
 */
export function MovementsTabs({
  current,
  month,
}: {
  current: 'summary' | 'operations'
  /** The month in the URL (`YYYY-MM`, `all`), if any. */
  month?: string
}) {
  const reviewCount = useKnownReviewCount()
  const search = month && month !== ALL_MONTHS ? { month } : {}
  return (
    <NavTabs aria-label="Mouvements" data-slot="movements-tabs">
      <NavTabsLink asChild active={current === 'summary'}>
        <Link to={ROUTES.spending} search={search}>
          <ChartPieIcon aria-hidden />
          Résumé
        </Link>
      </NavTabsLink>
      <NavTabsLink asChild active={current === 'operations'}>
        <Link to={ROUTES.transactions} search={search}>
          <ArrowLeftRightIcon aria-hidden />
          Opérations
          {reviewCount !== null && reviewCount > 0 && (
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
      </NavTabsLink>
    </NavTabs>
  )
}
