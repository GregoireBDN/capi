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

/* ============================================================================
 * TYPES
 * ========================================================================= */

type ToasterComponentProps = ToasterProps

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

function Toaster({ ...props }: ToasterComponentProps) {
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
        } as React.CSSProperties
      }
      // Edge-to-edge (viewport-fit=cover): clear of the notch and the home
      // indicator. Sonner's defaults are 24px (desktop) and 16px (phones).
      offset={{
        top: 'calc(24px + env(safe-area-inset-top))',
        right: 'calc(24px + env(safe-area-inset-right))',
        bottom: 'calc(24px + env(safe-area-inset-bottom))',
        left: 'calc(24px + env(safe-area-inset-left))',
      }}
      mobileOffset={{
        top: 'calc(16px + env(safe-area-inset-top))',
        right: 'calc(16px + env(safe-area-inset-right))',
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        left: 'calc(16px + env(safe-area-inset-left))',
      }}
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
          // Touch screens: 44px-high action buttons ("Recharger", "Annuler")
          actionButton: 'pointer-coarse:!h-11 pointer-coarse:!px-4',
          cancelButton: 'pointer-coarse:!h-11 pointer-coarse:!px-4',
          success: '!bg-success !text-success-foreground !border-success/50',
          error:
            '!bg-destructive !text-destructive-foreground !border-destructive/50',
          warning: '!bg-warning !text-warning-foreground !border-warning/50',
          info: '!bg-info !text-info-foreground !border-info/50',
        },
      }}
      {...props}
    />
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { Toaster, type ToasterComponentProps }
