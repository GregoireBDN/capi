import { cn } from '@capi/ui'
import { useMatches } from '@tanstack/react-router'
import { useSetPageMonthSlot } from './page-actions'
import { MovementsTabs } from '#/components/spending/MovementsTabs'
import { useAppEnvironment } from '#/lib/app-environment'

/**
 * Where a month page's month goes (#401, the owner's « B. Barre du mois »,
 * then « dans l'interface, pas dans le header » on a computer): a bar at
 * the top of the page's column, in the header's colours, out of the
 * scrolling area like the header (#418), on every width (beside the sidebar from
 * `md` up). `MonthNavigator` renders into it through a portal. A month
 * page's route declares `staticData.monthBar`, so the bar's room is kept
 * from the first render until its month is in (`data-month-placeholder`,
 * hidden by `globals.css` then): nothing moves on load. On Mouvements
 * and Opérations, the two tabs « Résumé · Opérations » come above the month
 * in the same bar (#498, `staticData.movementsTab`), folder tabs opening onto
 * the month in their light blue. The bar is glass, one block with the
 * header, no line anywhere (#434, the owner's choices).
 */
export function MonthBarSlot() {
  const setMonthSlot = useSetPageMonthSlot()
  // On staging the bar is yellow like the header, its tab and month band a
  // pale yellow, so the two stay one block (#504).
  const staging = useAppEnvironment() === 'staging'
  const monthPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.monthBar),
  })
  // Mouvements' two tabs above its month (#498), with the month in the URL.
  const tabs = useMatches({
    select: (matches) => {
      const match = matches.find((m) => m.staticData.movementsTab)
      if (!match?.staticData.movementsTab) return null
      const search = match.search as { month?: unknown }
      return {
        current: match.staticData.movementsTab,
        month: typeof search.month === 'string' ? search.month : undefined,
      }
    },
  })
  return (
    <div
      data-month-bar={monthPage || undefined}
      className={cn(
        // Shown on a month page only: once its month is in, or keeping its
        // room until then. Glass chrome (#434, #504): the header's colour and
        // blur, a shadow below instead of a line, one block with the header.
        // Above the header from `md` up, where its tabs rise into the
        // header's row (`MovementsTabs`, #505).
        'glass-chrome relative z-10 hidden shrink-0 md:has-[[data-slot=movements-tabs]]:z-30 has-[[data-month-placeholder]]:block has-[[data-page-month]:not(:empty)]:block',
        staging && 'env-banner',
      )}
    >
      {tabs && (
        // On a computer the tabs start where the band starts (the owner,
        // #505).
        <div className="mx-auto w-full max-w-5xl px-2 sm:px-4 md:max-w-none md:px-0">
          <MovementsTabs current={tabs.current} month={tabs.month} />
        </div>
      )}
      {/* Under the tabs, the month is in the current tab's tint: the tab
          opens onto it like a folder's (#434). */}
      <div className={cn(tabs && 'bg-month-band')}>
        {/* The bar fills the page's column, as wide as its content. */}
        <div
          ref={setMonthSlot}
          data-page-month
          className="@container mx-auto flex h-12 w-full max-w-5xl items-center px-2 empty:hidden sm:px-4"
        />
        {monthPage && (
          <div data-month-placeholder aria-hidden className="h-12" />
        )}
      </div>
    </div>
  )
}
