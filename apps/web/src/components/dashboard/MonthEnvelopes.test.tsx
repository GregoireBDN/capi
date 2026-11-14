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
const categories = [
  category(SHOPPING, 'Shopping', 'expense'),
  category(OUTINGS, 'Sorties', 'expense'),
  category('c0000000-0000-4000-8000-000000000003', 'Salaire', 'income'),
]

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
    const link = within(card).getByRole('link', {
      name: 'Opérations Sorties du mois',
    })
    expect(link).toHaveAttribute(
      'href',
      `/transactions?month=2026-11&category=${OUTINGS}&kind=expense`,
    )
    expect(link).toHaveTextContent(text('Reste 60 € · en avance'))
    expect(link).toHaveTextContent(text('dont 25 € noté à la main'))
    const shopping = within(card).getByRole('link', {
      name: 'Opérations Shopping du mois',
    })
    expect(shopping).toHaveTextContent(text('Reste 80 €'))
    expect(shopping).not.toHaveTextContent('en avance')
  })

  it('notes an expense in an envelope, today in Paris on the checking account', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(
      await screen.findByRole('button', {
        name: 'Ajouter une dépense Sorties',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    const categorySelect = within(dialog).getByLabelText('Catégorie')
    await waitFor(() => expect(categorySelect).toHaveValue(OUTINGS))
    // Envelopes first, income categories never offered.
    expect(
      within(categorySelect)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Shopping', 'Sorties'])
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-13')
    // Only cash accounts; the checking one by default.
    const accountSelect = within(dialog).getByLabelText('Compte')
    await waitFor(() => expect(accountSelect).toHaveValue(CHECKING))
    expect(
      within(accountSelect)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Livret A', 'Compte courant'])

    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))
    expect(within(dialog).getByText('Indiquez un montant')).toBeInTheDocument()
    expect(api.transactionsControllerCreateManual).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Montant'), '12,50')
    await user.type(within(dialog).getByLabelText('Libellé'), ' Ciné ')
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }))

    await waitFor(() =>
      expect(api.transactionsControllerCreateManual).toHaveBeenCalledWith({
        body: {
          amountCents: 1_250,
          kind: 'expense',
          direction: 'out',
          categoryId: OUTINGS,
          bookingDate: '2026-11-13',
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

  it('refuses a date in the future', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(
      await screen.findByRole('button', { name: 'Ajouter une dépense' }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Montant'), '5')
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
    splits: [],
    createdAt: STAMP,
    updatedAt: STAMP,
  } as TransactionDto

  function renderSheet(onOpenChange = vi.fn()) {
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
          expense={expense}
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
    const categorySelect = within(dialog).getByLabelText('Catégorie')
    // Once the lists are loaded, the expense's own values are kept.
    await waitFor(() =>
      expect(within(categorySelect).getAllByRole('option')).toHaveLength(2),
    )
    expect(categorySelect).toHaveValue(OUTINGS)
    expect(within(dialog).getByLabelText('Compte')).toHaveValue(CHECKING)
    expect(within(dialog).getByLabelText('Montant')).toHaveValue('25')
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-08')
    expect(within(dialog).getByLabelText('Libellé')).toHaveValue('Ciné')

    const amount = within(dialog).getByLabelText('Montant')
    await user.clear(amount)
    await user.type(amount, '27')
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
