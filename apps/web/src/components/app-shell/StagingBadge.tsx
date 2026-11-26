import { cn } from '@capi/ui'
import { FlaskConicalIcon } from 'lucide-react'

/**
 * Staging's badge beside the app's name (#454), in the yellow bar
 * (`env-banner`): a flask in a round emerald disc, a gradient with a sheen on
 * top and a soft shadow of its colour (the owner's « 3 · Émeraude », #504).
 * The colour tells at a glance; the word is there for screen readers.
 */
export function StagingBadge({ className }: { className?: string }) {
  return (
    <span
      data-testid="staging-badge"
      title="Staging"
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#34d399,#0d9488)] text-white shadow-[0_4px_12px_-4px_rgb(13_148_136/70%),inset_0_1px_0_rgb(255_255_255/35%)]',
        className,
      )}
    >
      <FlaskConicalIcon
        aria-hidden
        className="size-[0.8rem]"
        strokeWidth={2.4}
      />
      <span className="sr-only">Staging</span>
    </span>
  )
}
