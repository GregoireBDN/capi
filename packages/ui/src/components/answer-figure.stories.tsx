import type { Meta, StoryObj } from '@storybook/react-vite'
import { InboxIcon, TargetIcon, WalletIcon } from 'lucide-react'

import { AnswerFigure } from './answer-figure'
import { Button } from './button'

const meta = {
  title: 'Display/AnswerFigure',
  component: AnswerFigure,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The one big figure at the top of a page that answers its question (#434): Mouvements’ « Gardé ce mois », Opérations’ « À revoir », Budget’s « Reste à dépenser ». What explains it goes inside, under the figure.',
      },
    },
  },
  args: {
    icon: <WalletIcon />,
    label: 'Gardé ce mois',
    value: '430 €',
    tone: 'good',
  },
  render: (args) => (
    <div className="w-[min(24rem,90vw)]">
      <AnswerFigure {...args} />
    </div>
  ),
} satisfies Meta<typeof AnswerFigure>

export default meta
type Story = StoryObj<typeof meta>

export const Good: Story = {}

export const Bad: Story = {
  args: { label: 'Pris sur le compte courant', value: '−120 €', tone: 'bad' },
}

export const Warning: Story = {
  args: {
    icon: <InboxIcon />,
    label: 'À revoir',
    value: '5',
    tone: 'warning',
    children: <Button className="w-full">Revoir</Button>,
  },
}

export const Neutral: Story = {
  args: {
    icon: <TargetIcon />,
    label: 'Reste à dépenser',
    value: '218 €',
    tone: 'neutral',
  },
}
