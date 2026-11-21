import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@finances/ui'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
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
 * The way back of every page under a layout that has one (the settings
 * screens: « Réglages »), for its `PageHeader`s without a `back` of their own.
 */
const DefaultPageBackContext = createContext<PageBackLink | undefined>(
  undefined,
)

export function DefaultPageBack({
  back,
  children,
}: {
  back: PageBackLink | undefined
  children: ReactNode
}) {
  return (
    <DefaultPageBackContext.Provider value={back}>
      {children}
    </DefaultPageBackContext.Provider>
  )
}

export function useDefaultPageBack(): PageBackLink | undefined {
  return useContext(DefaultPageBackContext)
}

/**
 * The way back from a sub-page, the one back link of the app (#293, #324),
 * a breadcrumb since #404 (the owner's « A »): « Comptes › Compte courant »
 * in the header after the logo from `md` up, the parent a link and the page
 * as text; on phones « ‹ Comptes » in place of the logo, the page's title
 * right below saying where you are (`Breadcrumb` `backOnPhones`). The page's
 * title is unchanged. The server renders the link visually hidden (still
 * reachable without JavaScript); it moves into the header once hydrated,
 * like the page actions. Rendered first by `PageHeader`.
 */
export function PageBack({
  label,
  to,
  params,
  search,
  current,
}: PageBackLink & {
  /** The page shown, the breadcrumb's last step (the page's title). */
  current: string
}) {
  const slot = usePageBackSlot()
  const link = { to, params, search } as LinkProps

  if (slot !== null) {
    return createPortal(
      <Breadcrumb backOnPhones>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link {...link}>{label}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{current}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
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
