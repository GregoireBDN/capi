/**
 * A list on its own whose rows are buttons (#291), in glass (#510): a glass
 * card whose rows are separated by space only (#508, « A · Espace seul »),
 * never by a line. The card is padded so a row's rounded hover / press
 * background stays inside its corners.
 */
export const ROW_LIST = 'glass-card rounded-card space-y-0.5 p-1'

/**
 * A list inside a card whose rows are targets: it is widened by its rows'
 * padding (`px-2` on every row, target or not), so a row's hover background
 * reaches past the text, which stays in line with the rest of the card. Rows
 * are separated by space only (#508).
 */
export const DIVIDED_LIST = '-mx-2 space-y-0.5'

/**
 * A row of a `ROW_LIST` or a `DIVIDED_LIST`: full width and rounded, so its
 * hover / press background is a soft tile, with its focus ring drawn inside
 * it.
 */
export const ROW_BUTTON =
  'hover:bg-muted/50 active:bg-muted/50 focus-visible:ring-ring/50 rounded-control w-full text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset'
