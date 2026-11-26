import { cn } from '@capi/ui'
import { useMatches } from '@tanstack/react-router'
import { useSetPageMonthSlot } from './page-actions'
import { MovementsTabs } from '#/components/spending/MovementsTabs'

/**
 * Where a month page's month goes (#401, the owner's « B. Barre du mois »,
 * then « barre d'outils + état », #505): white bars at the top of the page,
 * above its title, scrolling with it, not part of the header (the owner,
 * #505). `MonthNavigator` renders into it through a portal. A month
 * page's route declares `staticData.monthBar`, so the bar's room is kept
 * from the first render until its month is in (`data-month-placeholder`,
 * hidden by `globals.css` then): nothing moves on load. On Mouvements
 * and Opérations, the two tabs « Résumé · Opérations » come first
 * (#498, `staticData.movementsTab`): before the month in the same white bar
 * on a computer, a white bar of their own above it on a phone (#505).
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
      // toolbar's white bars are the top of the page, above its title, and
      // scroll with it.
      className="relative z-10 hidden shrink-0 has-[[data-month-placeholder]]:block has-[[data-page-month]:not(:empty)]:block"
    >
      {/* The month's toolbar (#505, the owner's « barre d'outils + état »),
          as wide as the page's content: on a computer one white bar, the
          tabs, then ‹ · the month and its state · ›; on a phone the tabs and
          the month each a white bar of their own, the month without its
          state (too much room, the owner). */}
      <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
        <div
          data-slot="month-toolbar-bar"
          className={cn(
            'flex flex-col gap-2',
            'md:flex-row md:items-center md:gap-1.5',
            'md:bg-card md:rounded-full md:p-[4px] md:shadow-[var(--glass-edge),var(--glass-shadow-md)] md:dark:bg-[oklch(from_var(--card)_calc(l+0.04)_c_h)]',
          )}
        >
          {tabs && (
            <div className={cn(BAR, PHONE_ONLY, 'md:flex md:items-center')}>
              <MovementsTabs current={tabs.current} month={tabs.month} />
              <span
                aria-hidden
                className="bg-foreground/10 mr-0.5 ml-2 hidden h-6 w-px md:block"
              />
            </div>
          )}
          <div className={cn(BAR, PHONE_ONLY, 'md:min-w-0 md:flex-1')}>
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

/** A white bar with the sheen and a soft shadow, 44px high with its 36px
 * buttons. */
const BAR =
  'bg-card rounded-full p-[4px] shadow-[var(--glass-edge),var(--glass-shadow-md)] dark:bg-[oklch(from_var(--card)_calc(l+0.04)_c_h)]'

/** Undoes `BAR` from `md` up, where the whole toolbar is one bar. */
const PHONE_ONLY =
  'md:rounded-none md:bg-transparent md:p-0 md:shadow-none md:dark:bg-transparent'
