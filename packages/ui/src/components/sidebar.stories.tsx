import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  HomeIcon,
  InboxIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ListIcon,
  PieChartIcon,
  PiggyBankIcon,
  RepeatIcon,
  SearchIcon,
  SettingsIcon,
  TargetIcon,
  UploadIcon,
} from 'lucide-react'
import type * as React from 'react'
import { expect, userEvent, waitFor } from 'storybook/test'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from './sidebar'

const meta = {
  title: 'Layout/Sidebar',
  component: Sidebar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Collapsible application sidebar. Wrap your layout in `SidebarProvider`, place a `Sidebar` (with `SidebarHeader` / `SidebarContent` / `SidebarFooter`) and a `SidebarInset` for the main panel. `SidebarTrigger` toggles the open / collapsed state.',
      },
    },
  },
} satisfies Meta<typeof Sidebar>

export default meta
type Story = StoryObj<typeof meta>

const items = [
  { title: 'Home', icon: HomeIcon },
  { title: 'Inbox', icon: InboxIcon },
  { title: 'Search', icon: SearchIcon },
  { title: 'Settings', icon: SettingsIcon },
]

export const Basic: Story = {
  render: () => (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="px-2 py-1.5 font-semibold">Finances</div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Application</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    {/* Mark the current page with `isActive`; only it is highlighted. */}
                    <SidebarMenuButton isActive={item.title === 'Home'}>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 text-xs text-muted-foreground">v0.0.1</div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <SidebarTrigger />
          <span className="text-sm font-medium">Main content</span>
        </div>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            Use the trigger to collapse / expand the sidebar.
          </p>
        </div>
      </SidebarInset>
    </SidebarProvider>
  ),
  play: async ({ canvas }) => {
    const button = (name: string) => canvas.getByRole('button', { name })
    await expect(button('Home')).toHaveAttribute('data-active', 'true')
    for (const name of ['Inbox', 'Search', 'Settings']) {
      await expect(button(name)).not.toHaveAttribute('data-active')
    }
  },
}

/* ----------------------------------------------------------------------------
 * Phone held sideways (844×390, the fixed column is shown from `md` up) with
 * the app's 22px root and its nine entries: they can't all fit, so the menu
 * scrolls between the header and the footer, with a fade on the clipped edge.
 * ------------------------------------------------------------------------- */

const appItems = [
  { title: 'Tableau de bord', icon: LayoutDashboardIcon },
  { title: 'Dépenses', icon: PieChartIcon },
  { title: 'Opérations', icon: ListIcon },
  { title: 'À revoir', icon: InboxIcon },
  { title: 'Budget', icon: TargetIcon },
  { title: 'Abonnements', icon: RepeatIcon },
  { title: 'Épargne', icon: PiggyBankIcon },
  { title: 'Comptes', icon: LandmarkIcon },
  { title: 'Import', icon: UploadIcon },
]

function AppLikeSidebar({ defaultOpen = true }: { defaultOpen?: boolean }) {
  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={{ '--sidebar-width': 'min(16rem, 32vw)' } as React.CSSProperties}
    >
      <Sidebar>
        <SidebarHeader>
          <div className="flex h-11 items-center px-2 font-semibold">
            Finances
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {appItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton isActive={item.title === 'Budget'}>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenuButton size="lg">
            <span>Compte</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <SidebarTrigger />
          <span className="text-sm font-medium">Contenu</span>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/** Gives the story the app's 22px root (`apps/web/src/globals.css`). */
function withAppRoot() {
  const root = document.documentElement
  const previous = root.style.fontSize
  root.style.fontSize = '22px'
  return () => {
    root.style.fontSize = previous
  }
}

const PHONE_LANDSCAPE = {
  viewport: { value: 'phoneLandscape', isRotated: false },
} as const

const container = (canvasElement: HTMLElement) => {
  const element = canvasElement.ownerDocument.querySelector<HTMLElement>(
    '[data-slot=sidebar-container]',
  )
  if (!element) throw new Error('No sidebar container')
  return element
}

/** 844×390: the column fills the height and every entry can be scrolled to. */
export const PhoneLandscape: Story = {
  globals: PHONE_LANDSCAPE,
  beforeEach: withAppRoot,
  render: () => <AppLikeSidebar />,
  play: async ({ canvas, canvasElement, step }) => {
    const view = canvasElement.ownerDocument.defaultView ?? window
    const content = canvasElement.ownerDocument.querySelector<HTMLElement>(
      '[data-slot=sidebar-content]',
    )
    if (!content) throw new Error('No sidebar content')

    await step('the column reaches the bottom of the screen', async () => {
      const rect = container(canvasElement).getBoundingClientRect()
      await expect(rect.top).toBe(0)
      await expect(rect.bottom).toBe(view.innerHeight)
    })

    await step('the menu scrolls, with a cue at the bottom', async () => {
      await waitFor(() =>
        expect(content).toHaveAttribute('data-overflow-bottom', 'true'),
      )
      await expect(content).not.toHaveAttribute('data-overflow-top')
      await expect(content.scrollHeight).toBeGreaterThan(content.clientHeight)
    })

    await step('the last entry can be scrolled into view', async () => {
      const last = canvas.getByRole('button', { name: 'Import' })
      content.scrollTop = content.scrollHeight
      await waitFor(() =>
        expect(content).toHaveAttribute('data-overflow-top', 'true'),
      )
      await expect(content).not.toHaveAttribute('data-overflow-bottom')
      const entry = last.getBoundingClientRect()
      const area = content.getBoundingClientRect()
      await expect(entry.bottom).toBeLessThanOrEqual(area.bottom + 1)
      await expect(entry.top).toBeGreaterThanOrEqual(area.top - 1)
    })
  },
}

/** Hidden (`collapsible="offcanvas"`): the content takes the full width. */
export const Hidden: Story = {
  globals: PHONE_LANDSCAPE,
  beforeEach: withAppRoot,
  render: () => <AppLikeSidebar defaultOpen={false} />,
  play: async ({ canvas, canvasElement }) => {
    const sidebar = canvasElement.ownerDocument.querySelector(
      '[data-slot=sidebar]',
    )
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    await expect(sidebar).toHaveAttribute('data-collapsible', 'offcanvas')
    // Slid out and out of the tab order.
    await waitFor(() =>
      expect(getComputedStyle(container(canvasElement)).visibility).toBe(
        'hidden',
      ),
    )
    await expect(
      canvas.queryByRole('button', { name: 'Budget' }),
    ).not.toBeInTheDocument()

    const inset = canvasElement.ownerDocument.querySelector(
      '[data-slot=sidebar-inset]',
    )
    const view = canvasElement.ownerDocument.defaultView ?? window
    await expect(inset?.getBoundingClientRect().left).toBe(0)
    await expect(inset?.getBoundingClientRect().width).toBe(view.innerWidth)

    await userEvent.click(
      canvas.getByRole('button', { name: 'Afficher ou masquer le menu' }),
    )
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')
    await expect(
      await canvas.findByRole('button', { name: 'Budget' }),
    ).toBeVisible()
  },
}
