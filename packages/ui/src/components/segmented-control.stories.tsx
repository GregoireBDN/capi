import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'

import { SegmentedControl, SegmentedControlItem } from './segmented-control'

type Comparison = 'previous' | 'average'
type Period = '12m' | '24m' | 'all'

function TwoSegments({
  averageDisabled = false,
  onValueChange,
}: {
  averageDisabled?: boolean
  onValueChange?: (value: Comparison) => void
}) {
  const [value, setValue] = useState<Comparison>('previous')
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <SegmentedControl
        aria-label="Comparer chaque catégorie avec"
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onValueChange?.(next)
        }}
      >
        <SegmentedControlItem value="previous">
          Mois précédent
        </SegmentedControlItem>
        <SegmentedControlItem value="average" disabled={averageDisabled}>
          Moyenne
        </SegmentedControlItem>
      </SegmentedControl>
      <p className="text-muted-foreground text-xs">
        {value === 'average'
          ? 'Écart avec la moyenne sur 6 mois'
          : 'Écart avec septembre'}
      </p>
    </div>
  )
}

function ThreeSegments() {
  const [value, setValue] = useState<Period>('12m')
  return (
    <SegmentedControl
      aria-label="Période du graphique"
      value={value}
      onValueChange={setValue}
    >
      <SegmentedControlItem value="12m">12 mois</SegmentedControlItem>
      <SegmentedControlItem value="24m">24 mois</SegmentedControlItem>
      <SegmentedControlItem value="all">Tout</SegmentedControlItem>
    </SegmentedControl>
  )
}

const FILTERS = [
  { value: 'todo', label: 'À traiter', count: 18 },
  { value: 'new', label: 'Nouvelles', count: 15 },
  { value: 'conflict', label: 'À confirmer', count: 3 },
  { value: 'duplicate', label: 'Doublons', count: 7 },
  { value: 'all', label: 'Toutes', count: 25 },
] as const

function FullWidth({ width }: { width: number }) {
  const [kind, setKind] = useState('expense')
  const [filter, setFilter] = useState('todo')
  return (
    <div className="space-y-3" style={{ width }}>
      <SegmentedControl
        fullWidth
        aria-label="Type"
        value={kind}
        onValueChange={setKind}
      >
        <SegmentedControlItem value="expense">Dépense</SegmentedControlItem>
        <SegmentedControlItem value="income">Revenu</SegmentedControlItem>
        <SegmentedControlItem value="transfer">Virement</SegmentedControlItem>
      </SegmentedControl>
      <SegmentedControl
        fullWidth
        aria-label="Filtrer les opérations"
        value={filter}
        onValueChange={setFilter}
      >
        {FILTERS.map((item) => (
          <SegmentedControlItem key={item.value} value={item.value}>
            {item.label}
            <span className="text-muted-foreground tabular-nums">
              {item.count}
            </span>
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  )
}

function Gallery() {
  return (
    <div className="space-y-6">
      <TwoSegments />
      <ThreeSegments />
      <TwoSegments averageDisabled />
      <FullWidth width={320} />
    </div>
  )
}

const meta = {
  title: 'Forms/SegmentedControl',
  component: SegmentedControl,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One choice among a few, always set (#289): a rounded track (`bg-muted`) with the selected segment raised, 44px high so every segment is a touch target. Built on Radix `ToggleGroup type="single"`: radio semantics, Tab enters on the selected segment, the arrow keys move to the next one and select it, disabled segments are skipped, and pressing the selected segment again keeps it. `fullWidth` shares the row between the segments; when they do not fit, the track scrolls sideways rather than squeezing a label. Use it for single choices; multi-select filters stay chips or toggles.',
      },
    },
  },
  args: {
    value: 'previous',
    onValueChange: fn(),
  },
  render: () => <Gallery />,
} satisfies Meta<typeof SegmentedControl>

export default meta
type Story = StoryObj<typeof meta>

/** Two segments with the caption beside them, as on Dépenses. */
export const TwoSegmentsStory: Story = {
  name: 'Two segments',
  render: (args) => <TwoSegments onValueChange={args.onValueChange} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const previous = canvas.getByRole('radio', { name: 'Mois précédent' })
    const average = canvas.getByRole('radio', { name: 'Moyenne' })
    await expect(previous).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(average)
    await expect(average).toHaveAttribute('aria-checked', 'true')
    await expect(args.onValueChange).toHaveBeenLastCalledWith('average')
    await expect(
      canvas.getByText('Écart avec la moyenne sur 6 mois'),
    ).toBeInTheDocument()

    // Pressing the selected segment again keeps it: never empty.
    await userEvent.click(average)
    await expect(average).toHaveAttribute('aria-checked', 'true')

    // The arrow keys move and select, like a radio group.
    await userEvent.keyboard('{ArrowLeft}')
    await expect(previous).toHaveFocus()
    await expect(previous).toHaveAttribute('aria-checked', 'true')
    await expect(args.onValueChange).toHaveBeenLastCalledWith('previous')
  },
}

export const ThreeSegmentsStory: Story = {
  name: 'Three segments',
  render: () => <ThreeSegments />,
}

/** « Moyenne » without averaged months: skipped by the arrow keys. */
export const DisabledSegment: Story = {
  render: () => <TwoSegments averageDisabled />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const previous = canvas.getByRole('radio', { name: 'Mois précédent' })
    await expect(canvas.getByRole('radio', { name: 'Moyenne' })).toBeDisabled()
    await userEvent.click(previous)
    await userEvent.keyboard('{ArrowRight}')
    await expect(previous).toHaveFocus()
    await expect(previous).toHaveAttribute('aria-checked', 'true')
  },
}

/**
 * Full width on a 320px phone: three segments share the row; five with
 * counts do not fit, so the track scrolls sideways.
 */
export const FullWidthStory: Story = {
  name: 'Full width',
  render: () => <FullWidth width={320} />,
}

export const Light: Story = {}

export const Dark: Story = {
  globals: { theme: 'dark' },
}
