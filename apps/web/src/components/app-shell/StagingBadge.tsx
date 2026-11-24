import { cn } from '@capi/ui'

/**
 * « Staging » beside the app's name on the staging deployment (#454), in the
 * yellow bar (`env-banner`): the colour tells at a glance, the word says it.
 */
export function StagingBadge({ className }: { className?: string }) {
  return (
    <span
      data-testid="staging-badge"
      className={cn(
        'shrink-0 rounded-md border border-current/30 px-1.5 py-0.5 text-[0.6rem] leading-none font-semibold tracking-wide whitespace-nowrap uppercase',
        className,
      )}
    >
      Staging
    </span>
  )
}
