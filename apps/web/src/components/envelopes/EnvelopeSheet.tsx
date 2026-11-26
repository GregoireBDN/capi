import { Sheet, SheetContent, useIsMobile } from '@capi/ui'
import { useId } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_FORM,
  FORM_SHEET_SCREEN,
  FORM_SHEET_SIDE,
  FormSheetBody,
} from '#/components/sheets/form-sheet'

/**
 * The frame of an envelope's panel (move, split key, edit): the whole
 * screen on a phone, a centred window elsewhere, the round ✓ on top.
 */
export function EnvelopeSheet({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  loading,
  disabled,
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  actionLabel: string
  loading?: boolean
  disabled?: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  const id = useId()
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!disabled && !loading) onSubmit()
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
      >
        <EditorHeader
          title={title}
          description={description}
          action={{
            type: 'submit',
            form: `${id}-form`,
            label: actionLabel,
            loading,
            disabled,
          }}
        />
        <form
          id={`${id}-form`}
          noValidate
          onSubmit={submit}
          className={FORM_SHEET_FORM}
        >
          <FormSheetBody>{children}</FormSheetBody>
        </form>
      </SheetContent>
    </Sheet>
  )
}
