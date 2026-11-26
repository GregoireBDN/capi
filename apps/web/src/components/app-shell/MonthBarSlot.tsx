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
 * and Opérations, the two tabs « Résumé · Opérations » come first
 * (#498, `staticData.movementsTab`): before the month in the same white bar
 * on a computer, a white bar of their own above it on a phone (#505).
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
        // room until then. Glass chrome on phones (#434, #504): the header's
        // colour and blur, a shadow below instead of a line, one block with
        // the header. From `md` up it belongs to the page's column, under
        // the header and its shadow (the owner's « A · Bandeau fixe », #505):
        // no chrome of its own, so every page has the same frame.
        'glass-chrome relative z-10 hidden shrink-0 has-[[data-month-placeholder]]:block has-[[data-page-month]:not(:empty)]:block md:bg-transparent! md:shadow-none! md:backdrop-blur-none!',
        staging && 'env-banner',
      )}
    >
      {/* The month's toolbar (#505, the owner's « barre d'outils + état »),
          as wide as the page's content: on a computer one white bar, the
          tabs, then ‹ · the month and its state · ›; on a phone the tabs and
          the month each a white bar of their own, the month without its
          state (too much room, the owner). */}
      <div className="mx-auto w-full max-w-5xl px-2 py-2 sm:px-4 md:px-6 md:pt-3 md:pb-1">
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
