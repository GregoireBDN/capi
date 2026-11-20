import {
  SheetBar,
  SheetBarAction,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useIsMobile,
  type SheetBarActionProps,
} from '@finances/ui'
import { cn } from '@finances/ui/lib/utils'
import type { ComponentProps, ReactNode } from 'react'

/*
 * Layout of an editor in a sheet. On a phone it takes the whole screen
 * (`side="screen"`, #385, the owner's « B. Plein écran » with « Ronds »):
 * `SheetBar` on top (✕, the title, the round ✓ submitting the form), the
 * fields in a body that scrolls, no footer. The keyboard covers the end of
 * the body and never moves anything. Beside the page (wide screens), a
 * right-hand sheet with its header, the body and the actions in a footer.
 */

/** `side` of an editor's `SheetContent`. */
export function editorSide(isMobile: boolean) {
  return isMobile ? 'screen' : 'right'
}

/**
 * The top of an editor: on a phone the bar (✕ or ‹, the title, the round
 * main action), beside the page its header (`children` first: a « Retour »).
 */
export function EditorHeader({
  title,
  description,
  onBack,
  action,
  className,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  /** On a phone, ‹ in place of ✕: a step back. */
  onBack?: () => void
  /** The main action, the bar's round button on a phone. */
  action?: SheetBarActionProps
  /** The desktop header's class. */
  className?: string
  children?: ReactNode
}) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <SheetBar
        title={title}
        description={description}
        onBack={onBack}
        action={action && <SheetBarAction {...action} />}
      />
    )
  }
  return (
    <SheetHeader className={className}>
      {children}
      <SheetTitle>{title}</SheetTitle>
      {description && <SheetDescription>{description}</SheetDescription>}
    </SheetHeader>
  )
}

/** `SheetContent` of a form editor on a phone: the whole screen. */
export const FORM_SHEET_SCREEN = 'gap-0'

/** `SheetContent` of a form editor beside the page (wide screens). */
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
        'min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-1 pb-4',
        'group-data-[side=screen]/sheet:pt-4',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The actions beside the page, always on screen at the end of the sheet.
 * Not on a phone: the main action is the bar's ✓ there, and what else the
 * editor offers (« Supprimer ») goes at the end of its body
 * (`FormSheetPhoneActions`).
 */
export function FormSheetFooter({
  className,
  ...props
}: ComponentProps<'div'>) {
  const isMobile = useIsMobile()
  if (isMobile) return null
  return (
    <div
      data-slot="form-sheet-footer"
      className={cn('flex shrink-0 gap-2 border-t px-4 py-3', className)}
      {...props}
    />
  )
}

/**
 * On a phone, the actions other than the main one (« Supprimer »,
 * « Retirer »), at the end of the body, one per line.
 */
export function FormSheetPhoneActions({
  className,
  ...props
}: ComponentProps<'div'>) {
  const isMobile = useIsMobile()
  if (!isMobile) return null
  return (
    <div
      data-slot="form-sheet-phone-actions"
      className={cn('flex flex-col gap-2 pt-2 [&>*]:min-h-11', className)}
      {...props}
    />
  )
}
