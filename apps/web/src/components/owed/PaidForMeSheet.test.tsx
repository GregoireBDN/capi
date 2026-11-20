import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryDto, ContactDto, TransactionDto } from '#/api/types.gen'
import { ok, renderWithClient } from '#/components/import/test-fixtures'
import { currentDay } from '#/lib/calendar'
import { pickCategory } from '#/test/category-picker'
import { nextPaidForMeStep, PaidForMeSheet } from './PaidForMeSheet'

const api = vi.hoisted(() => ({
  contactsControllerList: vi.fn(),
  categoriesControllerList: vi.fn(),
  categoriesControllerCreate: vi.fn(),
  transactionsControllerManualSuggestions: vi.fn(),
  receivablesControllerCreateDebt: vi.fn(),
  receivablesControllerRemove: vi.fn(),
}))
vi.mock('#/api', () => api)

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

/** Synthetic data only. */
const SAM: ContactDto = {
  id: 'a0000000-0000-4000-8000-000000000002',
  name: 'Sam',
  matchLabels: [],
  repaymentDay: null,
  archivedAt: null,
  owedToMeCents: 0,
  iOweCents: 0,
}
const category = (id: string, name: string): CategoryDto => ({
  id,
  slug: id,
  name,
  kind: 'expense',
  color: null,
  icon: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  archivedAt: null,
})
const RESTAURANTS = category('cat-restaurants', 'Restaurants')
const GROCERIES = category('cat-groceries', 'Courses')

/** The owner's part of a dinner Sam paid, as the API gives it back. */
const debt = {
  id: 't0000000-0000-4000-8000-000000000001',
  shares: [{ id: 'r0000000-0000-4000-8000-000000000001', direction: 'i_owe' }],
} as unknown as TransactionDto

/** The step shown, from the bar's description (« Étape 2 sur 4 : … »). */
function stepShown() {
  return screen.getByText(/^Étape \d sur 4/).textContent
}

