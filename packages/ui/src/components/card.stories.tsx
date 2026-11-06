import type { Meta, StoryObj } from '@storybook/react-vite'

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
