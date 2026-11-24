import { OptionRow } from '@capi/ui'
import { useId } from 'react'
import { formatCents } from '#/lib/money'
import { PREPAID_TERMS, prepaidMonthlyCents } from './format'

interface PrepaidTermControlProps {
  /** Term in months, null for « Non » (only offered with `allowNone`). */
  value: number | null
  onChange: (value: number | null) => void
  /** Offers « Non »: an item charged every period. */
  allowNone?: boolean
  /** The upfront payment, positive cents: each term shows its monthly cost. */
  amountCents?: number
  label?: string
  /** A line under a term (its renewal date), from its months. */
  detail?: (months: number) => string | undefined
}

/**
 * The term of a prepaid subscription (#314, as a list since #398): 12, 24
 * or 36 months (a term set otherwise is offered too), one row each with
 * what it comes to per month; « Non » first when offered.
 */
export function PrepaidTermControl({
  value,
  onChange,
  allowNone = false,
  amountCents,
  label = 'Payé d’avance pour',
  detail,
}: PrepaidTermControlProps) {
  const id = useId()
  const terms: number[] = [...PREPAID_TERMS]
  if (value !== null && !terms.includes(value)) {
    terms.push(value)
    terms.sort((a, b) => a - b)
  }
  return (
    <div className="space-y-2">
      <p
        id={`${id}-label`}
        className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase"
      >
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className="bg-muted/40 divide-y overflow-hidden rounded-md"
      >
        {allowNone && (
          <OptionRow
            selected={value === null}
            label="Non"
            detail="Prélevé à chaque période"
            onClick={() => onChange(null)}
          />
        )}
        {terms.map((term) => (
          <OptionRow
            key={term}
            selected={value === term}
            label={
              amountCents === undefined ? (
                `${term} mois`
              ) : (
                <span className="flex items-baseline justify-between gap-3">
                  <span>{term} mois</span>
                  <span className="text-muted-foreground text-[15px] font-normal tabular-nums">
                    {formatCents(prepaidMonthlyCents(amountCents, term))} / mois
                  </span>
                </span>
              )
            }
            detail={detail?.(term)}
            onClick={() => onChange(term)}
          />
        ))}
      </div>
    </div>
  )
}
