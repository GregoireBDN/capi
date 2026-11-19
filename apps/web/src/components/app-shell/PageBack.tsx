import { useIsMobile } from '@finances/ui'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { ChevronLeftIcon } from 'lucide-react'
import { createPortal } from 'react-dom'
import { usePageBackSlot } from './page-actions'

/** Where a sub-page goes back to (`PageHeader`'s `back`). */
export interface PageBackLink {
  /** The parent page's name, e.g. « Comptes ». */
  label: string
  to: LinkProps['to']
  params?: LinkProps['params']
  search?: LinkProps['search']
}

/**
 * The way back from a sub-page (e.g. an account to « Comptes »), the
 * owner's « A » (#293): on phones « ‹ Comptes » in the top bar, in place of
 * the logo (the menu stays); from `md` up a rounded chip above the title.
 * The server renders the chip (hidden below md); it moves into the top bar
 * once hydrated, like the page actions.
 */
export function PageBack({ label, to, params, search }: PageBackLink) {
  const isMobile = useIsMobile()
  const slot = usePageBackSlot()
  const link = { to, params, search } as LinkProps

  if (isMobile && slot !== null) {
    return createPortal(
      <Link
        {...link}
        className="text-primary hover:bg-muted/60 focus-visible:ring-ring/50 flex h-11 min-w-0 items-center gap-0.5 rounded-lg pr-2 pl-1 text-base font-medium outline-none focus-visible:ring-[3px]"
      >
        <ChevronLeftIcon aria-hidden className="size-6 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>,
      slot,
    )
  }
  return (
    <Link
      {...link}
      className="bg-muted text-foreground hover:bg-muted/70 focus-visible:ring-ring/50 relative inline-flex h-9 w-fit items-center gap-1 rounded-full pr-3.5 pl-2 text-sm font-medium outline-none focus-visible:ring-[3px] pointer-coarse:touch-hitbox max-md:hidden"
    >
      <ChevronLeftIcon aria-hidden className="size-4" />
      {label}
    </Link>
  )
}
