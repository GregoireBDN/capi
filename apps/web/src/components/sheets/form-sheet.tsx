import { SheetBar, SheetBarAction } from '@capi/ui'
import type { SheetBarActionProps } from '@capi/ui'
import { cn } from '@capi/ui/lib/utils'
import type { ComponentProps, ReactNode } from 'react'

/*
 * Layout of an editor (#385, the owner's « B. Plein écran » with « Ronds »,
 * then the same on a computer): `SheetBar` on top (✕ or ‹, the title, the
 * round main action submitting the form, the steps of a stepped editor), the
 * fields in a body that scrolls, no footer; the other actions (« Supprimer »)
 * at the end of the body. On a phone it takes the whole screen
 * (`side="screen"`): the keyboard covers the end of the body and never moves
 * anything. On a wider screen, a modal in the middle of the page
 * (`side="center"`, #394): never a panel beside it.
 */

/** `side` of an editor's `SheetContent`: the whole screen, else centred. */
export function editorSide(isMobile: boolean) {
  return isMobile ? 'screen' : 'center'
}

/** The top of an editor: the bar (✕ or ‹, the title, the round action). */
export function EditorHeader({
  title,
  description,
  onBack,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  /** ‹ in place of ✕: a step back. */
  onBack?: () => void
  /** The main action, the bar's round button. */
  action?: SheetBarActionProps
  /** Former desktop header's class, ignored. */
  className?: string
}) {
  return (
    <SheetBar
      title={title}
      description={description}
      onBack={onBack}
      action={action && <SheetBarAction {...action} />}
    />
  )
}

/**
 * An editor whose screens differ in height (steps, a list to search) keeps
 * one height as a centred modal, so it never jumps as they change or the
 * list is filtered. No effect on a phone (the whole screen).
 */
export const EDITOR_STEADY_HEIGHT =
  'data-[side=center]:h-[min(40rem,calc(100svh-2rem))]'

/** `SheetContent` of a form editor on a phone: the whole screen. */
export const FORM_SHEET_SCREEN = 'gap-0'

/** `SheetContent` of a form editor on a wider screen (a centred modal). */
export const FORM_SHEET_SIDE = 'gap-0'

/** The `<form>` filling the sheet under its header. */
export const FORM_SHEET_FORM = 'flex min-h-0 flex-1 flex-col'

/**
 * The fields: the only part that scrolls (`data-sheet-scroll`: on a phone,
 * room is kept at its end while the keyboard is open).
 */
export function FormSheetBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="form-sheet-body"
      data-sheet-scroll=""
      className={cn(
        'min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-4',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The actions other than the main one (« Supprimer », « Retirer »), at the
 * end of the body, one per line.
 */
export function FormSheetMoreActions({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="form-sheet-more-actions"
      className={cn('flex flex-col gap-2 pt-2 [&>*]:min-h-11', className)}
      {...props}
    />
  )
}

/**
 * What scrolls under the header of an editor whose content is not a
 * `FormSheetBody` (a form with its own padding, a list): the header stays,
 * and on a phone its end makes room for the keyboard.
 */
export function SheetScroll({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-scroll"
      data-sheet-scroll=""
      className={cn(
        'min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-4',
        className,
      )}
      {...props}
    />
  )
}
