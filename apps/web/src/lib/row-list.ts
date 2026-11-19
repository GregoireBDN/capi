/**
 * A bordered list whose rows are buttons (#291): the list clips its rows to
 * its own rounding, so a row's hover / press background fills it edge to
 * edge (square in the middle, following the card's corners at the ends) and
 * never shows the card's background in rounded corners of its own.
 */
export const ROW_LIST = 'divide-y overflow-hidden rounded-xl border'

/**
 * A row of a `ROW_LIST`: square, full width, its focus ring drawn inside it,
 * since the list clips anything drawn outside its rows.
 */
export const ROW_BUTTON =
  'hover:bg-muted/50 active:bg-muted/50 focus-visible:ring-ring/50 w-full text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset'
