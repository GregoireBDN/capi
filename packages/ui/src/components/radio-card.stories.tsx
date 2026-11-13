import type { Meta, StoryObj } from '@storybook/react-vite'
import { Building2Icon, WalletIcon } from 'lucide-react'
import { expect, fn } from 'storybook/test'

import { RadioCard, RadioCardGroup } from './radio-card'

const meta = {
  title: 'Forms/RadioCard',
  component: RadioCardGroup,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A choice between a few options shown as selectable cards, built on Radix `RadioGroup`. Lay the cards out with grid classes on `RadioCardGroup`.',
      },
    },
  },
  argTypes: {
    defaultValue: { control: 'text', table: { category: 'State' } },
    disabled: { control: 'boolean', table: { category: 'State' } },
    onValueChange: { table: { category: 'Events' } },
  },
  args: { onValueChange: fn() },
} satisfies Meta<typeof RadioCardGroup>

export default meta
type Story = StoryObj<typeof meta>

/** Two options with an icon, a title and a short explanation. */
export const WithIcons: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <RadioCardGroup
        {...args}
        aria-label="Où sont ces cryptos ?"
        className="grid-cols-2"
      >
        <RadioCard value="exchange">
          <Building2Icon className="text-muted-foreground" aria-hidden />
          <span className="font-medium">Plateforme d’échange</span>
          <span className="text-muted-foreground text-xs">
            Binance, Coinbase…
          </span>
        </RadioCard>
        <RadioCard value="wallet">
          <WalletIcon className="text-muted-foreground" aria-hidden />
          <span className="font-medium">Wallet</span>
          <span className="text-muted-foreground text-xs">
            Ledger, MetaMask…
          </span>
        </RadioCard>
      </RadioCardGroup>
    </div>
  ),
  play: async ({ args, canvas, userEvent }) => {
    const wallet = canvas.getByRole('radio', { name: /^Wallet/ })
    await userEvent.click(wallet)
    await expect(args.onValueChange).toHaveBeenCalledWith('wallet')
    await expect(wallet).toHaveAttribute('data-state', 'checked')
  },
}

/** Compact chips: names only, on a narrow phone (320px). */
export const Chips: Story = {
  args: { defaultValue: 'Ledger' },
  render: (args) => (
    <div className="w-[288px]">
      <RadioCardGroup {...args} aria-label="Wallet" className="grid-cols-2">
        {['Ledger', 'Trezor', 'MetaMask', 'Autre…'].map((name) => (
          <RadioCard
            key={name}
            value={name}
            indicator={false}
            className="items-center justify-center px-3 font-medium"
          >
            {name}
          </RadioCard>
        ))}
      </RadioCardGroup>
    </div>
  ),
  play: async ({ canvas }) => {
    for (const radio of canvas.getAllByRole('radio')) {
      await expect(radio.getBoundingClientRect().height).toBeGreaterThanOrEqual(
        44,
      )
    }
    await expect(canvas.getByRole('radio', { name: 'Ledger' })).toHaveAttribute(
      'data-state',
      'checked',
    )
  },
}
