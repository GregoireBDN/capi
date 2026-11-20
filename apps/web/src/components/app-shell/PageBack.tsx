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
 * The way back from a sub-page, the one back link of the app (the owner's
 * « A », #293, kept for every page in #324: accounts and the settings
 * screens): « ‹ Comptes » in the header (`AppHeader`, #386), in place of the
 * logo on phones and after it from `md` up. The server renders it visually
 * hidden (still reachable without JavaScript); it moves into the header once
 * hydrated, like the page actions. Render it first on the page.
 */
export function PageBack({ label, to, params, search }: PageBackLink) {
  const slot = usePageBackSlot()
  const link = { to, params, search } as LinkProps

  if (slot !== null) {
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
      className="focus:bg-background focus:text-primary sr-only focus:not-sr-only focus:mb-3 focus:inline-flex focus:rounded-lg focus:px-2 focus:py-1"
    >
      <span aria-hidden>‹ </span>
      {label}
    </Link>
  )
}
