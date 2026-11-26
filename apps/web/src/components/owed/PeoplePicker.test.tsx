import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { ContactDto } from '#/api/types.gen'
import { PeoplePicker, samePerson } from './PeoplePicker'
import type { Person } from './PeoplePicker'

/** Synthetic data only. */
const contact = (id: string, name: string, archived = false): ContactDto => ({
  id,
  name,
  matchLabels: [],
  repaymentDay: null,
  archivedAt: archived ? '2026-01-01T00:00:00.000Z' : null,
  owedToMeCents: 0,
  iOweCents: 0,
  alwaysOffset: false,
})
const CONTACTS = [
  contact('c1', 'Alex'),
  contact('c2', 'Camille'),
  contact('c3', 'Ancien', true),
]

function Several() {
  const [chosen, setChosen] = useState<Person[]>([])
  return (
    <PeoplePicker
      label="Avec qui ?"
      contacts={CONTACTS}
      chosen={chosen}
      onPick={(person) => setChosen((all) => [...all, person])}
      onRemove={(person) =>
        setChosen((all) => all.filter((p) => !samePerson(p, person)))
      }
    />
  )
}

describe('PeoplePicker, a list of people (#394)', () => {
  it('lists the contacts, not the archived ones, and picks one', async () => {
    const user = userEvent.setup()
    let picked: Person | null = null
    render(
      <PeoplePicker
        single
        label="Qui a payé ?"
        contacts={CONTACTS}
        chosen={[]}
        onPick={(person) => (picked = person)}
      />,
    )
    expect(
      screen.getByRole('radiogroup', { name: 'Qui a payé ?' }),
    ).toBeInTheDocument()
    // Each row: the contact's initials on their disc, then the name.
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'ALAlex',
      'CACamille',
    ])
    await user.click(screen.getByRole('radio', { name: /Camille/ }))
    expect(picked).toEqual({ contactId: 'c2', name: 'Camille' })
  })

  it('leaves an archived contact out of a search for their name too (#440)', async () => {
    const user = userEvent.setup()
    render(<Several />)
    expect(
      screen.queryByRole('button', { name: /Ancien/ }),
    ).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox'), 'anc')
    expect(
      screen.queryByRole('button', { name: /^(?!Ajouter).*Ancien/ }),
    ).not.toBeInTheDocument()
  })

  it('filters by the name typed and offers to add a new one', async () => {
    const user = userEvent.setup()
    let picked: Person | null = null
    render(
      <PeoplePicker
        single
        label="Qui a payé ?"
        contacts={CONTACTS}
        chosen={[]}
        onPick={(person) => (picked = person)}
      />,
    )
    const search = screen.getByRole('searchbox')
    await user.type(search, 'cam')
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    await user.clear(search)
    await user.type(search, 'Léa')
    await user.click(screen.getByRole('button', { name: /Ajouter « Léa »/ }))
    expect(picked).toEqual({ contactId: null, name: 'Léa' })
  })

  it('adds several people and takes one out with a second tap', async () => {
    const user = userEvent.setup()
    render(<Several />)
    const alex = screen.getByRole('button', { name: /Alex/ })
    await user.click(alex)
    await user.click(screen.getByRole('button', { name: /Camille/ }))
    expect(alex).toHaveAttribute('aria-pressed', 'true')
    await user.click(alex)
    expect(alex).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /Camille/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
