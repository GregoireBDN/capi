import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  CategoryDto,
  EnvelopesDto,
  TransactionDto,
} from '#/api/types.gen'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { referenceKeys } from '#/lib/queries'
import { MonthEnvelopes } from './MonthEnvelopes'

const api = vi.hoisted(() => ({
  budgetsControllerEnvelopes: vi.fn(),
  transactionsControllerCreateManual: vi.fn(),
  transactionsControllerUpdateManual: vi.fn(),
  transactionsControllerRemoveManual: vi.fn(),
  transactionsControllerManualSuggestions: vi.fn(),
  transactionsControllerList: vi.fn(),
  accountsControllerList: vi.fn(),
  categoriesControllerList: vi.fn(),
}))

vi.mock('#/api', () => api)

// The sheet's kind picker (Radix toggle group) measures itself.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent in jsdom despite the DOM typings
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string
    search?: Record<string, string>
    children: ReactNode
  }) => (
    <a
      href={search ? `${to}?${new URLSearchParams(search).toString()}` : to}
      {...props}
    >
      {children}
    </a>
  ),
}))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string) => value.replace(/\s/g, ' ')

function ok<T>(data: T) {
  return Promise.resolve({ data, response: { ok: true, status: 200 } })
}

const STAMP = '2026-01-01T00:00:00.000Z'
const category = (id: string, name: string, kind: CategoryDto['kind']) =>
  ({
    id,
    slug: name.toLowerCase(),
    name,
    kind,
    color: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
  }) as CategoryDto
const OUTINGS = 'c0000000-0000-4000-8000-000000000001'
const SHOPPING = 'c0000000-0000-4000-8000-000000000002'
const GROCERIES = 'c0000000-0000-4000-8000-000000000004'
const categories = [
  category(SHOPPING, 'Shopping', 'expense'),
  category(OUTINGS, 'Sorties', 'expense'),
  category('c0000000-0000-4000-8000-000000000003', 'Salaire', 'income'),
  category(GROCERIES, 'Courses', 'expense'),
]

/** Names of the category chips of the sheet. */
function categoryNames(dialog: HTMLElement) {
  return within(within(dialog).getByRole('radiogroup', { name: 'Catégorie' }))
    .getAllByRole('radio')
    .map((radio) => radio.textContent)
}

/** Name of the category chip chosen, if any. */
function chosenCategory(dialog: HTMLElement) {
  return within(within(dialog).getByRole('radiogroup', { name: 'Catégorie' }))
    .getAllByRole('radio')
    .find((radio) => radio.getAttribute('aria-checked') === 'true')?.textContent
}

function optionNames(select: HTMLElement) {
  return within(select)
    .getAllByRole('option')
    .map((option) => option.textContent)
}

const account = (id: string, name: string, type: AccountDto['type']) =>
  ({
    id,
    name,
    type,
    institution: null,
    position: 0,
    archivedAt: null,
    balanceCents: null,
    balanceDate: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  }) as AccountDto
const CHECKING = 'a0000000-0000-4000-8000-000000000001'
const accounts = [
  account('a0000000-0000-4000-8000-000000000002', 'Livret A', 'savings'),
  account(CHECKING, 'Compte courant', 'checking'),
  account('a0000000-0000-4000-8000-000000000003', 'PEA', 'brokerage'),
]

