'use client'

import { CheckIcon, ChevronLeftIcon, XIcon } from 'lucide-react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import * as React from 'react'

import { Button } from './button'
import {
  FREE_ABOVE_KEYBOARD_SHARE,
  isKeyboardOpen,
  keyboardAccessoryAllowance,
  keyboardInset,
  opensKeyboard,
  revealEndScrollTop,
  revealFieldScrollTop,
  scrollParentWithin,
} from './sheet-keyboard'
import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

/**
 * `screen`: the whole screen on a phone (#385), for editors with typed
 * fields. The keyboard covers its end and never moves it; its actions are in
 * its top bar (`SheetBar`).
 */
type SheetSide = 'top' | 'right' | 'bottom' | 'left' | 'screen'

type SheetProps = React.ComponentProps<typeof SheetPrimitive.Root>
type SheetTriggerProps = React.ComponentProps<typeof SheetPrimitive.Trigger>
type SheetCloseProps = React.ComponentProps<typeof SheetPrimitive.Close>
type SheetPortalProps = React.ComponentProps<typeof SheetPrimitive.Portal>
type SheetOverlayProps = React.ComponentProps<typeof SheetPrimitive.Overlay>
type SheetContentProps = React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: SheetSide
  showCloseButton?: boolean
}
type SheetHeaderProps = React.ComponentProps<'div'>
type SheetBarProps = Omit<React.ComponentProps<'div'>, 'title'> & {
  title: React.ReactNode
  description?: React.ReactNode
  /** A step back (‹) in place of closing (✕). */
  onBack?: () => void
  backLabel?: string
  closeLabel?: string
  /** The main action, round, at the end of the bar (`SheetBarAction`). */
  action?: React.ReactNode
  /**
   * A stepped editor's steps (`SheetSteps`), under the title; the
   * description is then read by screen readers only.
   */
  steps?: React.ReactNode
  /**
   * The title, focusable: a stepped editor focuses it on each step, so
   * keyboards and screen readers start from the top (never a field).
   */
  titleRef?: React.Ref<HTMLHeadingElement>
}
type SheetBarActionProps = Omit<
  React.ComponentProps<typeof Button>,
  'children' | 'iconOnly'
> & {
  /** What the action does (« Enregistrer »): its accessible name. */
  label: string
  /** Default: a check mark. */
  icon?: React.ReactNode
}
type SheetFooterProps = React.ComponentProps<'div'>
type SheetTitleProps = React.ComponentProps<typeof SheetPrimitive.Title>
type SheetDescriptionProps = React.ComponentProps<
  typeof SheetPrimitive.Description
>

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * Sheet
 * Root component for sheet (drawer/slide-over) functionality
 * Built on Radix UI Dialog - provides modal drawer from screen edges
 */
function Sheet({ ...props }: SheetProps) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

/**
 * Sheet Trigger
 * Button or element that opens the sheet on click
 */
function SheetTrigger({ ...props }: SheetTriggerProps) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

/**
 * Sheet Close
 * Programmatic close trigger for the sheet
 */
function SheetClose({ ...props }: SheetCloseProps) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

/**
 * Sheet Portal
 * Renders sheet content in a portal (outside normal DOM hierarchy)
 */
function SheetPortal({ ...props }: SheetPortalProps) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

/**
 * Sheet Overlay
 * Semi-transparent backdrop that covers the screen
 * Supports backdrop blur on compatible browsers
 */
