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

/** Distances, in px, between the card's edges and its first and last blocks. */
function edgeSpacing(canvasElement: HTMLElement, cardIndex = 0) {
  const card =
    canvasElement.querySelectorAll<HTMLElement>('[data-slot="card"]')[
      cardIndex
    ]!
  const blocks = [...card.children] as HTMLElement[]
  const cardBox = card.getBoundingClientRect()
  return {
    top: blocks[0]!.getBoundingClientRect().top - cardBox.top,
    bottom: cardBox.bottom - blocks.at(-1)!.getBoundingClientRect().bottom,
  }
}

/**
 * A card ending with its content: the space under the last block is the
 * card's padding, the same as above the first one (16px, 12px for `sm`).
 * Guards #330, where `CardContent`'s margin doubled it.
 */
export const EndsWithContent: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card className="w-80">
        <CardHeader>
          <CardTitle>Ends with content</CardTitle>
          <CardDescription>Same space above and below.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>First block.</p>
        </CardContent>
        <CardContent>
          <Button size="sm" variant="secondary" className="w-full">
            Last block
          </Button>
        </CardContent>
      </Card>
      <Card size="sm" className="w-80">
        <CardHeader>
          <CardTitle>Small card</CardTitle>
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="secondary" className="w-full">
            Last block
          </Button>
        </CardContent>
      </Card>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const card = edgeSpacing(canvasElement, 0)
    await expect(card.bottom).toBeCloseTo(card.top, 0)
    await expect(card.bottom).toBeCloseTo(16 * remScale(), 0)
    const small = edgeSpacing(canvasElement, 1)
    await expect(small.bottom).toBeCloseTo(small.top, 0)
    await expect(small.bottom).toBeCloseTo(12 * remScale(), 0)
  },
}

/**
 * A card ending with a footer: the footer sits flush with the card's bottom
 * edge, and the content keeps its room above the footer.
 */
export const EndsWithFooter: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Ends with a footer</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Body content.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Action</Button>
      </CardFooter>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const { bottom } = edgeSpacing(canvasElement)
    await expect(bottom).toBeCloseTo(0, 0)
    const content = canvasElement.querySelector('[data-slot="card-content"]')!
    const footer = canvasElement.querySelector('[data-slot="card-footer"]')!
    const space =
      footer.getBoundingClientRect().top -
      content.getBoundingClientRect().bottom
    // The card's gap plus the content's margin before the next block.
    await expect(space).toBeCloseTo(32 * remScale(), 0)
  },
}

/** Tailwind spacing is in rem; the app's root font size may not be 16px. */
function remScale() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) / 16
}
