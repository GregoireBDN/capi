import { cn } from '@capi/ui'
import { UserIcon } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import { formatCents, formatWholeEuros } from '#/lib/money'
import { ContactAvatar } from './ContactAvatar'

/** « 10 € », « 12,50 € »: no « ,00 » beside an arrow. */
export function shortCents(cents: number): string {
  return cents % 100 === 0 ? formatWholeEuros(cents) : formatCents(cents)
}

/** Green: comes to the owner; orange: goes from the owner (#484). */
export const OWED_TONE = 'text-emerald-700 dark:text-emerald-400'
export const OWE_TONE = 'text-orange-700 dark:text-orange-400'

/**
 * The owner and someone face to face (#484, the owner's « B. Les flèches »):
 * two curved arrows between them, green on top towards the owner (« Sam vous
 * doit »), orange below towards them (« vous lui devez »), each as thick as
 * its share of the two and with its amount in a pill on the curve. An empty
 * direction stays, dashed and faded, so after an offset one arrow is left.
 * Screen readers get one sentence instead.
 */
export function DebtArrows({
  name,
  owedToMeCents,
  iOweCents,
}: {
  name: string
  owedToMeCents: number
  iOweCents: number
}) {
  const id = useId()
  const max = Math.max(owedToMeCents, iOweCents, 1)
  const width = (cents: number) => (cents === 0 ? 2.5 : 4 + (5 * cents) / max)
  return (
    <div className="flex items-center gap-1">
      <span className="sr-only">
        {name} vous doit {formatCents(owedToMeCents)}, vous lui devez{' '}
        {formatCents(iOweCents)}.
      </span>
      <Person label="Vous">
        <span className="bg-primary text-primary-foreground inline-flex size-10 items-center justify-center rounded-full">
          <UserIcon className="size-5" />
        </span>
      </Person>
      <div aria-hidden className="relative min-w-0 flex-1 py-3">
        <svg
          viewBox="0 0 200 130"
          className="block h-auto w-full overflow-visible"
        >
          <defs>
            {(['in', 'out'] as const).map((direction) => (
              <marker
                key={direction}
                id={`${id}-${direction}`}
                viewBox="0 0 10 10"
                refX="3"
                refY="5"
                markerWidth="3"
                markerHeight="3"
                markerUnits="strokeWidth"
                orient="auto"
              >
                <path
                  d="M1 1 L9 5 L1 9 Q3 5 1 1 Z"
                  className={direction === 'in' ? IN_FILL : OUT_FILL}
                />
              </marker>
            ))}
          </defs>
          <path
            d="M192 58 Q100 -6 10 58"
            fill="none"
            strokeLinecap="round"
            strokeWidth={width(owedToMeCents)}
            strokeDasharray={owedToMeCents === 0 ? '4 6' : undefined}
            markerEnd={owedToMeCents === 0 ? undefined : `url(#${id}-in)`}
            className={cn(IN_STROKE, owedToMeCents === 0 && 'opacity-30')}
          />
          <path
            d="M8 72 Q100 136 186 76"
            fill="none"
            strokeLinecap="round"
            strokeWidth={width(iOweCents)}
            strokeDasharray={iOweCents === 0 ? '4 6' : undefined}
            markerEnd={iOweCents === 0 ? undefined : `url(#${id}-out)`}
            className={cn(OUT_STROKE, iOweCents === 0 && 'opacity-30')}
          />
        </svg>
        <Pill
          direction="in"
          cents={owedToMeCents}
          label={`${name} vous doit`}
          className="top-[20%]"
        />
        <Pill
          direction="out"
          cents={iOweCents}
          label="vous lui devez"
          className="top-[80%]"
        />
      </div>
      <Person label={name}>
        <ContactAvatar name={name} className="size-10 text-sm" />
      </Person>
    </div>
  )
}

const IN_STROKE = 'stroke-emerald-500'
const OUT_STROKE = 'stroke-orange-500'
const IN_FILL = 'fill-emerald-500'
const OUT_FILL = 'fill-orange-500'

function Person({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex w-12 shrink-0 flex-col items-center gap-1"
    >
      {children}
      <span className="text-muted-foreground max-w-full truncate text-xs">
        {label}
      </span>
    </span>
  )
}

/** The amount on its curve, its few words on the outer side. */
function Pill({
  direction,
  cents,
  label,
  className,
}: {
  direction: 'in' | 'out'
  cents: number
  label: string
  className: string
}) {
  return (
    <span
      className={cn(
        'absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5',
        direction === 'in' ? 'flex-col-reverse' : 'flex-col',
        className,
      )}
    >
      <span
        className={cn(
          'ring-card rounded-full px-2 py-px text-sm font-semibold whitespace-nowrap tabular-nums ring-4',
          direction === 'in'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            : 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
          cents === 0 && 'opacity-50',
        )}
      >
        {shortCents(cents)}
      </span>
      <span
        className={cn(
          'text-muted-foreground absolute text-[0.6rem] leading-none whitespace-nowrap',
          direction === 'in' ? 'bottom-full mb-1' : 'top-full mt-1',
          cents === 0 && 'opacity-50',
        )}
      >
        {label}
      </span>
    </span>
  )
}
