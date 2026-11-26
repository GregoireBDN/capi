import { cn } from '@capi/ui'
import { useMatches } from '@tanstack/react-router'
import { useSetPageMonthSlot } from './page-actions'
import { MovementsTabs } from '#/components/spending/MovementsTabs'

/**
 * Where a month page's month goes (#401, the owner's « B. Barre du mois »,
 * then « barre d'outils + état », #505): hollow bars at the top of the page,
 * above its title, scrolling with it, not part of the header (the owner,
 * #505). `MonthNavigator` renders into it through a portal. A month
 * page's route declares `staticData.monthBar`, so the bar's room is kept
 * from the first render until its month is in (`data-month-placeholder`,
 * hidden by `globals.css` then): nothing moves on load. On Mouvements
 * and Opérations, the two tabs « Résumé · Opérations » come first
 * (#498, `staticData.movementsTab`): before the month in the same bar
 * on a computer, a bar of their own above it on a phone (#505).
 */
export function MonthBarSlot() {
  const setMonthSlot = useSetPageMonthSlot()
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
      // Shown on a month page only: once its month is in, or keeping its
      // room until then. Not part of the header (the owner, #505): the
      // toolbar's bars are the top of the page, above its title, and
      // scroll with it.
      className="relative z-10 hidden shrink-0 has-[[data-month-placeholder]]:block has-[[data-page-month]:not(:empty)]:block"
    >
      {/* The month's toolbar (#505, the owner's « barre d'outils + état »),
          as wide as the page's content: two hollow bars, the page's tabs then
          ‹ · the month · ›, side by side on a computer (the month with its
          state), one under the other on a phone (without it: too much room,
          the owner). A gap tells « which page » from « which month », not a
          line. */}
      <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
        <div
          data-slot="month-toolbar-bar"
          className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3"
        >
          {tabs && (
            <div className={cn(BAR, 'md:w-[15rem] md:shrink-0')}>
              <MovementsTabs current={tabs.current} month={tabs.month} />
            </div>
          )}
          <div className={cn(BAR, 'md:min-w-0 md:flex-1')}>
            <div
              ref={setMonthSlot}
              data-page-month
              className="@container flex h-[calc(2rem-8px)] items-center empty:hidden"
            />
            {monthPage && (
              <div
                data-month-placeholder
                aria-hidden
                className="h-[calc(2rem-8px)]"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** A hollow bar like a field (`glass-field`, the fields' « B · Creusé »),
 * 44px high with its 36px buttons in relief on it (the owner, #505). */
const BAR = 'glass-field rounded-full p-[4px]'
