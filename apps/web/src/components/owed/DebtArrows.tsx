import { cn } from '@capi/ui'
import { ArrowLeftIcon, ArrowRightIcon, UserIcon } from 'lucide-react'
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
 * The owner and someone face to face (#484), one arrow per direction with its
 * amount: green towards the owner (« X vous doit »), orange towards them
 * (« vous lui devez »). An empty direction stays, faded, so before and after
 * an offset read alike. Screen readers get one sentence instead.
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
  return (
    <div className="flex items-center gap-2">
      <span className="sr-only">
        {name} vous doit {formatCents(owedToMeCents)}, vous lui devez{' '}
        {formatCents(iOweCents)}.
      </span>
      <span
        aria-hidden
        className="bg-primary text-primary-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-full"
      >
        <UserIcon className="size-4" />
      </span>
      <div aria-hidden className="flex min-w-0 flex-1 flex-col gap-1">
        <Arrow
          direction="in"
          cents={owedToMeCents}
          label={`${name} vous doit`}
        />
        <Arrow direction="out" cents={iOweCents} label="vous lui devez" />
      </div>
      <ContactAvatar name={name} />
    </div>
  )
}

function Arrow({
  direction,
  cents,
  label,
}: {
  direction: 'in' | 'out'
  cents: number
  label: string
}) {
  const line = cn(
    'h-1 min-w-3 flex-1 rounded-full',
    direction === 'in' ? 'bg-emerald-500' : 'bg-orange-500',
    cents === 0 && 'opacity-20',
  )
  return (
    <div
      className={cn('flex flex-col items-center', cents === 0 && 'opacity-40')}
    >
      <div className="flex w-full items-center gap-1.5">
        <span className={line} />
        <span
          className={cn(
            'inline-flex items-center gap-0.5 text-sm font-semibold whitespace-nowrap tabular-nums',
            direction === 'in' ? OWED_TONE : OWE_TONE,
          )}
        >
          {direction === 'in' && <ArrowLeftIcon className="size-4" />}
          {shortCents(cents)}
          {direction === 'out' && <ArrowRightIcon className="size-4" />}
        </span>
        <span className={line} />
      </div>
      <span className="text-muted-foreground max-w-full truncate text-[0.6rem] leading-tight">
        {label}
      </span>
    </div>
  )
}
