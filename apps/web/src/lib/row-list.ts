/**
 * A bordered list whose rows are buttons (#291): the list clips its rows to
 * its own rounding, so a row's hover / press background fills it edge to
 * edge (square in the middle, following the card's corners at the ends) and
 * never shows the card's background in rounded corners of its own.
 */
export const ROW_LIST = 'divide-y overflow-hidden rounded-xl border'

/**
 * A list split by rules, without a border, whose rows are targets: it is
 * widened by its rows' padding (`px-2` on every row, target or not), so the
 * rules reach as far as a row's hover background and the text stays in line
 * with the rest of the card.
 */
export const DIVIDED_LIST = '-mx-2 divide-y'

/**
 * A row of a `ROW_LIST` or a `DIVIDED_LIST`: square and full width, so its
 * hover / press background fills the space between the rules, with its
 * focus ring drawn inside it (a `ROW_LIST` clips anything outside its rows).
 */
export const ROW_BUTTON =
  'hover:bg-muted/50 active:bg-muted/50 focus-visible:ring-ring/50 w-full text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset'
