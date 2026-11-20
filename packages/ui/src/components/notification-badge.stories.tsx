import type { Meta, StoryObj } from '@storybook/react-vite'
import { EllipsisVerticalIcon, ChartPieIcon } from 'lucide-react'

import { Button } from './button'
import {
  CountPill,
  NotificationCount,
  NotificationDot,
} from './notification-badge'

const meta = {
  title: 'Display/Notification badge',
  component: NotificationCount,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'What waits behind a control, the same everywhere: a number astride the rounded top-right corner of a chip or a button (`NotificationCount`), a dot at the same place on an icon button (`NotificationDot`), a number in a row (`CountPill`). White on the primary colour; the label is read after the control’s own name.',
      },
    },
  },
  args: { value: 7, label: '7 opérations à revoir' },
} satisfies Meta<typeof NotificationCount>

export default meta
type Story = StoryObj<typeof meta>

/** On a filter chip: a full pill 44px high, so the default `radius`. */
export const OnAChip: Story = {
  render: (args) => (
    <div className="p-4">
      <button
        type="button"
        className="border-primary/50 text-primary relative inline-flex min-h-8 items-center rounded-full border px-3 text-sm font-medium"
      >
        À revoir
        <NotificationCount {...args} />
      </button>
    </div>
  ),
}

/** Past 99, « 99+ ». */
export const Large: Story = {
  args: { value: 128, label: '128 opérations à revoir' },
  render: OnAChip.render,
}

/** On an icon button: the dot, astride the same corner. */
export const DotOnAnIconButton: Story = {
  render: () => (
    <div className="flex gap-4 p-4">
      <Button
        variant="secondary"
        iconOnly
        aria-label="Actions de la page"
        className="relative [&_svg]:size-[1.1rem]"
      >
        <EllipsisVerticalIcon />
        <NotificationDot label="7 opérations à revoir" />
      </Button>
      <div className="bg-primary/12 text-primary relative flex size-8 items-center justify-center rounded-md [&_svg]:size-[1.1rem]">
        <ChartPieIcon aria-hidden />
        <NotificationDot radius="var(--radius-md)" />
      </div>
    </div>
  ),
}

/** In a row: a menu item, a sidebar entry. */
export const InARow: Story = {
  render: (args) => (
    <div className="flex w-64 items-center gap-2 rounded-md border p-2 text-sm">
      Voir les opérations
      <CountPill className="ml-auto" value={args.value} label={args.label} />
    </div>
  ),
}
