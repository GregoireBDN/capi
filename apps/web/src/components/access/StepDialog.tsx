import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Sheet,
  SheetBar,
  SheetContent,
  SheetDescription,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * The frame of a stepped flow (#329, like « Ajouter » on Crypto): a bottom
 * sheet on phones, a dialog elsewhere; « Retour » and « Étape n sur m » on
 * top, the question on its own line, the body scrolling, an optional action
 * at the end.
 */
export function StepDialog({
  open,
  onOpenChange,
  label,
  description,
  title,
  step,
  onBack,
  action,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible name of the dialog. */
  label: string
  description: string
  /** The screen's question. */
  title: string
  /** `[n, of]`, or nothing on a screen outside the count. */
  step?: [number, number]
  onBack?: () => void
  action?: ReactNode
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Each screen starts at its question, for screen readers and keyboards.
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open, title])

  const Title = isMobile ? SheetTitle : DialogTitle
  const Description = isMobile ? SheetDescription : DialogDescription
  const content = (
    <div className="flex min-h-0 flex-1 flex-col">
      {isMobile ? (
        <SheetBar
          title={title}
          description={
            step ? `${label} · étape ${step[0]} sur ${step[1]}` : description
          }
          onBack={onBack}
        />
      ) : (
        <>
          <Title className="sr-only">{label}</Title>
          <Description className="sr-only">{description}</Description>
          <div className="flex min-h-14 items-center gap-2 py-2 pr-12 pl-2">
            {onBack ? (
              <Button type="button" ghost variant="secondary" onClick={onBack}>
                <ChevronLeftIcon aria-hidden />
                Retour
              </Button>
            ) : (
              <span className="w-2" />
            )}
            {step && (
              <p className="text-muted-foreground text-sm whitespace-nowrap">
                Étape {step[0]} sur {step[1]}
              </p>
            )}
          </div>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="px-4 pb-3 text-lg leading-snug font-semibold outline-none"
          >
            {title}
          </h3>
        </>
      )}
      <div
        data-sheet-scroll=""
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4 group-data-[side=screen]/sheet:pt-4"
      >
        {children}
      </div>
      {action && (
        <div className="flex shrink-0 gap-2 border-t px-4 py-3 group-data-keyboard-open/sheet:hidden">
          {action}
        </div>
      )}
    </div>
  )

  return isMobile ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="screen"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          headingRef.current?.focus()
        }}
      >
        {content}
      </SheetContent>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(44rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          headingRef.current?.focus()
        }}
      >
        {content}
      </DialogContent>
    </Dialog>
  )
}

/** One choice of a list: a tap moves on. */
export function ChoiceTile({
  icon,
  label,
  description,
  disabled,
  onSelect,
}: {
  icon?: ReactNode
  label: string
  description?: string
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="hover:bg-muted/60 focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none focus-visible:ring-2 disabled:opacity-60"
      >
        {icon && (
          <span
            aria-hidden
            className="bg-muted text-muted-foreground flex size-[32px] shrink-0 items-center justify-center rounded-full [&_svg]:size-[16px]"
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          {description && (
            <span className="text-muted-foreground block text-sm text-pretty">
              {description}
            </span>
          )}
        </span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </button>
    </li>
  )
}
