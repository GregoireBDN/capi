import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@capi/ui'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageHeader } from './PageHeader'

interface PlaceholderPageProps {
  title: string
  icon: LucideIcon
  /** One sentence describing what the page will contain. */
  description: string
  /** Optional content shown above the empty state (e.g. a banner). */
  children?: ReactNode
}

/** Temporary page body for sections that are not built yet. */
export function PlaceholderPage({
  title,
  icon: Icon,
  description,
  children,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      {children}
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>Bientôt disponible</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
