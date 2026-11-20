'use client'

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import * as React from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { cn } from '../lib/utils'
import {
  bottomBarClearance,
  STICKY_BOTTOM_BAR_ATTRIBUTE,
  TOAST_CLEARANCE_VARIABLE,
} from './toast-clearance'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type ToasterComponentProps = ToasterProps

/* ============================================================================
 * STYLE
 * The owner's « B. Teinte douce » (#380): the app's card, the icon on a tile
 * of its tone (like `CategoryIcon`), the message in the text colour, its
 * second line muted, the action an outline button. Errors add a red border;
 * no toast is filled with its colour.
 * ========================================================================= */

/** Each type's icon and tile, readable on the card in both themes. */
const TONE = {
  success:
    '[&_[data-icon]]:bg-chart-delta-good/14 [&_[data-icon]]:text-chart-delta-good',
  error: cn(
    '[&_[data-icon]]:bg-destructive/14 [&_[data-icon]]:text-destructive',
    '!border-destructive/50',
  ),
  warning: cn(
    '[&_[data-icon]]:bg-warning/25 [&_[data-icon]]:text-warning-foreground',
    'dark:[&_[data-icon]]:text-warning',
  ),
  info: cn(
    '[&_[data-icon]]:bg-info/25 [&_[data-icon]]:text-info-foreground',
    'dark:[&_[data-icon]]:text-info',
  ),
  loading: '[&_[data-icon]]:bg-muted [&_[data-icon]]:text-muted-foreground',
}

const CLASS_NAMES: NonNullable<ToasterProps['toastOptions']>['classNames'] = {
  // Sonner's own sizes are 13px; these are the app's (22px root).
  toast: cn(
    'font-sans !items-center !gap-2.5 !rounded-xl !px-3 !py-2.5 !shadow-lg',
    '!border-border !bg-popover !text-popover-foreground',
  ),
  content: '!min-w-0 !flex-1',
  title: '!text-[0.75rem] !font-medium !leading-snug',
  description: '!text-[0.68rem] !leading-snug !text-muted-foreground',
  icon: '!m-0 !size-[1.6rem] !justify-center !rounded-lg',
  // `Button` outline secondary, 44px high on touch screens.
  actionButton: cn(
    '!h-[1.6rem] !shrink-0 !rounded-lg !px-3 !text-[0.75rem] !font-medium',
    '!border !border-secondary-foreground/30 !bg-background',
    '!text-secondary-foreground hover:!bg-secondary',
    'focus-visible:!ring-3 focus-visible:!ring-ring/50',
    'pointer-coarse:!h-[44px]',
  ),
  cancelButton: cn(
    '!h-[1.6rem] !shrink-0 !rounded-lg !px-3 !text-[0.75rem] !font-medium',
    '!bg-transparent !text-muted-foreground hover:!bg-secondary',
    'pointer-coarse:!h-[44px]',
  ),
  ...TONE,
}

/** The larger of the toaster's own offset and the bars' clearance. */
const clearOf = (offset: string) =>
  `max(${offset}, var(${TOAST_CLEARANCE_VARIABLE}, 0px))`

/* ============================================================================
 * HOOKS
 * ========================================================================= */

/** Sonner's theme follows the `.dark` class of the root. */
function useRootTheme() {
  const [theme, setTheme] = React.useState<'light' | 'dark' | 'system'>(
    'system',
  )

  React.useEffect(() => {
    const updateTheme = () => {
      setTheme(
        document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      )
    }
    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  return theme
}

/**
 * Keeps `--toast-bottom-clearance` on the root equal to the room the sticky
 * bottom bars take at the bottom of the screen, on scroll, resize and when a
 * bar comes or goes (at most once a frame). Written on the root's style, so
 * no render.
 */
function useBottomBarClearance() {
  React.useEffect(() => {
    const root = document.documentElement
    let frame = 0
    let current = ''

    const measure = () => {
      frame = 0
      const bars = document.querySelectorAll(`[${STICKY_BOTTOM_BAR_ATTRIBUTE}]`)
      const clearance = bottomBarClearance(
        Array.from(bars, (bar) => bar.getBoundingClientRect()),
        window.innerHeight,
      )
      const next = clearance > 0 ? `${clearance}px` : ''
      if (next === current) return
      current = next
      if (next) root.style.setProperty(TOAST_CLEARANCE_VARIABLE, next)
      else root.style.removeProperty(TOAST_CLEARANCE_VARIABLE)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    measure()
    const mutations = new MutationObserver(schedule)
    mutations.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('scroll', schedule, {
      passive: true,
      capture: true,
    })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      mutations.disconnect()
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      root.style.removeProperty(TOAST_CLEARANCE_VARIABLE)
    }
  }, [])
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

function Toaster({ style, ...props }: ToasterComponentProps) {
  const theme = useRootTheme()
  useBottomBarClearance()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          '--width': '24rem',
          // A modal sheet or dialog sets `pointer-events: none` on the body:
          // toasts stay clickable over it (« Annuler » of an edit made in it).
          pointerEvents: 'auto',
          ...style,
        } as React.CSSProperties
      }
      // Edge-to-edge (viewport-fit=cover): clear of the notch and the home
      // indicator, and above a sticky bottom bar. Sonner's defaults are 24px
      // (desktop) and 16px (phones).
      offset={{
        top: 'calc(24px + env(safe-area-inset-top))',
        right: 'calc(24px + env(safe-area-inset-right))',
        bottom: clearOf('calc(24px + env(safe-area-inset-bottom))'),
        left: 'calc(24px + env(safe-area-inset-left))',
      }}
      mobileOffset={{
        top: 'calc(16px + env(safe-area-inset-top))',
        right: 'calc(16px + env(safe-area-inset-right))',
        bottom: clearOf('calc(16px + env(safe-area-inset-bottom))'),
        left: 'calc(16px + env(safe-area-inset-left))',
      }}
      toastOptions={{ classNames: CLASS_NAMES }}
      {...props}
    />
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { Toaster, type ToasterComponentProps }
