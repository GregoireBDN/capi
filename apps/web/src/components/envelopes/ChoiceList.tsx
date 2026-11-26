import { cn, SETTING_GROUP_CLASS, SETTING_ROW_CLASS } from '@capi/ui'
import { CheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface Choice {
  id: string
  icon: ReactNode
  label: string
  /** On the right: an amount, a share. */
  value?: ReactNode
  disabled?: boolean
}

/**
 * A single choice among a few rows (an envelope, « libre », an account): the
 * Réglages rows, ✓ on the chosen one.
 */
export function ChoiceList({
  label,
  choices,
  value,
  onChange,
}: {
  label: string
  choices: readonly Choice[]
  value: string | null
  onChange: (id: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className={SETTING_GROUP_CLASS}>
      {choices.map((choice) => {
        const current = choice.id === value
        return (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={current}
            disabled={choice.disabled}
            onClick={() => onChange(choice.id)}
            className={cn(
              SETTING_ROW_CLASS,
              'gap-2.5 disabled:opacity-50',
              current &&
                'bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))]',
            )}
          >
            {choice.icon}
            <span className="min-w-0 flex-1 truncate py-2 text-left">
              {choice.label}
            </span>
            {choice.value !== undefined && (
              <span className="text-muted-foreground shrink-0 whitespace-nowrap tabular-nums">
                {choice.value}
              </span>
            )}
            <CheckIcon
              aria-hidden="true"
              className={cn(
                'text-primary size-[0.8rem] shrink-0',
                !current && 'invisible',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
