import { cn } from '@capi/ui/lib/utils'
import { WalletIcon } from 'lucide-react'
import { categoryIconComponent } from '#/components/categories/category-icons'
import { formatWholeEuros } from '#/lib/money'
import { envelopeColor, FREE_COLOR } from './format'

type Size = 'sm' | 'md' | 'lg'

const SIZES: Record<Size, string> = {
  sm: 'size-7 [&_svg]:size-[0.8rem]',
  md: 'size-9 [&_svg]:size-4',
  lg: 'size-14 [&_svg]:size-7',
}

/** An envelope's icon on a tint of its colour (#428). */
export function EnvelopeAvatar({
  envelope,
  size = 'md',
  className,
}: {
  envelope: { icon: string | null; color: string | null }
  size?: Size
  className?: string
}) {
  const color = envelopeColor(envelope)
  const Icon = categoryIconComponent(envelope.icon ?? 'piggy-bank')
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full',
        SIZES[size],
        className,
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
      }}
    >
      <Icon />
    </span>
  )
}

/** « Libre »'s icon: a wallet, muted. */
export function FreeAvatar({
  size = 'md',
  className,
}: {
  size?: Size
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-muted text-muted-foreground grid shrink-0 place-items-center rounded-full',
        SIZES[size],
        className,
      )}
    >
      <WalletIcon />
    </span>
  )
}

/** Stripes of « libre » (and of what is missing). */
export const HATCHED = `repeating-linear-gradient(135deg, color-mix(in srgb, ${FREE_COLOR} 45%, transparent) 0 3px, transparent 3px 6px)`

export interface BarSegment {
  id: string
  label: string
  cents: number
  color: string
  /** « Libre »: hatched. */
  hatched?: boolean
}

/**
 * One stacked bar (#428, « A. Barre et liste »): each envelope in its
 * colour, then « libre » hatched. Negative parts are left out.
 */
export function SplitBar({
  segments,
  tall = false,
  className,
}: {
  segments: readonly BarSegment[]
  tall?: boolean
  className?: string
}) {
  const shown = segments.filter((segment) => segment.cents > 0)
  const total = shown.reduce((sum, segment) => sum + segment.cents, 0)
  return (
    <div
      role="img"
      aria-label={shown
        .map((s) => `${s.label} ${formatWholeEuros(s.cents)}`)
        .join(', ')}
      className={cn(
        'bg-muted flex w-full gap-0.5 overflow-hidden rounded-full',
        tall ? 'h-4' : 'h-2.5',
        className,
      )}
    >
      {total > 0 &&
        shown.map((segment) => (
          <span
            key={segment.id}
            className="h-full min-w-1 first:rounded-l-full last:rounded-r-full"
            style={{
              flexGrow: segment.cents,
              flexBasis: 0,
              background: segment.hatched ? HATCHED : segment.color,
            }}
          />
        ))}
    </div>
  )
}

/** A thin gauge in the envelope's colour, over its target (#428). */
export function Gauge({
  value,
  max,
  color,
  className,
}: {
  value: number
  max: number
  color: string
  className?: string
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-muted h-2.5 w-full overflow-hidden rounded-full',
        className,
      )}
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${ratio * 100}%`, background: color }}
      />
    </div>
  )
}
