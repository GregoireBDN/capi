import { Sheet, SheetContent, useIsMobile } from '@finances/ui'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_SCREEN,
  SheetScroll,
} from '#/components/sheets/form-sheet'

/** Bottom sheet on phones, side sheet from `md`: the passkey dialogs' frame. */
export function PasskeySheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : 'overflow-y-auto'}
      >
        <EditorHeader
          className="pb-0"
          title={title}
          description={description}
        />
        <SheetScroll className="space-y-4 px-4 pb-6">{children}</SheetScroll>
      </SheetContent>
    </Sheet>
  )
}
