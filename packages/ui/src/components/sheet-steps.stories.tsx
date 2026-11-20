import type { Meta, StoryObj } from '@storybook/react-vite'
import { CalendarDaysIcon, EuroIcon, TagIcon } from 'lucide-react'
import * as React from 'react'
import { expect, within } from 'storybook/test'

import { SheetSteps } from './sheet-steps'

const meta = {
  title: 'Overlays/SheetSteps',
  component: SheetSteps,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Where a stepped editor is, under its `SheetBar` on a phone (#385): one round icon per step with its name, linked by a line that fills up to the step shown. A tap opens a step before it or one already reachable; a step that needs an earlier one filled in is greyed out.',
      },
    },
  },
  args: { steps: [], current: '' },
} satisfies Meta<typeof SheetSteps>

export default meta
type Story = StoryObj<typeof meta>

function QuickEntry() {
  const [step, setStep] = React.useState('amount')
  const [amount, setAmount] = React.useState('')
  return (
    <div className="max-w-sm space-y-4">
      <SheetSteps
        current={step}
        onSelect={setStep}
        steps={[
          { key: 'category', label: 'Catégorie', icon: <TagIcon /> },
          { key: 'amount', label: 'Montant', icon: <EuroIcon /> },
          {
            key: 'details',
            label: 'Détails',
            icon: <CalendarDaysIcon />,
            disabled: amount === '',
          },
        ]}
      />
      <button
        type="button"
        className="rounded border px-2 py-1 text-sm"
        onClick={() => setAmount('12,5')}
      >
        Saisir un montant
      </button>
    </div>
  )
}

export const Default: Story = {
  render: () => <QuickEntry />,
  play: async ({ canvasElement, userEvent, step }) => {
    const canvas = within(canvasElement)
    await step('A step ahead waits for the one before', async () => {
      await expect(
        canvas.getByRole('button', { name: '3. Détails' }),
      ).toBeDisabled()
    })
    await step('Once reachable, a tap opens it', async () => {
      await userEvent.click(
        canvas.getByRole('button', { name: 'Saisir un montant' }),
      )
      await userEvent.click(canvas.getByRole('button', { name: '3. Détails' }))
      await expect(
        canvas.getByRole('button', { name: '3. Détails' }),
      ).toHaveAttribute('aria-current', 'step')
    })
    await step('A step before stays one tap away', async () => {
      await userEvent.click(
        canvas.getByRole('button', { name: '1. Catégorie, fait' }),
      )
      await expect(
        canvas.getByRole('button', { name: '1. Catégorie' }),
      ).toHaveAttribute('aria-current', 'step')
    })
  },
}
