import { cn } from '@finances/ui/lib/utils'
import type { ComponentProps } from 'react'

/*
 * Layout of an editor in a sheet (#323): its fields in a body that scrolls,
 * its actions in a footer outside it, so « Enregistrer » stays on screen,
 * above the keyboard and its iOS accessory bar, while a field is typed in.
 * The sheet then takes every pixel above the keyboard up to the status bar
 * instead of shrinking to its content (`ManualTransactionSheet`, #245).
 */

/** Below the keyboard (see `useKeyboardInset`): from the status bar down. */
const KEYBOARD_OPEN_HEIGHT =
  'data-[side=bottom]:data-keyboard-open:h-[calc(100svh-var(--keyboard-inset,0px)-env(safe-area-inset-top)-0.5rem)] data-[side=bottom]:data-keyboard-open:max-h-none'

/**
 * `SheetContent` of a form editor on a phone (a bottom sheet): as tall as
 * its content up to 92 % of the screen, the whole height above the keyboard
 * while it is open.
 */
export const FORM_SHEET_BOTTOM = cn(
  'gap-0 rounded-t-xl data-[side=bottom]:max-h-[calc(92svh-var(--keyboard-inset,0px))]',
  KEYBOARD_OPEN_HEIGHT,
)

/**
 * The same for a stepped editor: one height for every step, so « Suivant »
 * stays put and a list growing under a search moves nothing.
 */
export const STEPPED_SHEET_BOTTOM = cn(
  'gap-0 rounded-t-xl data-[side=bottom]:h-[min(32rem,calc(92svh-var(--keyboard-inset,0px)))]',
  KEYBOARD_OPEN_HEIGHT,
)

/** `SheetContent` of a form editor beside the page (wide screens). */
export const FORM_SHEET_SIDE = 'gap-0'

/** The `<form>` filling the sheet under its header. */
export const FORM_SHEET_FORM = 'flex min-h-0 flex-1 flex-col'

/** The fields: the only part that scrolls. */
export function FormSheetBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="form-sheet-body"
      className={cn(
        'min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-1 pb-4',
        className,
      )}
      {...props}
    />
  )
}

/** The actions, always on screen at the end of the sheet. */
export function FormSheetFooter({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="form-sheet-footer"
      className={cn('flex shrink-0 gap-2 border-t px-4 py-3', className)}
      {...props}
    />
  )
}
