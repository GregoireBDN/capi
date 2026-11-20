import type { Meta, StoryObj } from '@storybook/react-vite'
import * as React from 'react'
import { expect, within } from 'storybook/test'

import { CategoryIcon } from './category-icon'
import { OptionGroup, OptionRow } from './option-list'

const meta = {
  title: 'Display/OptionList',
  component: OptionRow,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Rows of a list of choices under titles (#396: « Habituels », « Les plus utilisées », « Toutes les catégories »): the whole row a button at least 52px high, a check once chosen. Put the groups in a `role="radiogroup"`.',
      },
    },
  },
  args: { label: '' },
} satisfies Meta<typeof OptionRow>

export default meta
type Story = StoryObj<typeof meta>

/** Synthetic categories. */
const CATEGORIES = [
  { id: 'groceries', name: 'Courses', color: '#d97706', icon: 'shopping-cart' },
  { id: 'rent', name: 'Loyer', color: '#dc2626', icon: 'house' },
  { id: 'transport', name: 'Transport', color: '#0891b2', icon: 'train-front' },
]

function Categories() {
  const [chosen, setChosen] = React.useState('groceries')
  return (
    <div role="radiogroup" aria-label="Catégorie" className="max-w-sm border">
      <OptionGroup title="Habituels">
        <OptionRow
          leading={<CategoryIcon icon="shopping-cart" color="#d97706" />}
          label="Boulangerie Démo"
          detail="Courses"
          onClick={() => setChosen('groceries')}
        />
      </OptionGroup>
      <OptionGroup title="Toutes les catégories">
        {CATEGORIES.map((category) => (
          <OptionRow
            key={category.id}
            selected={chosen === category.id}
            leading={
              <CategoryIcon icon={category.icon} color={category.color} />
            }
            label={category.name}
            onClick={() => setChosen(category.id)}
          />
        ))}
      </OptionGroup>
    </div>
  )
}

export const Default: Story = {
  render: () => <Categories />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('radio', { name: 'Loyer' }))
    await expect(canvas.getByRole('radio', { name: 'Loyer' })).toBeChecked()
    await expect(
      canvas.getByRole('group', { name: 'Toutes les catégories' }),
    ).toBeInTheDocument()
  },
}
