import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, within } from 'storybook/test'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb'

const meta = {
  title: 'Navigation/Breadcrumb',
  component: Breadcrumb,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Where a sub-page sits (#404, the owner’s « A »): « Comptes › Compte courant », the parent a 44px link, the current page as text (`aria-current="page"`), cut with … when it doesn’t fit; the separators are hidden from screen readers. The app puts it in its header after the logo. With `backOnPhones`, below `md` only the parent shows, as « ‹ Comptes », the page’s title right below saying where you are.',
      },
    },
  },
} satisfies Meta<typeof Breadcrumb>

export default meta
type Story = StoryObj<typeof meta>

/* Synthetic names only. */

function Trail({
  parent,
  page,
  backOnPhones,
}: {
  parent: string
  page: string
  backOnPhones?: boolean
}) {
  return (
    <Breadcrumb backOnPhones={backOnPhones}>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#parent">{parent}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{page}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** A header-like bar of a given width. */
function Bar({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div
      className="flex h-12 items-center border-y bg-glass-chrome px-2"
      style={{ width }}
    >
      {children}
    </div>
  )
}

export const Default: Story = {
  render: () => <Trail parent="Comptes" page="Compte courant" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const nav = canvas.getByRole('navigation', { name: 'Fil d’Ariane' })
    await expect(
      within(nav).getByRole('link', { name: 'Comptes' }),
    ).toHaveAttribute('href', '#parent')
    await expect(within(nav).getByText('Compte courant')).toHaveAttribute(
      'aria-current',
      'page',
    )
    // The separator is not read.
    await expect(within(nav).getAllByRole('listitem')).toHaveLength(2)
  },
}

/** A long name is cut with …; the parent stays whole. */
export const LongName: Story = {
  render: () => (
    <div className="space-y-4">
      <Bar width={360}>
        <Trail parent="Épargne" page="Assurance vie Linxea Spirit 2" />
      </Bar>
      <Bar width={560}>
        <Trail parent="Épargne" page="Assurance vie Linxea Spirit 2" />
      </Bar>
    </div>
  ),
}

/**
 * `backOnPhones`: below `md` only « ‹ Comptes » (view it with the « Mobile »
 * viewport); the whole trail from `md` up.
 */
export const BackOnPhones: Story = {
  globals: { viewport: { value: 'mobile' } },
  render: () => (
    <Bar width={320}>
      <Trail parent="Comptes" page="Compte courant" backOnPhones />
    </Bar>
  ),
}