const envelopes: EnvelopesDto = {
  month: '2026-11',
  today: '2026-11-13',
  dayOfMonth: 13,
  daysInMonth: 30,
  items: [
    {
      categoryId: SHOPPING,
      slug: 'shopping',
      name: 'Shopping',
      color: null,
      icon: null,
      targetCents: 10_000,
      spentCents: 2_000,
      manualCents: 0,
      remainingCents: 8_000,
      paceCents: 4_333,
      aheadOfPace: false,
      status: 'ok',
    },
    {
      categoryId: OUTINGS,
      slug: 'sorties',
      name: 'Sorties',
      color: null,
      icon: null,
      targetCents: 15_000,
      spentCents: 9_000,
      manualCents: 2_500,
      remainingCents: 6_000,
      paceCents: 6_500,
      aheadOfPace: true,
      status: 'ok',
    },
  ],
}

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MonthEnvelopes />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  // 00:30 on Nov 13 in Paris, still Nov 12 in UTC.
  vi.setSystemTime(new Date('2026-11-12T23:30:00Z'))
  api.budgetsControllerEnvelopes.mockImplementation(() => ok(envelopes))
  api.accountsControllerList.mockImplementation(() => ok(accounts))
  api.categoriesControllerList.mockImplementation(() => ok(categories))
  api.transactionsControllerManualSuggestions.mockImplementation(() =>
    ok({ items: [], categoryIds: [] }),
  )
  api.transactionsControllerCreateManual.mockImplementation(() =>
    ok({ amountCents: -1_250, category: categories[1] }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MonthEnvelopes', () => {
  it('shows each envelope against its target and the month’s pace', async () => {
    renderCard()

    const card = await screen.findByRole('region', { name: 'Ce mois-ci' })
    expect(await within(card).findByText(/Jour 13 sur 30/)).toBeInTheDocument()
    const outings = within(card).getByRole('meter', { name: 'Sorties' })
    expect(outings).toHaveAttribute('aria-valuenow', '9000')
    expect(text(outings.getAttribute('aria-valuetext')!)).toContain(
      'rythme du mois : 65 €',
    )
    // One target per envelope: the whole row notes an expense in it.
    const row = within(card).getByRole('button', {
      name: 'Ajouter une dépense Sorties',
    })
    expect(row).toContainElement(outings)
    expect(row).toHaveTextContent(text('Reste 60 € · en avance'))
    // What was noted by hand isn't repeated in the row (owner: too much room).
    expect(row).not.toHaveTextContent('noté à la main')
    const shopping = within(card).getByRole('button', {
      name: 'Ajouter une dépense Shopping',
    })
    expect(shopping).toHaveTextContent(text('Reste 80 €'))
    expect(shopping).not.toHaveTextContent('en avance')
    // No link to the transactions from the rows any more.
    expect(
      within(card).queryByRole('link', { name: /Opérations/ }),
    ).not.toBeInTheDocument()
  })

  it('notes an expense in an envelope, step by step, today in Paris on the checking account', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(
      await screen.findByRole('button', {
        name: 'Ajouter une dépense Sorties',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    // The envelope chose the category: straight to the amount, focused
    // (desktop: a field, no keypad).
    expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Montant2/3',
    )
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Montant')).toHaveFocus(),
    )
    expect(
      within(dialog).queryByRole('group', { name: 'Pavé numérique' }),
    ).not.toBeInTheDocument()

    // Back to the category: envelopes first, then the other expense
    // categories; never income.
    await user.click(within(dialog).getByRole('button', { name: 'Retour' }))
    await waitFor(() => expect(chosenCategory(dialog)).toBe('Sorties'))
    expect(categoryNames(dialog)).toEqual(['Shopping', 'Sorties', 'Courses'])
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))

    // The amount is required before moving on.
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    expect(within(dialog).getByText('Indiquez un montant')).toBeInTheDocument()
    // Only an amount the API takes: a third decimal is refused.
    await user.type(within(dialog).getByLabelText('Montant'), '12,505')
    expect(within(dialog).getByLabelText('Montant')).toHaveValue('12,50')
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))

    // Details: today by default, the checking account under the options.
    expect(within(dialog).getByText('− 12,50 €')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-13')
    expect(
      within(dialog).getByRole('radio', { name: 'Aujourd’hui' }),
    ).toHaveAttribute('aria-checked', 'true')
    await user.click(
      within(dialog).getByRole('button', { name: /Plus d’options/ }),
    )
    const accountSelect = within(dialog).getByLabelText('Compte')
    await waitFor(() => expect(accountSelect).toHaveValue(CHECKING))
    expect(optionNames(accountSelect)).toEqual(['Livret A', 'Compte courant'])
    await user.type(within(dialog).getByLabelText('Libellé'), ' Ciné ')
    await user.click(within(dialog).getByRole('radio', { name: 'Hier' }))
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-12')
    expect(api.transactionsControllerCreateManual).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))

    await waitFor(() =>
      expect(api.transactionsControllerCreateManual).toHaveBeenCalledWith({
        body: {
          amountCents: 1_250,
          kind: 'expense',
          direction: 'out',
          categoryId: OUTINGS,
          bookingDate: '2026-11-12',
          label: 'Ciné',
          accountId: CHECKING,
          isOneOff: false,
          note: null,
        },
        throwOnError: false,
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    // The envelopes are refetched.
    expect(api.budgetsControllerEnvelopes.mock.calls.length).toBeGreaterThan(1)
  })

  it('works with a physical keyboard: the amount typed, Enter moves on and adds', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(
      await screen.findByRole('button', { name: 'Ajouter une dépense' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Catégorie1/3',
    )
    await waitFor(() => expect(chosenCategory(dialog)).toBe('Shopping'))
    // A tap on a category moves on to the amount, focused.
    await user.click(within(dialog).getByRole('radio', { name: 'Courses' }))
    const amount = within(dialog).getByLabelText('Montant')
    await waitFor(() => expect(amount).toHaveFocus())
    await user.keyboard('42.5{Backspace}9')
    expect(amount).toHaveValue('42,9')
    await user.keyboard('{Enter}')
    expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Détails3/3',
    )
    await waitFor(() =>
      expect(within(dialog).getByRole('heading', { level: 3 })).toHaveFocus(),
    )
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(api.transactionsControllerCreateManual).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            amountCents: 4_290,
            categoryId: GROCERIES,
          }) as unknown,
        }),
      ),
    )
  })

  it('types the amount on its own keypad on a phone, never the system keyboard', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('max-width'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    )
    try {
      api.transactionsControllerManualSuggestions.mockImplementation(() =>
        ok({
          items: [{ label: 'Boulangerie test', categoryId: GROCERIES }],
          categoryIds: [],
        }),
      )
      const user = userEvent.setup()
      renderCard()

      await user.click(
        await screen.findByRole('button', { name: 'Ajouter une dépense' }),
      )
      const dialog = await screen.findByRole('dialog')
      // A usual merchant: one tap for the label and its category.
      await user.click(
        within(
          await within(dialog).findByRole('list', { name: 'Habituels' }),
        ).getByRole('button', { name: /Boulangerie test/ }),
      )
      const amount = within(dialog).getByLabelText('Montant')
      // The field only shows the amount: not focused, not typed in.
      expect(amount).not.toHaveFocus()
      expect(amount).toHaveAttribute('readonly')
      expect(amount).toHaveAttribute('inputmode', 'none')
      expect(
        within(dialog).getByText('Courses · Boulangerie test'),
      ).toBeVisible()
      const keypad = within(dialog).getByRole('group', {
        name: 'Pavé numérique',
      })
      for (const key of ['0', '1', '2', ',', '5', '0', '7']) {
        await user.click(within(keypad).getByRole('button', { name: key }))
      }
      expect(amount).toHaveValue('12,50')
      await user.click(within(keypad).getByRole('button', { name: 'Effacer' }))
      expect(amount).toHaveValue('12,5')
      // "Suivant" is a key of the keypad.
      await user.click(within(keypad).getByRole('button', { name: 'Suivant' }))
      await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))
      await waitFor(() =>
        expect(api.transactionsControllerCreateManual).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              amountCents: 1_250,
              categoryId: GROCERIES,
              label: 'Boulangerie test',
            }) as unknown,
          }),
        ),
      )
    } finally {
      matchMedia.mockRestore()
    }
  })

  it('offers the usual labels with their category', async () => {
    api.transactionsControllerManualSuggestions.mockImplementation(() =>
      ok({
        items: [
          { label: 'Boulangerie test', categoryId: GROCERIES },
          { label: 'Cinéma test', categoryId: OUTINGS },
          { label: 'Marché test', categoryId: null },
        ],
        categoryIds: [GROCERIES],
      }),
    )
    const user = userEvent.setup()
    renderCard()

    await user.click(
      await screen.findByRole('button', { name: 'Ajouter une dépense' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(api.transactionsControllerManualSuggestions).toHaveBeenCalledWith({
      query: { kind: 'expense' },
      throwOnError: false,
    })
    // The most used category by default, listed after the envelopes.
    await waitFor(() => expect(chosenCategory(dialog)).toBe('Courses'))
    expect(categoryNames(dialog)).toEqual(['Shopping', 'Sorties', 'Courses'])
    const habits = within(dialog).getByRole('list', { name: 'Habituels' })
    expect(
      within(habits)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Boulangerie test · Courses',
      'Cinéma test · Sorties',
      'Marché test',
    ])

    // A tap fills the label and its usual category, and moves on.
    await user.click(within(habits).getByRole('button', { name: /Cinéma/ }))
    expect(within(dialog).getByText('Sorties · Cinéma test')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Retour' }))
    expect(chosenCategory(dialog)).toBe('Sorties')
    expect(
      within(dialog).getByRole('button', { name: /Cinéma/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    // A label without a usual category keeps the chosen one.
    await user.click(
      within(dialog).getByRole('button', { name: 'Marché test' }),
    )
    expect(within(dialog).getByText('Sorties · Marché test')).toBeVisible()

    await user.type(within(dialog).getByLabelText('Montant'), '4,20')
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    expect(within(dialog).getByLabelText('Libellé')).toHaveValue('Marché test')
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() =>
      expect(api.transactionsControllerCreateManual).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            amountCents: 420,
            categoryId: OUTINGS,
            label: 'Marché test',
          }) as unknown,
        }),
      ),
    )
  })

  it('sets the sign from the kind; a transfer asks for it', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(
      await screen.findByRole('button', { name: 'Ajouter une dépense' }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).queryByRole('radiogroup', { name: 'Sens' }),
    ).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: 'Virement' }))
    const direction = within(dialog).getByRole('radiogroup', { name: 'Sens' })
    expect(
      within(direction).getByRole('radio', { name: 'Sortie' }),
    ).toHaveAttribute('aria-checked', 'true')
    await user.click(within(direction).getByRole('radio', { name: 'Entrée' }))
    // A transfer needs no category.
    expect(chosenCategory(dialog)).toBe('Sans catégorie')
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    await user.type(within(dialog).getByLabelText('Montant'), '100')
    expect(within(dialog).getByText('+')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))
    expect(
      within(dialog).getByText('Sans catégorie, indiquez un libellé'),
    ).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Libellé'), 'Épargne')
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() =>
      expect(api.transactionsControllerCreateManual).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            kind: 'transfer',
            direction: 'in',
            categoryId: null,
            label: 'Épargne',
          }) as unknown,
        }),
      ),
    )
  })

  it('refuses a date in the future', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(
      await screen.findByRole('button', { name: 'Ajouter une dépense' }),
    )
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(chosenCategory(dialog)).toBe('Shopping'))
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    await user.type(within(dialog).getByLabelText('Montant'), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    const date = within(dialog).getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-11-14')
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))
    expect(
      within(dialog).getByText('La date ne peut pas être dans le futur'),
    ).toBeInTheDocument()
    expect(api.transactionsControllerCreateManual).not.toHaveBeenCalled()
  })

  it('invites to choose envelopes when none is followed', async () => {
    api.budgetsControllerEnvelopes.mockImplementation(() =>
      ok({ ...envelopes, items: [] }),
    )
    renderCard()

    expect(
      await screen.findByRole('link', { name: 'Choisir les enveloppes' }),
    ).toHaveAttribute('href', '/budget')
    expect(screen.queryByText(/Jour 13/)).not.toBeInTheDocument()
  })
})

