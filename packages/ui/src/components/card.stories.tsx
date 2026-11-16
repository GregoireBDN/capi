import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Button } from './button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card'

const meta = {
  title: 'Display/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Container for grouping related content. Compose with `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter`. A `size` prop toggles compact padding.',
      },
    },
  },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'default'],
      table: { category: 'Appearance', defaultValue: { summary: 'default' } },
    },
  },
  args: { size: 'default' },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {
  render: (args) => (
    <Card {...args} className="w-96">
      <CardHeader>
        <CardTitle>Card Playground</CardTitle>
        <CardDescription>Try changing the `size` Control.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Body content.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Action</Button>
      </CardFooter>
    </Card>
  ),
}

export const Default: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Default Card</CardTitle>
        <CardDescription>
          This is a card with header, content, and footer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card body content goes here.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Action</Button>
      </CardFooter>
    </Card>
  ),
}

export const Small: Story = {
  render: () => (
    <Card size="sm" className="w-80">
      <CardHeader>
        <CardTitle>Small Card</CardTitle>
        <CardDescription>Compact variant.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Smaller padding and spacing.</p>
      </CardContent>
    </Card>
  ),
}

/**
 * With an action on a narrow card (a phone): the action stays next to the
 * title and the description takes the full width below; from a 28rem-wide
 * header the description sits beside the title, left of the action.
 */
export const ActionOnNarrowCard: Story = {
  render: () => (
    <Card className="w-72">
      <CardHeader>
        <CardTitle>Goals</CardTitle>
        <CardDescription>
          Projection at your average savings of the last six months.
        </CardDescription>
        <CardAction>
          <Button size="sm">Add</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p>Card body content goes here.</p>
      </CardContent>
    </Card>
  ),
}

/**
 * A wide card (header at least 28rem): the title on one line, the long
 * description under it and the action in the top-right corner. Guards #209,
 * where the description slipped into the action's column and squeezed the
 * title to one or two letters per line.
 */
export const ActionOnWideCard: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <Card className="w-[720px] max-w-full">
      <CardHeader>
        <CardTitle>Objectifs</CardTitle>
        <CardDescription>
          Projetés à 725,54 € par mois : votre épargne moyenne des 6 derniers
          mois complets, sans les revenus et dépenses ponctuels.
        </CardDescription>
        <CardAction>
          <Button size="sm">Ajouter</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p>Card body content goes here.</p>
      </CardContent>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const title = canvasElement.querySelector<HTMLElement>(
      '[data-slot="card-title"]',
    )!
    const description = canvasElement.querySelector<HTMLElement>(
      '[data-slot="card-description"]',
    )!
    const action = canvasElement.querySelector<HTMLElement>(
      '[data-slot="card-action"]',
    )!
    const lineHeight = parseFloat(getComputedStyle(title).lineHeight)
    const titleBox = title.getBoundingClientRect()
    const descriptionBox = description.getBoundingClientRect()
    const actionBox = action.getBoundingClientRect()
    // One line, description below it, action to the right of both.
    await expect(titleBox.height).toBeLessThan(lineHeight * 1.5)
    await expect(descriptionBox.top).toBeGreaterThanOrEqual(titleBox.bottom)
    await expect(actionBox.left).toBeGreaterThanOrEqual(descriptionBox.right)
    await expect(actionBox.top).toBeLessThanOrEqual(titleBox.top + 1)
  },
}
