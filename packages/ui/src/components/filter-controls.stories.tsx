import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  ArrowDownUpIcon,
  LandmarkIcon,
  PiggyBankIcon,
  ZapIcon,
  TagIcon,
} from 'lucide-react'
import * as React from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { CategoryIcon } from './category-icon'
import { FilterControl, FilterToggle } from './filter-controls'
import { OptionRow } from './option-list'

const meta = {
  title: 'Forms/FilterControls',
  component: FilterControl,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The filters of a toolbar (#406): `FilterControl` opens its options in a popover and reads « Compte Tous ⌄ » until a value is chosen, then « [icon] Compte Livret A × » tinted with the value’s colour; `FilterToggle` is an on / off filter with a check box. All 44px high, the search’s corners and background.',
      },
    },
  },
  args: {
    label: 'Compte',
    icon: <LandmarkIcon />,
    onClear: () => undefined,
    children: null,
  },
} satisfies Meta<typeof FilterControl>

export default meta
type Story = StoryObj<typeof meta>

/** A synthetic savings account's badge. */
function SavingsBadge() {
  return (
    <span
      aria-hidden
      className="bg-chart-3/15 text-chart-3 inline-flex size-[1.15rem] items-center justify-center rounded-full"
    >
      <PiggyBankIcon className="size-[0.7rem]" />
    </span>
  )
}

const ACCOUNTS = [
  { id: 'cc', name: 'Compte démo' },
  { id: 'la', name: 'Livret démo' },
]

function Toolbar() {
  const [account, setAccount] = React.useState<string | undefined>()
  const [open, setOpen] = React.useState(false)
  const [oneOff, setOneOff] = React.useState(false)
  const chosen = ACCOUNTS.find((item) => item.id === account)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterControl
        label="Compte"
        icon={<LandmarkIcon />}
        value={
          chosen
            ? {
                label: chosen.name,
                icon: <SavingsBadge />,
                color: 'var(--chart-3)',
              }
            : undefined
        }
        onClear={() => setAccount(undefined)}
        open={open}
        onOpenChange={setOpen}
      >
        <div role="radiogroup" aria-label="Compte" className="divide-y">
          <OptionRow
            selected={account === undefined}
            label="Tous les comptes"
            onClick={() => {
              setAccount(undefined)
              setOpen(false)
            }}
          />
          {ACCOUNTS.map((item) => (
            <OptionRow
              key={item.id}
              selected={account === item.id}
              label={item.name}
              onClick={() => {
                setAccount(item.id)
                setOpen(false)
              }}
            />
          ))}
        </div>
      </FilterControl>
      <FilterControl
        label="Catégorie"
        icon={<TagIcon />}
        emptyLabel="Toutes"
        value={{
          label: 'Courses',
          icon: <CategoryIcon icon="shopping-cart" color="#d97706" size="sm" />,
          color: '#d97706',
        }}
        onClear={() => undefined}
      >
        <p className="p-4 text-sm">Options</p>
      </FilterControl>
      <FilterControl
        label="Type"
        icon={<ArrowDownUpIcon />}
        onClear={() => undefined}
      >
        <p className="p-4 text-sm">Options</p>
      </FilterControl>
      <FilterToggle
        label="Exceptionnelles"
        icon={<ZapIcon />}
        pressed={oneOff}
        onPressedChange={setOneOff}
      />
    </div>
  )
}

/** Unset, set (tinted with the value's colour) and on / off. */
export const Default: Story = {
  render: () => <Toolbar />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Compte, tous' }))
    await userEvent.click(
      await body.findByRole('radio', { name: 'Livret démo' }),
    )
    await expect(
      canvas.getByRole('button', { name: 'Compte : Livret démo, changer' }),
    ).toBeInTheDocument()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Retirer le filtre Compte' }),
    )
    await expect(
      canvas.getByRole('button', { name: 'Compte, tous' }),
    ).toBeInTheDocument()

    const toggle = canvas.getByRole('button', { name: 'Exceptionnelles' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  },
}

/**
 * A phone (#406): the filters set, each on a row of its own at the full
 * width, opening their options elsewhere (`onOpen`, the « Filtres » page).
 */
export const FullWidth: Story = {
  render: () => (
    <div className="flex max-w-[22rem] flex-col gap-2">
      <FilterControl
        label="Compte"
        icon={<LandmarkIcon />}
        value={{
          label: 'Livret démo',
          icon: <SavingsBadge />,
          color: 'var(--chart-3)',
        }}
        onClear={() => undefined}
        onOpen={() => undefined}
        className="w-full"
      />
      <FilterControl
        label="Catégorie"
        icon={<TagIcon />}
        value={{
          label: 'Courses',
          icon: <CategoryIcon icon="shopping-cart" color="#d97706" size="sm" />,
          color: '#d97706',
        }}
        onClear={() => undefined}
        onOpen={() => undefined}
        className="w-full"
      />
      <FilterToggle
        label="Exceptionnelles"
        icon={<ZapIcon />}
        pressed
        onPressedChange={() => undefined}
        className="w-full"
      />
    </div>
  ),
}
