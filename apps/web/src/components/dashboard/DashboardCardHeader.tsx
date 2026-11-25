import { CardHeader, CardTitle } from '@capi/ui'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface DashboardCardLink {
  label: string
  to: LinkProps['to']
  search?: LinkProps['search']
}

/**
 * The one header of every dashboard card (#262): its title, an optional
 * status under it, and at most one « Voir … › » link to the full page.
 */
export function DashboardCardHeader({
  id,
  title,
  status,
  link,
}: {
  id?: string
  title: ReactNode
  status?: ReactNode
  link?: DashboardCardLink
}) {
  return (
    <CardHeader className="flex flex-row items-start gap-x-3">
      <div className="min-w-0 flex-1">
        <CardTitle id={id}>{title}</CardTitle>
        {status && (
          <p className="text-muted-foreground mt-0.5 text-sm">{status}</p>
        )}
      </div>
      {link && <SeeLink {...link} />}
    </CardHeader>
  )
}

/** « Budget › »: the quiet link to a card's full page. */
export function SeeLink({ label, to, search }: DashboardCardLink) {
  return (
    <Link
      to={to}
      search={search as never}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring relative inline-flex shrink-0 items-center gap-0.5 rounded-sm text-sm font-medium whitespace-nowrap outline-none pointer-coarse:touch-hitbox focus-visible:ring-2"
    >
      {label}
      <ChevronRightIcon aria-hidden className="size-4" />
    </Link>
  )
}