function SheetOverlay({ className, ...props }: SheetOverlayProps) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        [
          // Positioning
          'fixed inset-0 z-50',

          // Styling
          'bg-black/10',

          // Backdrop Blur (when supported)
          'supports-backdrop-filter:backdrop-blur-xs',

          // Transitions
          'duration-100 motion-reduce:duration-0',

          // Open Animations
          'data-open:animate-in',
          'data-open:fade-in-0',

          // Close Animations
          'data-closed:animate-out',
          'data-closed:fade-out-0',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Sheet Content
 * The sheet panel that slides in from the specified side
 * Includes optional close button and smooth slide animations
 */
/**
 * Height of the on-screen keyboard over the layout viewport, as
 * `--keyboard-inset` on the element, so a bottom sheet (and its actions)
 * stays above the keyboard. iOS Safari overlays the keyboard on the page (the
 * visual viewport shrinks, the layout viewport does not); Android Chrome
 * resizes the page instead (`interactive-widget=resizes-content`), so the
 * inset stays 0 there.
 *
 * While the keyboard is open the element also gets `data-keyboard-open`: it
 * keeps room at its end for the iOS accessory bar that floats over the page
 * (`--keyboard-accessory`, less in the installed app, which has no address
 * pill), and whenever the keyboard opens or changes height while one of its
 * fields has focus, it scrolls the element that scrolls that field (the
 * sheet, or a body inside it with the actions in a footer) so the field stays
 * in view and, as far as it allows, the end too.
 */
/**
 * While a full-screen editor is open, the page behind it cannot scroll, not
 * even when iOS scrolls the document to reveal a focused field (the classic
 * `position: fixed` body lock; `overflow: hidden` alone does not stop iOS):
 * only the visual viewport can still pan, and the editor follows it.
 */
function usePageLock(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const body = document.body
    const scrollY = window.scrollY
    const before = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }
    Object.assign(body.style, {
      position: 'fixed',
      top: `-${scrollY}px`,
      left: '0',
      right: '0',
      width: '100%',
    })
    const keepTop = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0)
    }
    window.addEventListener('scroll', keepTop)
    return () => {
      window.removeEventListener('scroll', keepTop)
      Object.assign(body.style, before)
      window.scrollTo(0, scrollY)
    }
  }, [enabled])
}

function useKeyboardInset(
  node: HTMLElement | null,
  mode: 'sheet' | 'screen' | null,
) {
  React.useEffect(() => {
    const viewport =
      typeof window === 'undefined' ? null : window.visualViewport
    if (!mode || !node || !viewport) return
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    node.style.setProperty(
      '--keyboard-accessory',
      `${keyboardAccessoryAllowance(standalone)}px`,
    )
    let wasOpen = false
    let lastInset = 0
    let frame = 0
    const revealFocus = () => {
      const focused = document.activeElement
      if (!(focused instanceof HTMLElement) || !node.contains(focused)) return
      const scroller = scrollParentWithin<HTMLElement>(focused, node)
      if (!scroller) return
      if (mode === 'screen') {
        // Only a field the keyboard hides is scrolled, just above it.
        const box = scroller.getBoundingClientRect()
        const field = focused.getBoundingClientRect()
        const accessory =
          parseFloat(node.style.getPropertyValue('--keyboard-accessory')) || 0
        scroller.scrollTop = revealFieldScrollTop({
          scrollTop: scroller.scrollTop,
          focusTop: field.top - box.top,
          focusBottom: field.bottom - box.top,
          visibleHeight:
            Math.min(
              box.bottom,
              viewport.offsetTop + viewport.height - accessory,
            ) - box.top,
        })
        return
      }
      scroller.scrollTop = revealEndScrollTop({
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        focusTop:
          focused.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top,
      })
    }
    const update = (resized: boolean) => {
      const inset = keyboardInset(window.innerHeight, viewport)
      node.style.setProperty('--keyboard-inset', `${inset}px`)
      const open = isKeyboardOpen(inset)
      node.toggleAttribute('data-keyboard-open', open)
      // A full-screen editor fits the visible area while the keyboard is
      // open: its end, under the keyboard, is never seen, and if iOS still
      // pans the page, the editor follows so nothing shows above or below.
      if (mode === 'screen') {
        node.style.setProperty(
          '--viewport-top',
          `${open ? Math.round(viewport.offsetTop) : 0}px`,
        )
        node.style.setProperty(
          '--viewport-height',
          `${Math.round(open ? viewport.height : window.innerHeight)}px`,
        )
      }
      // The keyboard opened or changed height (decimal → text): the sheet
      // was resized under the focused field. Not on a scroll of the visual
      // viewport, so the user's own scrolling is left alone.
      if (open && (!wasOpen || (resized && inset !== lastInset))) {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(revealFocus)
      }
      wasOpen = open
      lastInset = inset
    }
    // A full-screen editor (#385): as a field is tapped, before the keyboard
    // comes up, its body gets room at its end and a field low on the screen
    // is brought up into the part the keyboard leaves free. iOS then finds
    // the field in view and does not pan the whole page to reveal it: the
    // tap moves the content once, the keyboard moves nothing.
    const onFocusIn = (event: FocusEvent) => {
      const field = event.target
      if (!(field instanceof HTMLElement) || !opensKeyboard(field)) return
      if (wasOpen) return
      node.toggleAttribute('data-keyboard-expected', true)
      const scroller = scrollParentWithin<HTMLElement>(field, node)
      if (!scroller) return
      const box = scroller.getBoundingClientRect()
      const rect = field.getBoundingClientRect()
      scroller.scrollTop = revealFieldScrollTop({
        scrollTop: scroller.scrollTop,
        focusTop: rect.top - box.top,
        focusBottom: rect.bottom - box.top,
        visibleHeight:
          Math.min(box.bottom, window.innerHeight * FREE_ABOVE_KEYBOARD_SHARE) -
          box.top,
      })
    }
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget
      if (next instanceof HTMLElement && opensKeyboard(next)) return
      node.toggleAttribute('data-keyboard-expected', false)
    }
    const onResize = () => update(true)
    const onScroll = () => update(false)
    update(true)
    viewport.addEventListener('resize', onResize)
    viewport.addEventListener('scroll', onScroll)
    if (mode === 'screen') {
      node.addEventListener('focusin', onFocusIn)
      node.addEventListener('focusout', onFocusOut)
    }
    return () => {
      node.removeEventListener('focusin', onFocusIn)
      node.removeEventListener('focusout', onFocusOut)
      cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', onResize)
      viewport.removeEventListener('scroll', onScroll)
    }
  }, [node, mode])
}

