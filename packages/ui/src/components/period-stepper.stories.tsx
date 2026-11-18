import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { PeriodStepper, PeriodStepperLabel } from './period-stepper'

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
const MONTHS = Array.from({ length: 12 }, (_, index) => index)

function MonthStepper({ initial = 4 }: { initial?: number }) {
  const [month, setMonth] = useState(initial)
  return (
    <PeriodStepper
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
      <PeriodStepperLabel
        aria-label={`${long(month)}, choisir un mois`}
        text={long(month)}
        shortText={short(month)}
        sizers={MONTHS.map(long)}
        shortSizers={MONTHS.map(short)}
      />
    </PeriodStepper>
  )
}

/** A frame of a given width that is the stepper's container. */
function Frame({ width, label }: { width: number; label: string }) {
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-muted-foreground text-xs">{label}</figcaption>
      <div
        data-frame={width}
        className="@container border-border/60 rounded-xl border border-dashed p-2"
        style={{ width }}
      >
        <MonthStepper />
      </div>
    </figure>
  )
}

const meta = {
  title: 'Navigation/PeriodStepper',
  component: PeriodStepper,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One box ‹ | period | ›, 44px high, used by the month navigator of every month page (#263). It is laid out by its **container** (`@container`), never the viewport: under 420px the label takes its short text. The box is as wide as its content at every width. `sizers` keep the label as wide as its widest value, so the arrows stay in place from one month to the next. The middle segment is a button, ready for `PopoverTrigger asChild`.',
      },
    },
  },
  render: () => <MonthStepper />,
} satisfies Meta<typeof PeriodStepper>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {
  args: {
    previous: { label: 'Mois précédent', onClick: () => {} },
    next: { label: 'Mois suivant', onClick: () => {} },
    children: null,
  },
  render: () => (
    <div className="@container w-[36rem] max-w-full">
      <MonthStepper />
    </div>
  ),
}

const WIDTHS = [
  { width: 360, label: '< 420px : libellé court' },
  { width: 480, label: '≥ 420px : libellé complet' },
  { width: 640, label: 'Large : même taille' },
]

function Widths() {
  return (
    <div className="space-y-4">
      {WIDTHS.map((frame) => (
        <Frame key={frame.width} {...frame} />
      ))}
    </div>
  )
}

/** The three layouts, light. The play test checks that the arrows stay put. */
export const ContainerWidths: Story = {
  args: Playground.args,
  render: () => <Widths />,
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector<HTMLElement>('[data-frame="640"]')
    if (!frame) throw new Error('No 640px frame')
    // Measure once the web font is in: it changes the label's width.
    await document.fonts.ready
    const next = within(frame).getByRole('button', { name: 'Mois suivant' })
    const x = next.getBoundingClientRect().x
    // Mai → Septembre: the label keeps the widest month's width.
    for (let step = 0; step < 4; step++) await userEvent.click(next)
    await expect(
      within(frame).getByRole('button', {
        name: 'Septembre 2026, choisir un mois',
      }),
    ).toBeInTheDocument()
    await expect(next.getBoundingClientRect().x).toBe(x)
  },
}

export const ContainerWidthsDark: Story = {
  args: Playground.args,
  globals: { theme: 'dark' },
  render: () => <Widths />,
}

export const Disabled: Story = {
  args: Playground.args,
  render: () => (
    <div className="@container w-[36rem] max-w-full">
      <PeriodStepper
        aria-label="Mois"
        previous={{
          label: 'Mois précédent',
          disabled: true,
          onClick: () => {},
        }}
        next={{ label: 'Mois suivant', disabled: true, onClick: () => {} }}
      >
        <PeriodStepperLabel
          aria-label="Toutes les dates, choisir un mois"
          text="Toutes les dates"
        />
      </PeriodStepper>
    </div>
  ),
}
