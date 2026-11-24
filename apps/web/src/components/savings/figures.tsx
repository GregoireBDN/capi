import { cn, formatWholeEuros } from '@capi/ui'
import type { ReactNode } from 'react'

/**
 * The small pieces of the Épargne page (#407, the owner's « A. Jauge » with
 * far less text): a figure over a two-word label, a label and its figure on
 * one line, a bar of parts. No sentence: a figure says it, or nothing does.
 */

export type Tone = 'good' | 'bad' | 'neutral'

export const TONE_TEXT: Record<Tone, string> = {
  good: 'text-chart-delta-good',
  bad: 'text-chart-delta-bad',
  neutral: 'text-foreground',
}

/** Whole euros with a sign when positive: `+254 €`, `−322 €`, `0 €`. */
export function signedWholeEuros(cents: number): string {
  const text = formatWholeEuros(cents)
  return cents > 0 && /[1-9]/.test(text) ? `+${text}` : text
}

/** Colours of the split bars: savings accounts, then investments. */
export const SAVINGS_COLOR = 'bg-emerald-500'
export const INVESTMENTS_COLOR = 'bg-violet-500'

/** A figure over a two-word label: « +254 € » / « vs cible ». */
export function Stat({
  value,
  label,
  tone = 'neutral',
}: {
  value: ReactNode
  label: ReactNode
  tone?: Tone
}) {
  return (
    <div className="bg-muted/50 @container min-w-0 rounded-lg px-3 py-2">
      <p
        className={cn(
          'text-[clamp(0.85rem,14cqi,1.05rem)] font-semibold whitespace-nowrap tabular-nums',
          TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground text-xs break-normal">{label}</p>
    </div>
  )
}

/** A label and its figure on one line; the figure is never cut. */
export function FigureRow({
  label,
  value,
  tone = 'neutral',
  dot,
}: {
  label: ReactNode
  value: ReactNode
  tone?: Tone
  /** A colour dot before the label, matching a bar's part. */
  dot?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 break-normal">
        {dot && (
          <span
            aria-hidden
            className={cn('size-2 shrink-0 rounded-full', dot)}
          />
        )}
        {label}
      </span>
      <span
        className={cn(
          'font-medium whitespace-nowrap tabular-nums',
          TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** A bar of parts, each its share of `max` (negative parts draw nothing). */
export function SplitBar({
  parts,
  max,
  className,
}: {
  parts: { cents: number; color: string }[]
  max: number
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'bg-muted flex h-2.5 overflow-hidden rounded-full',
        className,
      )}
    >
      {parts.map((part, index) => (
        <span
          key={index}
          className={cn('h-full', part.color)}
          style={{
            width: `${max > 0 ? (Math.max(part.cents, 0) / max) * 100 : 0}%`,
          }}
        />
      ))}
    </div>
  )
}

/** A status in a few words, tinted with its tone (« Cible atteinte »). */
export function StatusChip({
  tone,
  icon,
  children,
}: {
  tone: Tone
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
        tone === 'good' && 'bg-chart-delta-good/12 text-chart-delta-good',
        tone === 'bad' && 'bg-chart-delta-bad/12 text-chart-delta-bad',
        tone === 'neutral' && 'bg-muted text-muted-foreground',
      )}
    >
      {icon}
      {children}
    </span>
  )
}
