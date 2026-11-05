'use client'

import * as React from 'react'

import { cn } from '../../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type SparklineProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  /** Values in chronological order (any unit, e.g. cents). */
  data: ReadonlyArray<number>
  /** Accessible description, e.g. "Patrimoine net sur 12 mois, en hausse". */
  label: string
  /** Line colour (default: de-emphasised `--chart-target`). */
  color?: string
  /** Colour of the current-period dot (default `--chart-1`). */
  accentColor?: string
  /** Height in px (default `32`). Width follows the container. */
  height?: number
  /** Adds a light wash under the line. */
  area?: boolean
}

/* ============================================================================
 * CONSTANTS
 * ========================================================================= */

/** Vertical room for the end dot (r=3) and its ring. */
const PADDING = 4

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * Sparkline
 * Tiny inline trend with no axes: the line in a de-emphasised hue, the
 * current period as an accent dot. Plain SVG — renders identically on the
 * server, no measuring, no layout shift.
 *
 * @example
 * <Sparkline data={[120, 135, 128, 150]} label="Épargne sur 4 mois, en hausse" />
 */
function Sparkline({
  data,
  label,
  color = 'var(--chart-target)',
  accentColor = 'var(--chart-1)',
  height = 32,
  area = false,
  className,
  style,
  ...props
}: SparklineProps) {
  const gradientId = React.useId()
  const values = data.filter((value) => Number.isFinite(value))

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const usable = height - PADDING * 2

  const points = values.map((value, position) => ({
    x: values.length > 1 ? (position / (values.length - 1)) * 100 : 100,
    y:
      PADDING + (span === 0 ? usable / 2 : (1 - (value - min) / span) * usable),
  }))
  const last = points[points.length - 1]
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <div
      data-slot="sparkline"
      role="img"
      aria-label={label}
      className={cn('w-full min-w-0 px-1', className)}
      style={style}
      {...props}
    >
      <div className="relative w-full" style={{ height }}>
        {points.length > 1 ? (
          <svg
            aria-hidden
            className="absolute inset-0 size-full overflow-visible"
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
          >
            {area ? (
              <>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <polygon
                  points={`0,${height} ${line} 100,${height}`}
                  fill={`url(#${gradientId})`}
                />
              </>
            ) : null}
            <polyline
              points={line}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
        {last ? (
          <span
            aria-hidden
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-(--chart-surface)"
            style={{
              left: `${last.x}%`,
              top: last.y,
              backgroundColor: accentColor,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { Sparkline, type SparklineProps }
