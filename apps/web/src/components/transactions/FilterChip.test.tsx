import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FilterChip, ToggleChip } from './FilterChip'
import type { FilterChipOption } from './FilterChip'

const options: FilterChipOption[] = [
  { value: 'a', label: 'Énergie test', group: 'Dépenses' },
  { value: 'b', label: 'Courses test', group: 'Dépenses' },
  { value: 'c', label: 'Salaire test', group: 'Revenus' },
]

function Harness({ onChange }: { onChange: (value?: string) => void }) {
  const [value, setValue] = useState<string | undefined>()
  return (
    <FilterChip
      label="Catégorie"
      value={value}
      options={options}
      searchable
      onChange={(next) => {
        onChange(next)
        setValue(next)
      }}
    />
  )
}

describe('FilterChip', () => {
  it('shows its value once set and clears it with one tap on ×', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Catégorie, tous' }))
    const picker = await screen.findByRole('dialog', { name: 'Catégorie' })
    // Grouped options; the search ignores case and accents.
    expect(within(picker).getByText('Revenus')).toBeInTheDocument()
    await user.type(
      within(picker).getByLabelText('Rechercher catégorie'),
      'energie',
    )
    expect(
      within(picker).queryByRole('button', { name: 'Courses test' }),
    ).not.toBeInTheDocument()
    await user.click(
      within(picker).getByRole('button', { name: 'Énergie test' }),
    )
    expect(onChange).toHaveBeenLastCalledWith('a')
    expect(
      screen.getByRole('button', { name: 'Catégorie : Énergie test, changer' }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Retirer le filtre Catégorie' }),
    )
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    expect(
      screen.getByRole('button', { name: 'Catégorie, tous' }),
    ).toBeInTheDocument()
  })
})

describe('ToggleChip', () => {
  it('turns on and off', async () => {
    const user = userEvent.setup()
    const onPressedChange = vi.fn()
    render(
      <ToggleChip
        label="À revoir"
        pressed={false}
        onPressedChange={onPressedChange}
      />,
    )
    const chip = screen.getByRole('button', { name: 'À revoir' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await user.click(chip)
    expect(onPressedChange).toHaveBeenCalledWith(true)
  })
})