/**
 * Whether an event comes from a toast: its « Annuler » must work while a
 * sheet is open (an undo of something done in the sheet), without closing it.
 */
function fromToast(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-sonner-toaster]') !== null
  )
}

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = side !== 'screen',
  ref,
  onInteractOutside,
  onOpenAutoFocus,
  ...props
}: SheetContentProps) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null)
  useKeyboardInset(
    node,
    side === 'bottom' ? 'sheet' : side === 'screen' ? 'screen' : null,
  )
  // `node` is null while the sheet is closed (its content unmounted).
  usePageLock(side === 'screen' && node !== null)
  const setRefs = React.useCallback(
    (element: HTMLDivElement | null) => {
      setNode(element)
      if (typeof ref === 'function') ref(element)
      else if (ref) ref.current = element
    },
    [ref],
  )

  return (
    <SheetPortal>
      {/* A full-screen editor hides the page entirely, even while iOS
          moves things around the keyboard. */}
      <SheetOverlay
        className={
          side === 'screen'
            ? 'bg-popover supports-backdrop-filter:backdrop-blur-none'
            : undefined
        }
      />
      <SheetPrimitive.Content
        ref={setRefs}
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          [
            // Positioning
            'group/sheet fixed z-50',

            // Layout
            'flex flex-col gap-4',

            // Styling
            'bg-popover bg-clip-padding text-popover-foreground',
            'shadow-lg',

            // Typography
            'text-sm',

            // Never pans sideways under the finger (a too-wide field must not
            // make the whole sheet scroll horizontally on iOS), and scrolling
            // its content never scrolls the page behind it.
            'overflow-x-hidden overscroll-contain',

            // Transitions
            'transition duration-200 ease-in-out',
            'motion-reduce:duration-0',

            // Side: Bottom
            'data-[side=bottom]:inset-x-0',
            'data-[side=bottom]:bottom-0',
            'data-[side=bottom]:h-auto',
            'data-[side=bottom]:border-t',
            // Clear of the home indicator and, in landscape, of the notch
            'data-[side=bottom]:pb-[env(safe-area-inset-bottom)]',
            'data-[side=bottom]:px-[env(safe-area-inset-left)]',
            // Above the on-screen keyboard (see useKeyboardInset)
            'data-[side=bottom]:bottom-(--keyboard-inset,0px)',
            // ...and its floating accessory bar on iOS: the home indicator is
            // under the keyboard then (see keyboardAccessoryAllowance).
            'data-[side=bottom]:data-keyboard-open:pb-(--keyboard-accessory,84px)',

            // Side: Screen (#385): the whole screen, the keyboard over its
            // end; while it is open, the visible area above it (see
            // useKeyboardInset).
            'data-[side=screen]:inset-0',
            'data-[side=screen]:data-keyboard-open:top-(--viewport-top,0px)',
            'data-[side=screen]:data-keyboard-open:bottom-auto',
            'data-[side=screen]:data-keyboard-open:h-(--viewport-height,100%)',
            'data-[side=screen]:data-keyboard-open:pb-0',
            'data-[side=screen]:gap-0',
            'data-[side=screen]:pt-[env(safe-area-inset-top)]',
            'data-[side=screen]:pb-[env(safe-area-inset-bottom)]',
            'data-[side=screen]:pl-[env(safe-area-inset-left)]',
            'data-[side=screen]:pr-[env(safe-area-inset-right)]',
            // From the tap on a field until the keyboard is up, the end of
            // what scrolls (the sheet, or a body marked `data-sheet-scroll`)
            // gets room for a field to be brought up, unseen; then room for
            // the accessory bar floating over the visible area.
            'data-[side=screen]:data-keyboard-expected:not-data-keyboard-open:data-sheet-scroll:pb-[60svh]',
            'data-[side=screen]:data-keyboard-expected:not-data-keyboard-open:[&_[data-sheet-scroll]]:pb-[60svh]',
            'data-[side=screen]:data-keyboard-open:data-sheet-scroll:pb-[calc(var(--keyboard-accessory,0px)+1rem)]',
            'data-[side=screen]:data-keyboard-open:[&_[data-sheet-scroll]]:pb-[calc(var(--keyboard-accessory,0px)+1rem)]',

            // Side: Left
            'data-[side=left]:inset-y-0',
            'data-[side=left]:left-0',
            'data-[side=left]:h-full',
            'data-[side=left]:w-3/4',
            'data-[side=left]:border-r',
            'data-[side=left]:sm:max-w-sm',
            // Scrolls when taller than the screen (phone in landscape)
            'data-[side=left]:overflow-y-auto',
            'data-[side=left]:pt-[env(safe-area-inset-top)]',
            'data-[side=left]:pb-[env(safe-area-inset-bottom)]',
            'data-[side=left]:pl-[env(safe-area-inset-left)]',

            // Side: Right
            'data-[side=right]:inset-y-0',
            'data-[side=right]:right-0',
            'data-[side=right]:h-full',
            'data-[side=right]:w-3/4',
            'data-[side=right]:border-l',
            'data-[side=right]:sm:max-w-sm',
            // Scrolls when taller than the screen (phone in landscape)
            'data-[side=right]:overflow-y-auto',
            'data-[side=right]:pt-[env(safe-area-inset-top)]',
            'data-[side=right]:pb-[env(safe-area-inset-bottom)]',
            'data-[side=right]:pr-[env(safe-area-inset-right)]',

            // Side: Top
            'data-[side=top]:inset-x-0',
            'data-[side=top]:top-0',
            'data-[side=top]:h-auto',
            'data-[side=top]:border-b',
            'data-[side=top]:pt-[env(safe-area-inset-top)]',

            // Open Animations
            'data-open:animate-in',
            'data-open:fade-in-0',
            'data-[side=bottom]:data-open:slide-in-from-bottom-10',
            'data-[side=screen]:data-open:slide-in-from-bottom-10',
            'data-[side=left]:data-open:slide-in-from-left-10',
            'data-[side=right]:data-open:slide-in-from-right-10',
            'data-[side=top]:data-open:slide-in-from-top-10',

            // Close Animations
            'data-closed:animate-out',
            'data-closed:fade-out-0',
            'data-[side=bottom]:data-closed:slide-out-to-bottom-10',
            'data-[side=screen]:data-closed:slide-out-to-bottom-10',
            'data-[side=left]:data-closed:slide-out-to-left-10',
            'data-[side=right]:data-closed:slide-out-to-right-10',
            'data-[side=top]:data-closed:slide-out-to-top-10',
          ].join(' '),
          className,
        )}
        {...props}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event)
          // A full-screen editor opens without the keyboard: the panel
          // itself takes the focus, not its first field (#385).
          if (side === 'screen' && !event.defaultPrevented) {
            event.preventDefault()
            node?.focus({ preventScroll: true })
          }
        }}
        onInteractOutside={(event) => {
          if (fromToast(event.target)) event.preventDefault()
          onInteractOutside?.(event)
        }}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              ghost
              iconOnly
              size="sm"
              className={cn(
                'absolute top-3 right-3',
                // A panel with a `SheetBar` has its round ✕ there (#385).
                '[[data-slot=sheet-content]:has([data-slot=sheet-bar])_&]:hidden',
                // Stay clear of the notch / status bar on edge-to-edge sides
                'group-data-[side=left]/sheet:top-[calc(--spacing(3)+env(safe-area-inset-top))]',
                'group-data-[side=right]/sheet:top-[calc(--spacing(3)+env(safe-area-inset-top))]',
                'group-data-[side=right]/sheet:right-[calc(--spacing(3)+env(safe-area-inset-right))]',
                'group-data-[side=bottom]/sheet:right-[calc(--spacing(3)+env(safe-area-inset-right))]',
              )}
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

