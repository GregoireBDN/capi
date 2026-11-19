import {
  cn,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@finances/ui'
import type { ComponentProps } from 'react'
import { readAmountInput } from './signed-amount'
import type { AmountSign } from './signed-amount'

type InputProps = Omit<
  ComponentProps<typeof InputGroupInput>,
  'value' | 'onChange' | 'inputMode' | 'type' | 'defaultValue'
>

export interface AmountFieldProps extends InputProps {
  /** The amount as typed, unsigned (« 12,5 »). */
  value: string
  /**
   * With the sign typed or pasted before the amount (« -12 »), if any: the
   * caller applies it. `onSignChange` is only the button.
   */
  onValueChange: (amount: string, typedSign: AmountSign | null) => void
  /**
   * With `onSignChange`, the amount's sign, shown as a « − » / « + » button
   * before it that flips it. Without, the amount is never negative.
   */
  sign?: AmountSign
  onSignChange?: (sign: AmountSign) => void
  /** Largest amount the field takes, in cents (default 1 000 000 €). */
  maxCents?: number
  /** Classes of the group (width); `className` goes to the input. */
  groupClassName?: string
}

/**
 * Every euro amount typed in the app (#326): unsigned text kept exact,
 * read into cents by the caller (`parseEurosToCents`, `signedCents`). It opens
 * the decimal pad on phones and refuses what isn't an amount (letters, a
 * third decimal) by keeping its value. The sign is never typed: a field that
 * takes negatives has a « − » / « + » button; a « - » typed or pasted on a
 * physical keyboard sets it.
 */
export function AmountField({
  value,
  onValueChange,
  sign,
  onSignChange,
  maxCents,
  groupClassName,
  disabled,
  ...props
}: AmountFieldProps) {
  const signed = sign !== undefined && onSignChange !== undefined
  return (
    <InputGroup className={groupClassName} data-disabled={disabled}>
      {signed && (
        <InputGroupAddon align="inline-start">
          <InputGroupButton
            size="icon-xs"
            variant="secondary"
            aria-label="Montant négatif"
            aria-pressed={sign === 'out'}
            title={
              sign === 'out'
                ? 'Sortie d’argent : toucher pour une entrée'
                : 'Entrée d’argent : toucher pour une sortie'
            }
            disabled={disabled}
            className="text-base font-semibold tabular-nums"
            onClick={() => onSignChange(sign === 'out' ? 'in' : 'out')}
          >
            {sign === 'out' ? '−' : '+'}
          </InputGroupButton>
        </InputGroupAddon>
      )}
      <InputGroupInput
        {...props}
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        className={cn('tabular-nums', props.className)}
        value={value}
        onChange={(event) => {
          const read = readAmountInput(event.target.value, maxCents)
          if (read === null) return
          // An unsigned field never takes a minus.
          if (!signed && read.sign === 'out') return
          onValueChange(read.amount, signed ? read.sign : null)
        }}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>€</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}
