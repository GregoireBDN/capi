import { Button } from '@finances/ui'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { ChevronLeftIcon } from 'lucide-react'

/** Where a sub-page goes back to (`PageHeader`'s `back`). */
export interface PageBackLink {
  /** The parent page's name, e.g. « Comptes ». */
  label: string
  to: LinkProps['to']
  params?: LinkProps['params']
  search?: LinkProps['search']
}

/**
 * The way back from a sub-page, the one back link of the app (#324, the
 * Réglages look the owner chose): « ‹ Réglages », « ‹ Épargne »… on its own
 * line above the page title, on phones as on wide pages. It goes into the
 * page's top padding (`py-6 md:py-10` in `_app.tsx`), so the title stays
 * where it is on the other pages: render it first on the page.
 */
export function PageBack({ label, to, params, search }: PageBackLink) {
  const link = { to, params, search } as LinkProps
  return (
    <div className="-mt-4 mb-2 flex md:-mt-6">
      <Button asChild variant="secondary" ghost size="sm" className="-ml-2">
        <Link {...link}>
          <ChevronLeftIcon aria-hidden />
          {label}
        </Link>
      </Button>
    </div>
  )
}
