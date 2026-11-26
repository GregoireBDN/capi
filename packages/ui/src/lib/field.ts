/**
 * The look of a field (#507, the owner's « B · Creusé »): a faint hollow with
 * no border (`glass-field`), the card's colour with a primary edge and glow
 * on focus, the same in the destructive colour when invalid. Shared by every
 * field of `@capi/ui` and by the pickers hand-rolled in `apps/web`, so they
 * read as one family. Box shadows only: no layout jump on focus.
 */
const fieldSurface = [
  'glass-field rounded-control border-0',
  'transition-[background-color,box-shadow] outline-none',
  'placeholder:text-muted-foreground',
  'focus-visible:glass-field-focus',
  'aria-invalid:glass-field-invalid',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
].join(' ')

/**
 * The same look on a box whose control is inside it (an input group, a
 * search with a button): focus and invalid follow its text control, not
 * the buttons beside it.
 */
const fieldGroupSurface = [
  'glass-field rounded-control border-0',
  'transition-[background-color,box-shadow] outline-none',
  'has-[input:focus-visible]:glass-field-focus',
  'has-[textarea:focus-visible]:glass-field-focus',
  'has-[[aria-invalid=true]]:glass-field-invalid',
  'has-[input:disabled]:opacity-50 has-[input:disabled]:shadow-none',
].join(' ')

export { fieldGroupSurface, fieldSurface }
