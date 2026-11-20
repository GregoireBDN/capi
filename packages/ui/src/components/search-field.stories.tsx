import type { Meta, StoryObj } from '@storybook/react-vite'
import * as React from 'react'
import { expect, within } from 'storybook/test'

import { SearchField } from './search-field'

const meta = {
  title: 'Forms/SearchField',
  component: SearchField,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A search box 44px high (#396): a magnifier, the text at 16px, a ✕ that empties it once something is typed.',
      },
    },
  },
  args: { value: '', onValueChange: () => {} },
} satisfies Meta<typeof SearchField>

export default meta
type Story = StoryObj<typeof meta>

function Search() {
  const [query, setQuery] = React.useState('')
  return (
    <div className="max-w-sm">
      <SearchField
        aria-label="Rechercher une catégorie"
        placeholder="Rechercher"
        value={query}
        onValueChange={setQuery}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <Search />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByRole('searchbox')
    await userEvent.type(field, 'cour')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Effacer la recherche' }),
    )
    await expect(field).toHaveValue('')
    await expect(field).toHaveFocus()
  },
}
