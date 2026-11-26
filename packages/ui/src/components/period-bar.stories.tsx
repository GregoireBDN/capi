import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { PeriodBar, PeriodBarLabel } from './period-bar'

/* Synthetic months, formatted like the app's month navigator. */
const LONG = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const SHORT = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const date = (index: number) => new Date(Date.UTC(2026, index, 1))
const long = (index: number) => {
  const text = LONG.format(date(index))
  return text.charAt(0).toUpperCase() + text.slice(1)
}
const short = (index: number) => SHORT.format(date(index))

function MonthBar({ initial = 10 }: { initial?: number }) {
  const [month, setMonth] = useState(initial)
  return (
    <PeriodBar
      aria-label="Mois"
      previous={{
        label: 'Mois précédent',
        disabled: month === 0,
        onClick: () => setMonth(month - 1),
      }}
      next={{
        label: 'Mois suivant',
        disabled: month === 11,
        onClick: () => setMonth(month + 1),
      }}
    >
      <PeriodBarLabel
        aria-label={`${long(month)}, choisir un mois`}
        text={long(month)}
        shortText={short(month)}
      />
    </PeriodBar>
  )
}

/** A frame of a given width, the bar's container, in the header's colours. */
function Frame({ width, label }: { width: number; label: string }) {
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-muted-foreground text-xs">{label}</figcaption>
      <div
        data-frame={width}
        className="@container flex h-12 items-center border-y bg-glass-chrome px-2"
        style={{ width }}
      >
        <MonthBar />
      </div>
    </figure>
  )
}

const meta = {
  title: 'Navigation/PeriodBar',
  component: PeriodBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The month of a month page, part of the app’s frame (#401, the owner’s « B. Barre du mois »): ‹ · 📅 period · ›, flat, 44px targets. It fills its container, the period centred between the arrows, so they never move. The app puts it in a bar at the top of the page’s column, fixed under its header, on every width. The label is a button, ready for `PopoverTrigger asChild`; under 300px of container it takes its short text.',
      },
    },
  },
} satisfies Meta<typeof PeriodBar>

export default meta
type Story = StoryObj<typeof meta>

const noop = () => undefined

export const Default: Story = {
  args: {
    previous: { label: 'Mois précédent', onClick: noop },
    next: { label: 'Mois suivant', onClick: noop },
    children: null,
  },
  render: () => (
    <div className="@container w-[390px] bg-glass-chrome px-2">
      <MonthBar />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Novembre 2026, choisir un mois' }),
    ).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Mois suivant' }))
    await expect(
      canvas.getByRole('button', { name: 'Décembre 2026, choisir un mois' }),
    ).toBeInTheDocument()
    // The latest month: no further.
    await expect(
      canvas.getByRole('button', { name: 'Mois suivant' }),
    ).toBeDisabled()
  },
}

/** Phones and the computer's header: the arrows stay at the edges. */
export const Widths: Story = {
  args: Default.args,
  render: () => (
    <div className="space-y-4">
      <Frame width={320} label="320px (phone)" />
      <Frame width={390} label="390px (phone)" />
      <Frame width={280} label="280px: short label" />
      <Frame width={880} label="Computer: the page column beside the sidebar" />
    </div>
  ),
}
