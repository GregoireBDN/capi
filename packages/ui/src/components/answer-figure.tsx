import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type AnswerTone = 'good' | 'bad' | 'warning' | 'neutral'

type AnswerFigureProps = Omit<React.ComponentProps<'section'>, 'children'> & {
  /** A lucide icon, shown white on a disk of the tone's colour. */
  icon: React.ReactNode
  /** A few words naming the figure: « Gardé ce mois », « Reste ». */
  label: React.ReactNode
  /** The figure itself, already formatted. Never wraps. */
  value: React.ReactNode
  /** Its colour: green, red, amber, or the text's. */
  tone?: AnswerTone
  /** What goes under the figure: a bar, chips, a button. */
  children?: React.ReactNode
}

const TONE: Record<AnswerTone, { disk: string; text: string }> = {
  good: { disk: 'bg-chart-delta-good', text: 'text-chart-delta-good' },
  bad: { disk: 'bg-chart-delta-bad', text: 'text-chart-delta-bad' },
  warning: { disk: 'bg-warning', text: 'text-foreground' },
  neutral: { disk: 'bg-primary', text: 'text-foreground' },
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * Answer Figure
 * The one big figure at the top of a page that answers its question
 * (#434, the owner's « A. Le chiffre réponse »): an icon, a few words, the
 * figure, then what explains it. One per page; the page's other figures
 * stay smaller below it.
 */
function AnswerFigure({
  icon,
  label,
  value,
  tone = 'neutral',
  className,
  children,
  ...props
}: AnswerFigureProps) {
  return (
    <section
      data-slot="answer-figure"
      className={cn(
        'glass-card text-card-foreground @container rounded-card space-y-3 p-4',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-full text-white [&_svg]:size-5',
            tone === 'warning' && 'text-warning-foreground',
            TONE[tone].disk,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm break-normal">{label}</p>
          <p
            data-slot="answer-figure-value"
            className={cn(
              'text-[clamp(1.25rem,11cqi,1.875rem)] leading-tight font-semibold whitespace-nowrap tabular-nums',
              TONE[tone].text,
            )}
          >
            {value}
          </p>
        </div>
      </div>
      {children}
    </section>
  )
}

export { AnswerFigure, type AnswerFigureProps, type AnswerTone }