describe('ManualTransactionSheet (editing)', () => {
  const expense = {
    id: 'e0000000-0000-4000-8000-000000000001',
    accountId: CHECKING,
    accountName: 'Compte courant',
    importId: null,
    bookingDate: '2026-11-08',
    valueDate: null,
    amountCents: -2_500,
    rawLabel: 'Ciné',
    merchant: null,
    kind: 'expense',
    categoryId: OUTINGS,
    category: categories[1],
    ruleId: null,
    needsReview: false,
    isOneOff: false,
    note: null,
    manual: true,
    originalAmountCents: null,
    originalBookingDate: null,
    counterpartAccountId: null,
    counterpartAccountName: null,
    splits: [],
    createdAt: STAMP,
    updatedAt: STAMP,
  } as TransactionDto

  function renderSheet(onOpenChange = vi.fn(), item = expense) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    // Lists already cached (as after a first opening): the defaults must not
    // override the expense's own values set in the same render.
    queryClient.setQueryData(referenceKeys.categories, categories)
    queryClient.setQueryData(referenceKeys.accounts, accounts)
    render(
      <QueryClientProvider client={queryClient}>
        <ManualTransactionSheet
          open
          onOpenChange={onOpenChange}
          expense={item}
        />
      </QueryClientProvider>,
    )
    return onOpenChange
  }

  it('starts from the expense and saves the changes', async () => {
    api.transactionsControllerUpdateManual.mockImplementation(() => ok(expense))
    const user = userEvent.setup()
    renderSheet()

    const dialog = await screen.findByRole('dialog')
    // An edit opens on the details, with the expense's own values.
    expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Détails3/3',
    )
    expect(within(dialog).getByText('− 25 €')).toBeInTheDocument()
    // Nothing optional is set: the options stay folded.
    expect(
      within(dialog).getByRole('button', { name: /Plus d’options/ }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(within(dialog).queryByLabelText('Compte')).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-08')
    expect(within(dialog).getByLabelText('Libellé')).toHaveValue('Ciné')

    await user.click(within(dialog).getByRole('button', { name: 'Retour' }))
    const amount = within(dialog).getByLabelText('Montant')
    expect(amount).toHaveValue('25')
    await user.clear(amount)
    await user.type(amount, '27')
    // Once the lists are loaded, the expense's own category is kept.
    await user.click(within(dialog).getByRole('button', { name: 'Retour' }))
    await waitFor(() => expect(categoryNames(dialog)).toHaveLength(3))
    expect(chosenCategory(dialog)).toBe('Sorties')
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )
    await waitFor(() =>
      expect(api.transactionsControllerUpdateManual).toHaveBeenCalledWith({
        path: { id: expense.id },
        body: {
          amountCents: 2_700,
          kind: 'expense',
          direction: 'out',
          categoryId: OUTINGS,
          bookingDate: '2026-11-08',
          label: 'Ciné',
          accountId: CHECKING,
          isOneOff: false,
          note: null,
        },
        throwOnError: false,
      }),
    )
  })

  it('shows the options of a refund, and keeps its sign', async () => {
    const refund = { ...expense, amountCents: 1_500, note: 'Avoir' }
    api.transactionsControllerUpdateManual.mockImplementation(() => ok(refund))
    const user = userEvent.setup()
    renderSheet(vi.fn(), refund)

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('button', { name: /Plus d’options/ }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByLabelText('Sens')).toHaveValue('in')
    expect(within(dialog).getByLabelText('Note')).toHaveValue('Avoir')
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )
    await waitFor(() =>
      expect(api.transactionsControllerUpdateManual).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            amountCents: 1_500,
            direction: 'in',
            note: 'Avoir',
          }) as unknown,
        }),
      ),
    )
  })

  it('deletes it after confirmation', async () => {
    api.transactionsControllerRemoveManual.mockImplementation(() =>
      Promise.resolve({ response: { ok: true, status: 204 } }),
    )
    const user = userEvent.setup()
    const onOpenChange = renderSheet()

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    const confirm = await screen.findByRole('dialog', {
      name: 'Supprimer cette opération ?',
    })
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(api.transactionsControllerRemoveManual).toHaveBeenCalledWith({
        path: { id: expense.id },
        throwOnError: false,
      }),
    )
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})

