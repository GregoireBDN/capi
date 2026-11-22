import { useMatches } from '@tanstack/react-router'
import { useSetPageMonthSlot } from './page-actions'

/**
 * Where a month page's month goes (#401, the owner's « B. Barre du mois »,
 * then « dans l'interface, pas dans le header » on a computer): a bar at
 * the top of the page's column, in the header's colours, out of the
 * scrolling area like the header (#418), on every width (beside the sidebar from
 * `md` up). `MonthNavigator` renders into it through a portal. A month
 * page's route declares `staticData.monthBar`, so the bar's room is kept
 * from the first render until its month is in (`data-month-placeholder`,
 * hidden by `globals.css` then): nothing moves on load.
 */
export function MonthBarSlot() {
  const setMonthSlot = useSetPageMonthSlot()
  const monthPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.monthBar),
  })
  return (
    <div
      className={
        // Shown on a month page only: once its month is in, or keeping its
        // room until then.
        'z-10 hidden shrink-0 border-b bg-(--header-bg) backdrop-blur-lg has-[[data-month-placeholder]]:block has-[[data-page-month]:not(:empty)]:block'
      }
    >
      {/* The bar fills the page's column, as wide as its content. */}
      <div
        ref={setMonthSlot}
        data-page-month
        className="@container mx-auto flex h-12 w-full max-w-5xl items-center px-2 empty:hidden sm:px-4"
      />
      {monthPage && <div data-month-placeholder aria-hidden className="h-12" />}
    </div>
  )
}
