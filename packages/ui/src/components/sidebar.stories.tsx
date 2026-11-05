import type { Meta, StoryObj } from '@storybook/react-vite'
import { HomeIcon, InboxIcon, SearchIcon, SettingsIcon } from 'lucide-react'
import { expect } from 'storybook/test'

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