describe('PaidForMeSheet in four steps (#394)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.contactsControllerList.mockResolvedValue(ok([SAM]))
    api.categoriesControllerList.mockResolvedValue(ok([RESTAURANTS, GROCERIES]))
    api.transactionsControllerManualSuggestions.mockResolvedValue(
      ok({ items: [], categoryIds: [] }),
    )
    api.receivablesControllerCreateDebt.mockResolvedValue(ok(debt))
    api.receivablesControllerRemove.mockResolvedValue(ok(undefined))
  })

  it('asks who paid, the category, the bill then my part, and adds the debt', async () => {
    const user = userEvent.setup()
    renderWithClient(<PaidForMeSheet open onOpenChange={() => {}} />)

    expect(stepShown()).toBe('Étape 1 sur 4 : Qui a payé')
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled()
    // A tap moves on.
    await user.click(await screen.findByRole('button', { name: /Sam/ }))
    expect(stepShown()).toBe('Étape 2 sur 4 : Catégorie')

    await pickCategory(user, 'Restaurants')
    expect(stepShown()).toBe('Étape 3 sur 4 : Addition')
    const bill = screen.getByLabelText('Addition payée par Sam')
    expect(bill).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled()
    await user.type(bill, '60')
    await user.click(screen.getByRole('button', { name: 'Suivant' }))

    expect(stepShown()).toBe('Étape 4 sur 4 : Ma part')
    // « On était combien ? »: 2 (half) by default, in one row of tiles.
    const owed = () => screen.getByText('Je dois à Sam').parentElement
    const mine = screen.getByLabelText('Ma part')
    expect(screen.getByRole('radio', { name: '2' })).toBeChecked()
    expect(mine).toHaveValue('30')
    expect(owed()).toHaveTextContent(/30,00/)
    await user.click(screen.getByRole('radio', { name: '3' }))
    expect(mine).toHaveValue('20')
    expect(owed()).toHaveTextContent(/20,00/)
    // « 6+ »: 6, then − / + beyond.
    await user.click(screen.getByRole('radio', { name: '6 ou plus' }))
    expect(mine).toHaveValue('10')
    await user.click(
      screen.getByRole('button', { name: 'Une personne de plus' }),
    )
    expect(screen.getByText('7 personnes')).toBeInTheDocument()
    expect(mine).toHaveValue('8,57')
    // A typed part of my own; past the bill, it can't be added.
    await user.click(screen.getByRole('button', { name: 'Autre montant' }))
    expect(mine).toHaveFocus()
    await user.clear(mine)
    await user.type(mine, '70')
    expect(owed()).toHaveTextContent('plus que l’addition')
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
    expect(
      screen
        .getAllByRole('radio')
        .filter((r) => r.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(0)
    // Back to half.
    await user.click(screen.getByRole('radio', { name: '2' }))
    expect(owed()).toHaveTextContent(/30,00/)
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))

    await waitFor(() =>
      expect(api.receivablesControllerCreateDebt).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            contactId: SAM.id,
            billCents: 6000,
            partCents: 3000,
            categoryId: RESTAURANTS.id,
            bookingDate: currentDay(),
          },
        }),
      ),
    )
    // The toast's « Annuler » removes the debt.
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const [message, options] = toast.success.mock.calls[0]
    expect(String(message).replace(/\s/g, ' ')).toBe('Vous devez 30,00 € à Sam')
    options.action.onClick()
    await waitFor(() =>
      expect(api.receivablesControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: debt.shares[0].id } }),
      ),
    )
  })

  it('skips the steps a hand-over filled: the quick entry opens at who paid, then my part', async () => {
    const user = userEvent.setup()
    renderWithClient(
      <PaidForMeSheet
        open
        onOpenChange={() => {}}
        initial={{
          categoryId: GROCERIES.id,
          billCents: 4500,
          bookingDate: currentDay(),
          label: 'Marché',
        }}
      />,
    )
    expect(stepShown()).toBe('Étape 1 sur 4 : Qui a payé')
    await user.click(await screen.findByRole('button', { name: /Sam/ }))
    expect(stepShown()).toBe('Étape 4 sur 4 : Ma part')
    expect(screen.getByText('Je dois à Sam').parentElement).toHaveTextContent(
      /22,50/,
    )
    // « Retour » goes back one step, the bill still there.
    await user.click(screen.getByRole('button', { name: 'Retour' }))
    expect(stepShown()).toBe('Étape 3 sur 4 : Addition')
    expect(screen.getByLabelText('Addition payée par Sam')).toHaveValue('45')
    expect(screen.getByLabelText('Libellé')).toHaveValue('Marché')
  })

  it('opens at the category from a person’s page', async () => {
    renderWithClient(
      <PaidForMeSheet
        open
        onOpenChange={() => {}}
        initial={{ person: { contactId: SAM.id, name: SAM.name } }}
      />,
    )
    expect(stepShown()).toBe('Étape 2 sur 4 : Catégorie')
  })

  it('creates a missing category from the search and moves on', async () => {
    const user = userEvent.setup()
    const created = category('cat-new', 'Cinéma')
    api.categoriesControllerCreate.mockResolvedValue(ok(created))
    renderWithClient(
      <PaidForMeSheet
        open
        onOpenChange={() => {}}
        initial={{ person: { contactId: SAM.id, name: SAM.name } }}
      />,
    )
    await user.type(
      await screen.findByRole('searchbox', {
        name: 'Rechercher une catégorie',
      }),
      'Cinéma',
    )
    api.categoriesControllerList.mockResolvedValue(
      ok([RESTAURANTS, GROCERIES, created]),
    )
    await user.click(
      screen.getByRole('button', { name: /Nouvelle catégorie « Cinéma »/ }),
    )
    await waitFor(() => expect(stepShown()).toBe('Étape 3 sur 4 : Addition'))
    expect(api.categoriesControllerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ name: 'Cinéma', kind: 'expense' }),
      }),
    )
  })
})

describe('nextPaidForMeStep', () => {
  const none = { person: false, category: false, bill: false }
  it('opens at the first step to fill in', () => {
    expect(nextPaidForMeStep(none)).toBe('person')
    expect(nextPaidForMeStep({ ...none, person: true })).toBe('category')
    expect(
      nextPaidForMeStep({ person: true, category: true, bill: true }),
    ).toBe('share')
  })
  it('moves on past the steps already filled', () => {
    expect(
      nextPaidForMeStep({ person: true, category: true, bill: true }, 'person'),
    ).toBe('share')
    expect(
      nextPaidForMeStep(
        { person: true, category: false, bill: true },
        'person',
      ),
    ).toBe('category')
    expect(nextPaidForMeStep({ ...none, person: true }, 'bill')).toBe('share')
  })
})