describe('ManualTransactionSheet with a meal-voucher card (#298)', () => {
  const VOUCHER = 'a0000000-0000-4000-8000-000000000004'
  const RESTAURANTS = 'c0000000-0000-4000-8000-000000000005'
  const VOUCHERS = 'c0000000-0000-4000-8000-000000000006'
  const withSlug = (
    id: string,
    slug: string,
    name: string,
    kind: CategoryDto['kind'],
  ) => ({
    ...category(id, name, kind),
    slug,
  })
  const voucherCategories = [
    withSlug(
      RESTAURANTS,
      'restaurants_cafes',
      'Restaurants & cafés',
      'expense',
    ),
    withSlug(OUTINGS, 'leisure', 'Sorties', 'expense'),
    withSlug(VOUCHERS, 'meal_vouchers', 'Titres-restaurant', 'income'),
  ]

  function renderSheet(props: {
    initialCategoryId?: string
    initialKind?: 'expense' | 'income'
  }) {
    api.accountsControllerList.mockImplementation(() =>
      ok([...accounts, account(VOUCHER, 'Titres-restaurant', 'meal_voucher')]),
    )
    api.categoriesControllerList.mockImplementation(() => ok(voucherCategories))
    api.transactionsControllerCreateManual.mockImplementation(() =>
      ok({ amountCents: -980, category: voucherCategories[0] }),
    )
    // 15 € already paid with the card today: 10 € left under the cap.
    api.transactionsControllerList.mockImplementation(() =>
      ok({
        items: [{ id: 'p1', amountCents: -1_500 }],
        total: 1,
        page: 1,
        limit: 100,
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <ManualTransactionSheet open onOpenChange={vi.fn()} {...props} />
      </QueryClientProvider>,
    )
  }

  it('offers « Payé avec » for a restaurant, the bank account by default', async () => {
    const user = userEvent.setup()
    renderSheet({ initialCategoryId: RESTAURANTS })
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Montant'), '9,80')
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))

    const paidWith = await within(dialog).findByRole('group', {
      name: 'Payé avec',
    })
    await waitFor(() =>
      expect(
        within(paidWith).getByRole('radio', { name: 'Compte courant' }),
      ).toHaveAttribute('aria-checked', 'true'),
    )
    await user.click(
      within(paidWith).getByRole('radio', { name: 'Titres-restaurant' }),
    )
    // The day's gauge under the choice: 15 € paid, 9,80 € now, 0,20 € left.
    expect(
      await within(dialog).findByText(/Plafond 25 € · aujourd’hui/),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/Reste 0,20 €/)).toBeInTheDocument()
    expect(api.transactionsControllerList).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          accountId: VOUCHER,
          from: '2026-11-13',
          to: '2026-11-13',
          kind: 'expense',
        }),
      }),
    )
    // Over what is left: the most it can pay, « Ajouter » greyed out.
    await user.click(within(dialog).getByRole('button', { name: 'Retour' }))
    await user.clear(within(dialog).getByLabelText('Montant'))
    await user.type(within(dialog).getByLabelText('Montant'), '10,01')
    expect(within(dialog).getByText(/10 € max/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    expect(within(dialog).getByText(/10 € max/)).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Ajouter' }),
    ).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'Retour' }))
    await user.clear(within(dialog).getByLabelText('Montant'))
    await user.type(within(dialog).getByLabelText('Montant'), '9,80')
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() =>
      expect(api.transactionsControllerCreateManual).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            amountCents: 980,
            kind: 'expense',
            categoryId: RESTAURANTS,
            accountId: VOUCHER,
          }),
        }),
      ),
    )
  })

  it('puts the credit on the card at once, the choice in view while it stays chosen', async () => {
    const user = userEvent.setup()
    renderSheet({ initialKind: 'income' })
    const dialog = await screen.findByRole('dialog')
    await user.click(
      await within(dialog).findByRole('radio', { name: 'Titres-restaurant' }),
    )
    await user.type(within(dialog).getByLabelText('Montant'), '189')
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    const creditedTo = await within(dialog).findByRole('group', {
      name: 'Crédité sur',
    })
    expect(
      within(creditedTo).getByRole('radio', { name: 'Titres-restaurant' }),
    ).toHaveAttribute('aria-checked', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() =>
      expect(api.transactionsControllerCreateManual).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            amountCents: 18_900,
            kind: 'income',
            categoryId: VOUCHERS,
            accountId: VOUCHER,
          }),
        }),
      ),
    )

    // An expense outside food on the card still shows where it goes.
    await user.click(within(dialog).getByRole('button', { name: 'Retour' }))
    await user.click(within(dialog).getByRole('button', { name: 'Retour' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Dépense' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Sorties' }))
    await user.click(within(dialog).getByRole('button', { name: 'Suivant' }))
    expect(
      within(dialog).queryByRole('group', { name: 'Payé avec' }),
    ).toBeInTheDocument()
  })
})
