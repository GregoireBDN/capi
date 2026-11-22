import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContactDto, UpdateContactDto } from '#/api/types.gen'
import { fail, ok, renderWithClient } from '#/components/import/test-fixtures'
import { ContactsSettings } from './ContactsSettings'

const api = vi.hoisted(() => ({
  contactsControllerList: vi.fn(),
  contactsControllerUpdate: vi.fn(),
  contactsControllerRemove: vi.fn(),
  contactsControllerCreate: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)
vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))

const SAM = 'a0000000-0000-4000-8000-000000000001'
const DOMINIQUE = 'a0000000-0000-4000-8000-000000000002'

/** Synthetic contacts: Sam has a history (owes 30 €), Dominique none. */
const contact = (id: string, name: string, owedToMeCents = 0): ContactDto => ({
  id,
  name,
  matchLabels: [],
  repaymentDay: null,
  archivedAt: null,
  owedToMeCents,
  iOweCents: 0,
})

let contacts: ContactDto[]

function archivedGroup() {
  return screen.queryByRole('region', { name: 'Archivés' })
}

async function open(name: RegExp) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name }))
  await screen.findByRole('heading', { name: 'Modifier le contact' })
  return user
}

describe('ContactsSettings (#359, #440)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contacts = [contact(SAM, 'Sam', 3_000), contact(DOMINIQUE, 'Dominique')]
    api.contactsControllerList.mockImplementation(() =>
      Promise.resolve(ok(contacts)),
    )
    api.contactsControllerUpdate.mockImplementation(
      ({ path, body }: { path: { id: string }; body: UpdateContactDto }) => {
        contacts = contacts.map((c) =>
          c.id === path.id && body.archived !== undefined
            ? {
                ...c,
                archivedAt: body.archived ? '2026-11-20T10:00:00.000Z' : null,
              }
            : c,
        )
        return Promise.resolve(ok(contacts.find((c) => c.id === path.id)))
      },
    )
    api.contactsControllerRemove.mockImplementation(
      ({ path }: { path: { id: string } }) => {
        if (path.id === SAM) {
          return Promise.resolve(
            fail(409, 'This contact has a history: archive it instead'),
          )
        }
        contacts = contacts.filter((c) => c.id !== path.id)
        return Promise.resolve(ok(undefined))
      },
    )
  })

  it('lists every contact, archived ones included, the archived apart', async () => {
    contacts = [
      contact(SAM, 'Sam', 3_000),
      {
        ...contact(DOMINIQUE, 'Dominique'),
        archivedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    renderWithClient(<ContactsSettings />)
    await screen.findByRole('button', { name: /Sam/ })
    expect(api.contactsControllerList).toHaveBeenCalledWith(
      expect.objectContaining({ query: { archived: true } }),
    )
    const archived = archivedGroup()!
    expect(
      within(archived).getByRole('button', { name: /Dominique/ }),
    ).toBeInTheDocument()
    expect(
      within(archived).queryByRole('button', { name: /Sam/ }),
    ).not.toBeInTheDocument()
  })

  it('keeps a contact with a history when « Supprimer » is refused, and archives them', async () => {
    renderWithClient(<ContactsSettings />)
    const user = await open(/Sam/)
    expect(
      screen.getByText(/qui a un historique s’archive/),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Ce contact a un historique : archivez-le plutôt.',
      ),
    )
    expect(api.contactsControllerRemove).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: SAM } }),
    )
    expect(toast.success).not.toHaveBeenCalled()
    // Still there, the editor still open.
    expect(
      screen.getByRole('heading', { name: 'Modifier le contact' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Archiver' }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Contact archivé'),
    )
    expect(api.contactsControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: SAM }, body: { archived: true } }),
    )
    // Listed again, now among the archived, with what they owe.
    await waitFor(() => expect(archivedGroup()).not.toBeNull())
    const archived = archivedGroup()!
    expect(
      within(archived).getByRole('button', { name: /Sam/ }),
    ).toBeInTheDocument()
    expect(within(archived).getByText(/vous doit 30,00/)).toBeInTheDocument()
  })

  it('deletes a contact never used', async () => {
    renderWithClient(<ContactsSettings />)
    const user = await open(/Dominique/)
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Contact supprimé'),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Dominique/ }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /Sam/ })).toBeInTheDocument()
    expect(api.contactsControllerUpdate).not.toHaveBeenCalled()
  })
})
