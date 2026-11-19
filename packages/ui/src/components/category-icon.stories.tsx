import type { Meta, StoryObj } from '@storybook/react-vite'
import { CircleHelpIcon, EllipsisIcon } from 'lucide-react'

import {
  CATEGORY_ICON_NAMES,
  CATEGORY_ICONS,
  CategoryIcon,
} from './category-icon'

const meta = {
  title: 'Display/CategoryIcon',
  component: CategoryIcon,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A category’s icon (#287): its Lucide glyph in a rounded tile tinted with its colour, the same everywhere a category is named (Dépenses first, then Budget and the other pages). Pass the category’s stored `icon` and `color`; without an icon it shows `fallback` (a tag), without a colour (unknown or deleted category) a neutral tile. `sm` sits beside small text (legends, chips), `md` heads a list row. The icons a category can take are `CATEGORY_ICONS` / `CATEGORY_ICON_NAMES`, the same allow-list as the API. The name is written beside it, so the icon is hidden from screen readers unless `label` is given.',
      },
    },
  },
  args: { icon: 'shopping-cart', color: '#d97706', size: 'md' },
  argTypes: {
    icon: { control: 'select', options: CATEGORY_ICON_NAMES },
    color: { control: 'color' },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof CategoryIcon>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** A few default categories, as Dépenses lists them. */
const SAMPLE = [
  { name: 'Loyer', icon: 'house', color: '#dc2626', amount: '850,00 €' },
  {
    name: 'Courses',
    icon: 'shopping-cart',
    color: '#d97706',
    amount: '412,30 €',
  },
  {
    name: 'Restaurants & cafés',
    icon: 'utensils',
    color: '#ca8a04',
    amount: '96,40 €',
  },
  { name: 'Transport', icon: 'car', color: '#0891b2', amount: '74,00 €' },
  { name: 'Énergie', icon: 'zap', color: '#ea580c', amount: '61,25 €' },
  {
    name: 'Autres dépenses',
    icon: 'circle-help',
    color: '#6b7280',
    amount: '23,90 €',
  },
] as const

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <CategoryIcon icon="utensils" color="#ca8a04" size="sm" />
      <CategoryIcon icon="utensils" color="#ca8a04" size="md" />
    </div>
  ),
}

/** `md` heading list rows (Dépenses « Par catégorie »). */
export const InAList: Story = {
  render: () => (
    <ul className="w-[min(22rem,90vw)] divide-y">
      {SAMPLE.map((item) => (
        <li key={item.name} className="flex items-center gap-3 py-2">
          <CategoryIcon icon={item.icon} color={item.color} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {item.name}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {item.amount}
          </span>
        </li>
      ))}
    </ul>
  ),
}

/** `sm` beside small text, as in the chart legends. */
export const InALegend: Story = {
  render: () => (
    <ul className="flex max-w-sm flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {SAMPLE.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5">
          <CategoryIcon icon={item.icon} color={item.color} size="sm" />
          <span className="text-muted-foreground">{item.name}</span>
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <CategoryIcon
          icon={null}
          color="var(--chart-other)"
          fallback={EllipsisIcon}
          size="sm"
        />
        <span className="text-muted-foreground">Autres</span>
      </li>
    </ul>
  ),
}

/** No icon (tag), an unknown icon name, and an unknown or deleted category. */
export const Fallbacks: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <CategoryIcon icon={null} color="#2563eb" />
      <CategoryIcon icon="not-an-icon" color="#2563eb" />
      <CategoryIcon icon={null} color={null} fallback={CircleHelpIcon} />
    </div>
  ),
}

/** Every allowed icon, as the Catégories page picker offers them. */
export const AllIcons: Story = {
  render: () => (
    <ul className="grid max-w-xl grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
      {CATEGORY_ICON_NAMES.map((name) => (
        <li key={name} className="flex items-center gap-2 text-xs">
          <CategoryIcon icon={name} color="#0d9488" size="sm" />
          <span className="text-muted-foreground truncate">
            {CATEGORY_ICONS[name].label}
          </span>
        </li>
      ))}
    </ul>
  ),
}
