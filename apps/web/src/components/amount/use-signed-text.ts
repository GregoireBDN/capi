import { useState } from 'react'
import type { AmountSign } from './signed-amount'

/**
 * `AmountField` props for an amount kept as signed text (« -1200 »), read by
 * a signed parser such as `parseAmountToCents`: the rare negative (net
 * contributions after withdrawals) is the field's « − », never a typed
 * « - » (#326). The sign chosen on an empty field waits for its amount.
 */
export function useSignedText(
  text: string,
  onTextChange: (text: string) => void,
) {
  const [emptySign, setEmptySign] = useState<AmountSign>('in')
  const negative = /^[-−]/.test(text)
  const amount = negative ? text.slice(1) : text
  const sign: AmountSign = amount === '' ? emptySign : negative ? 'out' : 'in'
  const join = (typed: string, with_: AmountSign) =>
    with_ === 'out' && typed !== '' ? `-${typed}` : typed
  return {
    value: amount,
    sign,
    onValueChange: (typed: string, typedSign: AmountSign | null) => {
      if (typedSign) setEmptySign(typedSign)
      onTextChange(join(typed, typedSign ?? sign))
    },
    onSignChange: (next: AmountSign) => {
      setEmptySign(next)
      onTextChange(join(amount, next))
    },
  }
}