/**
 * Sheet Header
 * Container for sheet title and description with consistent spacing
 */
function SheetHeader({ className, ...props }: SheetHeaderProps) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        [
          // Layout
          'flex flex-col gap-0.5',

          // Spacing
          'p-4',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/**
 * A round button of the bar: an exact 40px circle (the buttons' default
 * minimum height would make it an oval).
 */
const ROUND =
  'size-[40px] min-h-0 shrink-0 aspect-square rounded-full p-0 [&_svg]:size-[18px]'

/**
 * Sheet Bar
 * The top bar of a full-screen editor (`side="screen"`, #385, the owner's
 * « Ronds »): a round ✕ (or ‹ for a step back), the title in the middle,
 * the main action as a round button (`SheetBarAction`), then the
 * description under it.
 */
function SheetBar({
  title,
  description,
  onBack,
  backLabel = 'Retour',
  closeLabel = 'Fermer',
  action,
  steps,
  titleRef,
  className,
  ...props
}: SheetBarProps) {
  // `type="button"`: the bar sits inside the editor's form, where a button
  // without a type would submit it (a step back moved forward again).
  const leave = (
    <Button
      type="button"
      variant="secondary"
      iconOnly
      className={ROUND}
      aria-label={onBack ? backLabel : closeLabel}
      onClick={onBack}
    >
      {onBack ? <ChevronLeftIcon aria-hidden /> : <XIcon aria-hidden />}
    </Button>
  )
  return (
    <div
      data-slot="sheet-bar"
      className={cn('shrink-0 border-b', className)}
      {...props}
    >
      <div className="flex min-h-[56px] items-center gap-2 px-3 py-2">
        {onBack ? (
          leave
        ) : (
          <SheetPrimitive.Close asChild>{leave}</SheetPrimitive.Close>
        )}
        <SheetTitle
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
          className={cn(
            'outline-none',
            // Two lines at most, sized in px (the app's root is 22px).
            'line-clamp-2 min-w-0 flex-1 text-center text-[17px] leading-tight break-normal',
          )}
        >
          {title}
        </SheetTitle>
        {action ?? <span aria-hidden className="size-[40px] shrink-0" />}
      </div>
      {steps}
      {description && (
        <SheetDescription
          className={cn(
            'px-4 pb-3 text-[15px] leading-snug',
            steps !== undefined && 'sr-only',
          )}
        >
          {description}
        </SheetDescription>
      )}
    </div>
  )
}

/**
 * Sheet Bar Action
 * The round main action of a `SheetBar` (a check mark by default): filled
 * once it can be used, greyed out before (`disabled`).
 */
function SheetBarAction({
  label,
  icon,
  loading,
  className,
  ...props
}: SheetBarActionProps) {
  return (
    <Button
      // A plain button unless the caller makes it the form's submit.
      type="button"
      iconOnly
      loading={loading}
      aria-label={label}
      title={label}
      className={cn(
        ROUND,
        '[&_svg]:size-[20px]',
        'disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100',
        className,
      )}
      {...props}
    >
      {/* While loading, the spinner alone */}
      {!loading && (icon ?? <CheckIcon aria-hidden strokeWidth={2.6} />)}
    </Button>
  )
}

/**
 * Sheet Footer
 * Container for sheet actions (buttons, etc.)
 * Automatically positioned at bottom with margin-top auto
 */
function SheetFooter({ className, ...props }: SheetFooterProps) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        [
          // Layout
          'mt-auto flex flex-col gap-2',

          // Spacing
          'p-4',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Sheet Title
 * Heading for the sheet content
 * Uses heading font with medium weight
 */
function SheetTitle({ className, ...props }: SheetTitleProps) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        [
          // Typography
          'font-heading text-base font-medium text-foreground',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Sheet Description
 * Explanatory text below the title
 */
function SheetDescription({ className, ...props }: SheetDescriptionProps) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetBarActionProps,
  type SheetBarProps,
  type SheetCloseProps,
  type SheetContentProps,
  type SheetDescriptionProps,
  type SheetFooterProps,
  type SheetHeaderProps,
  type SheetOverlayProps,
  type SheetPortalProps,
  type SheetProps,
  type SheetSide,
  type SheetTitleProps,
  type SheetTriggerProps,
}
