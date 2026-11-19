import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { AmountField } from './AmountField'
import type { AmountSign } from './signed-amount'
import { useSignedText } from './use-signed-text'

function Signed({ initial = '' }: { initial?: string }) {
  const [amount, setAmount] = useState(initial)
  const [sign, setSign] = useState<AmountSign>('out')
  return (
    <>
      <AmountField
        aria-label="Montant"
        value={amount}
        onValueChange={(typed, typedSign) => {
          setAmount(typed)
          if (typedSign) setSign(typedSign)
        }}
        sign={sign}
        onSignChange={setSign}
      />
      <output>{`${sign} ${amount}`}</output>
    </>
  )
}

function Unsigned() {
  const [amount, setAmount] = useState('')
  return (
    <AmountField
      aria-label="Montant"
      value={amount}
      onValueChange={setAmount}
    />
  )
}

function SignedText() {
  const [text, setText] = useState('')
  const field = useSignedText(text, setText)
  return (
    <>
      <AmountField aria-label="Montant" {...field} />
      <output>{text}</output>
    </>
  )
}

describe('AmountField (#326)', () => {
  it('opens the decimal pad and refuses what is not an amount', async () => {
    const user = userEvent.setup()
    render(<Unsigned />)
    const input = screen.getByLabelText('Montant')
    expect(input).toHaveAttribute('inputMode', 'decimal')
    await user.type(input, 'a1b2.5x6')
    expect(input).toHaveValue('12,56')
    await user.type(input, '7')
    expect(input).toHaveValue('12,56')
  })

  it('never takes a minus when unsigned', async () => {
    const user = userEvent.setup()
    render(<Unsigned />)
    const input = screen.getByLabelText('Montant')
    await user.type(input, '-5')
    expect(input).toHaveValue('5')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('flips the sign with its button, and reads a typed sign', async () => {
    const user = userEvent.setup()
    render(<Signed initial="12,5" />)
    const sign = screen.getByRole('button', { name: 'Montant négatif' })
    expect(sign).toHaveAttribute('aria-pressed', 'true')
    expect(sign).toHaveTextContent('−')
    await user.click(sign)
    expect(screen.getByRole('status')).toHaveTextContent('in 12,5')
    expect(sign).toHaveTextContent('+')

    const input = screen.getByLabelText('Montant')
    await user.clear(input)
    await user.type(input, '-40')
    expect(input).toHaveValue('40')
    expect(screen.getByRole('status')).toHaveTextContent('out 40')
  })

  it('keeps signed text for a signed parser, the sign waiting for its amount', async () => {
    const user = userEvent.setup()
    render(<SignedText />)
    await user.click(screen.getByRole('button', { name: 'Montant négatif' }))
    expect(screen.getByRole('status')).toHaveTextContent(/^$/)
    await user.type(screen.getByLabelText('Montant'), '1200')
    expect(screen.getByRole('status')).toHaveTextContent('-1200')
    await user.click(screen.getByRole('button', { name: 'Montant négatif' }))
    expect(screen.getByRole('status')).toHaveTextContent(/^1200$/)
  })
})
