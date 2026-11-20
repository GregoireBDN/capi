import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, within } from 'storybook/test'

import { Button } from './button'
import { Input } from './input'
import {
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet'

const meta = {
  title: 'Overlays/Sheet',
  component: Sheet,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Side panel ("drawer") built on Radix `Dialog`. Slide-in from `top`, `right`, `bottom`, or `left` via `side` on `SheetContent`.',
      },
    },
  },
} satisfies Meta<typeof Sheet>

export default meta
type Story = StoryObj<typeof meta>

export const Right: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" outline>Right Sheet</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>This is a sheet sliding from the right.</SheetDescription>
        </SheetHeader>
        <div className="p-4">
          <p className="text-sm text-muted-foreground">
            Sheet content goes here. You can put forms, navigation, or any content.
          </p>
        </div>
        <SheetFooter>
          <Button fullWidth>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" outline>Left Sheet</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Browse sections.</SheetDescription>
        </SheetHeader>
        <div className="space-y-2 p-4">
          <Button ghost fullWidth className="justify-start">Home</Button>
          <Button ghost fullWidth className="justify-start">Settings</Button>
          <Button ghost fullWidth className="justify-start">Profile</Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
}

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" outline>Bottom Sheet</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Bottom Sheet</SheetTitle>
          <SheetDescription>Content slides up from the bottom.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
}

export const BottomWithWideContent: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'A bottom sheet clips horizontal overflow: content wider than the screen (here a 150% wide box) never lets the sheet pan sideways under the finger. Scrolling its content never scrolls the page behind it.',
      },
    },
  },
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Open wide sheet</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Wide content</SheetTitle>
          <SheetDescription>Cannot be dragged sideways.</SheetDescription>
        </SheetHeader>
        <div className="mx-4 mb-4 h-10 w-[150%] rounded-lg bg-muted" />
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvasElement, userEvent, step }) => {
    const canvas = within(canvasElement)
    await step('Open the sheet', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /open wide sheet/i }))
      await expect(await screen.findByText(/wide content/i)).toBeVisible()
    })
    await step('Horizontal overflow is clipped', async () => {
      const sheet = screen.getByRole('dialog')
      await expect(getComputedStyle(sheet).overflowX).toBe('hidden')
    })
  },
}

export const OpenCloseInteraction: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Open sheet</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Side panel</SheetTitle>
          <SheetDescription>Press Escape to close.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvasElement, userEvent, step }) => {
    const canvas = within(canvasElement)
    await step('Open the sheet', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /open sheet/i }))
      await expect(await screen.findByText(/side panel/i)).toBeVisible()
    })
    await step('Escape closes the sheet', async () => {
      await userEvent.keyboard('{Escape}')
      await expect(screen.queryByText(/side panel/i)).toBeNull()
    })
  },
}

export const Screen: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile2' },
    docs: {
      description: {
        story:
          'A full-screen editor on phones (#385): `side="screen"`, `SheetBar` on top (round ✕, the title, the round main action `SheetBarAction`, greyed out while it cannot be used), the content scrolling in a body marked `data-sheet-scroll`. It opens without the keyboard; the keyboard covers its end and never moves it.',
      },
    },
  },
  render: function ScreenStory() {
    const [value, setValue] = React.useState('')
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button>Open editor</Button>
        </SheetTrigger>
        <SheetContent side="screen">
          <SheetBar
            title="Mettre à jour la valeur"
            description="Valeur du compte en fin de journée."
            action={
              <SheetBarAction
                label="Enregistrer"
                disabled={value.trim() === ''}
              />
            }
          />
          <div
            data-sheet-scroll=""
            className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
          >
            <label className="block space-y-2 text-sm font-medium">
              <span>Valeur</span>
              <Input
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
          </div>
        </SheetContent>
      </Sheet>
    )
  },
  play: async ({ canvasElement, userEvent, step }) => {
    const canvas = within(canvasElement)
    await step('Opens without focusing its field', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /open editor/i }))
      const field = await screen.findByRole('textbox')
      await expect(field).not.toHaveFocus()
      await expect(
        screen.getByRole('button', { name: 'Enregistrer' }),
      ).toBeDisabled()
    })
    await step('The main action is on once the field is typed', async () => {
      await userEvent.type(screen.getByRole('textbox'), '12,5')
      await expect(
        screen.getByRole('button', { name: 'Enregistrer' }),
      ).toBeEnabled()
    })
    await step('The round ✕ closes it', async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
      await expect(screen.queryByRole('textbox')).toBeNull()
    })
  },
}
