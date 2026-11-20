import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
} from 'lucide-react'
import * as React from 'react'
import { expect, within } from 'storybook/test'

import { ChoiceTiles } from './choice-tiles'

const meta = {
  title: 'Forms/ChoiceTiles',
  component: ChoiceTiles,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One choice among a few, shown big (#396, the owner’s « A. Tuiles »): equal pastel tiles without border, an icon over a short name, the chosen one tinted with its colour. Radio semantics: an arrow key moves to the next tile and chooses it.',
      },
    },
  },
  args: { options: [], value: '', onValueChange: () => {} },
} satisfies Meta<typeof ChoiceTiles>

export default meta
type Story = StoryObj<typeof meta>

const KINDS = [
  {
    value: 'expense',
    label: 'Dépense',
    icon: <ArrowUpRightIcon />,
    color: '#d97706',
  },
  {
    value: 'income',
    label: 'Revenu',
    icon: <ArrowDownLeftIcon />,
    color: '#16a34a',
  },
  {
    value: 'transfer',
    label: 'Virement',
    icon: <ArrowLeftRightIcon />,
    color: '#0284c7',
  },
] as const

function Kinds() {
  const [kind, setKind] = React.useState<string>('expense')
  return (
    <div className="max-w-sm">
      <ChoiceTiles
        aria-label="Type"
        options={KINDS}
        value={kind}
        onValueChange={setKind}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <Kinds />,
  play: async ({ canvasElement, userEvent, step }) => {
    const canvas = within(canvasElement)
    await step('A tap chooses a tile', async () => {
      await userEvent.click(canvas.getByRole('radio', { name: 'Revenu' }))
      await expect(canvas.getByRole('radio', { name: 'Revenu' })).toBeChecked()
    })
    await step('An arrow key chooses the next one', async () => {
      await userEvent.keyboard('{ArrowRight}')
      await expect(
        canvas.getByRole('radio', { name: 'Virement' }),
      ).toBeChecked()
    })
  },
}
