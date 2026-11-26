import type { Meta, StoryObj } from '@storybook/react-vite'
import { ListFilterIcon, TagsIcon, UserIcon } from 'lucide-react'
import { expect, within } from 'storybook/test'

import { NavTabs, NavTabsLink } from './nav-tabs'

const meta = {
  title: 'Navigation/NavTabs',
  component: NavTabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Folder tabs between sibling pages, each with its own URL (#505, the look of the month bar tabs, #502): the current one a rounded light blue tab, no line under the row. Links with `aria-current`, not ARIA tabs. The row fills the width and every tab takes the same share of it; icons are hidden on phones. Pass a router `Link` with `asChild`.',
      },
    },
  },
} satisfies Meta<typeof NavTabs>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <NavTabs aria-label="Réglages">
      <NavTabsLink href="#" active>
        <TagsIcon aria-hidden />
        Catégories
      </NavTabsLink>
      <NavTabsLink href="#">
        <ListFilterIcon aria-hidden />
        Règles
      </NavTabsLink>
      <NavTabsLink href="#">
        <UserIcon aria-hidden />
        Profil
      </NavTabsLink>
    </NavTabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const nav = canvas.getByRole('navigation', { name: 'Réglages' })
    const links = within(nav).getAllByRole('link')
    await expect(links).toHaveLength(3)
    await expect(links[0]).toHaveAttribute('aria-current', 'page')
    await expect(links[1]).not.toHaveAttribute('aria-current')
    // Same width for every tab, whatever its label.
    const widths = links.map((link) => link.getBoundingClientRect().width)
    await expect(new Set(widths.map(Math.round)).size).toBe(1)
  },
}

export const Phone: Story = {
  ...Default,
  globals: { viewport: { value: 'mobile', isRotated: false } },
}
