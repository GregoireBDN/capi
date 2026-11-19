import { SegmentedControl, SegmentedControlItem } from '@finances/ui'
import { useId } from 'react'
import { formatCents } from '#/lib/money'
import { PREPAID_TERMS, prepaidMonthlyCents } from './format'

const NONE = 'none'

interface PrepaidTermControlProps {
  /** Term in months, null for « Non » (only offered with `allowNone`). */
  value: number | null
  onChange: (value: number | null) => void
  /** Offers « Non »: an item charged every period. */
  allowNone?: boolean
  /** The upfront payment, positive cents: previews the monthly cost. */
  amountCents?: number
  label?: string
}

/**
 * The term of a prepaid subscription (#314): 12, 24 or 36 months (a term
 * set otherwise is offered too), one segmented choice, with the monthly
 * equivalent it gives under it.
 */
export function PrepaidTermControl({
  value,
  onChange,
  allowNone = false,
  amountCents,
  label = 'Payé d’avance pour',
}: PrepaidTermControlProps) {
  const id = useId()
  const terms: number[] = [...PREPAID_TERMS]
  if (value !== null && !terms.includes(value)) {
    terms.push(value)
    terms.sort((a, b) => a - b)
  }
  return (
    <div className="space-y-1.5">
      <p id={`${id}-label`} className="text-sm font-medium">
        {label}
      </p>
      <SegmentedControl
        aria-labelledby={`${id}-label`}
        fullWidth
        value={value === null ? NONE : String(value)}
        onValueChange={(next) => onChange(next === NONE ? null : Number(next))}
      >
        {allowNone && (
          <SegmentedControlItem value={NONE}>Non</SegmentedControlItem>
        )}
        {terms.map((term) => (
          <SegmentedControlItem key={term} value={String(term)}>
            {term} mois
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <p className="text-muted-foreground text-xs tabular-nums">
        {value === null
          ? 'Prélevé à chaque période.'
          : amountCents !== undefined
            ? `${formatCents(prepaidMonthlyCents(amountCents, value))} / mois : ${formatCents(amountCents)} ÷ ${value} mois, payés en une fois.`
            : `Payé en une fois pour ${value} mois.`}
      </p>
    </div>
  )
}
