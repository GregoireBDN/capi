import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  CategoryDto,
  TransactionDto,
  TransactionSummaryDto,
} from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import type { TransactionsSearch } from './search'
import { TransactionsPage } from './TransactionsPage'

const api = vi.hoisted(() => ({
  accountsControllerList: vi.fn(),
  categoriesControllerList: vi.fn(),
  transactionsControllerList: vi.fn(),
  transactionsControllerSummary: vi.fn(),
  transactionsControllerUpdate: vi.fn(),
  transactionsControllerBulkUpdate: vi.fn(),
  transactionsControllerReviewCount: vi.fn(),
  transactionsControllerCreateManual: vi.fn(),
  transactionsControllerManualSuggestions: vi.fn(),
  transactionsControllerUpdateManual: vi.fn(),
  transactionsControllerRemoveManual: vi.fn(),
  transactionsControllerSplit: vi.fn(),
  transactionsControllerUnsplit: vi.fn(),
  transactionsControllerCorrect: vi.fn(),
  transactionsControllerRestoreBankValues: vi.fn(),
  categorizationRulesControllerSuggest: vi.fn(),
  categorizationRulesControllerPreview: vi.fn(),
  categorizationRulesControllerCreate: vi.fn(),
  categorizationRulesControllerApply: vi.fn(),
  coverageControllerCoverage: vi.fn(),
}))
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
)

vi.mock('#/api', () => api)

// The sheet's kind picker (Radix toggle group) measures itself.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent in jsdom despite the DOM typings
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const euros = (cents: number) => formatCents(cents).replace(/\s/g, ' ')

/** Synthetic data only. */
const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001'
const accounts: AccountDto[] = [
  {
    id: ACCOUNT_ID,
    name: 'Compte test',
    type: 'checking',
  } as AccountDto,
  {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'PEA test',
    type: 'brokerage',
  } as AccountDto,
]
function category(
  n: number,
  name: string,
  kind: CategoryDto['kind'],
): CategoryDto {
  return {
    id: `c0000000-0000-4000-8000-00000000000${n}`,
    slug: name.toLowerCase(),
    name,
    kind,
    color: '#d97706',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  }
}
const groceries = category(1, 'Courses', 'expense')
const salary = category(2, 'Salaire', 'income')
const savings = category(3, 'Épargne', 'transfer')
const categories = [groceries, salary, savings]

function transaction(
  n: number,
  overrides: Partial<TransactionDto> = {},
): TransactionDto {
  return {
    id: `a0000000-0000-4000-8000-00000000000${n}`,
    accountId: ACCOUNT_ID,
    accountName: 'Compte test',
    importId: null,
    bookingDate: '2026-11-03',
    valueDate: null,
    amountCents: -1_234,
    rawLabel: `PAIEMENT CB FAKESHOP ${n}`,
    merchant: null,
    kind: 'expense',
    categoryId: null,
    category: null,
    ruleId: null,
    needsReview: false,
    isOneOff: false,
    note: null,
    manual: false,
    originalAmountCents: null,
    originalBookingDate: null,
    splits: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

const salaryRow = transaction(1, {
  bookingDate: '2026-11-04',
  rawLabel: 'VIR SEPA FAKE EMPLOYER',
  amountCents: 250_000,
  kind: 'income',
})
const shopRow = transaction(2, {
  bookingDate: '2026-11-03',
  rawLabel: 'PAIEMENT CB 0311 FAKEMART TESTVILLE',
  merchant: 'Fakemart',
  amountCents: -4_550,
  needsReview: true,
})
const transferRow = transaction(3, {
  bookingDate: '2026-11-03',
  rawLabel: 'VIR LIVRET TEST',
  amountCents: -50_000,
  kind: 'transfer',
  categoryId: savings.id,
  category: { ...savings },
  isOneOff: true,
  note: 'Épargne de précaution',
})
const rows = [salaryRow, shopRow, transferRow]

const summary: TransactionSummaryDto = {
  count: 3,
  incomeCents: 250_000,
  expenseCents: -4_550,
  netCents: 245_450,
  oneOffIncomeCents: 0,
  oneOffExpenseCents: -1_000,
  transferCount: 1,
}

function ok<T>(data: T) {
  return Promise.resolve({ data, response: { ok: true, status: 200 } })
}
function failed() {
  return Promise.resolve({
    data: undefined,
    error: {},
    response: { ok: false, status: 500 },
  })
}

function listOf(items: TransactionDto[], total = items.length) {
  return ok({ items, total, page: 1, limit: 50 })
}

/** The last query sent to an endpoint. */
function lastQuery(fn: typeof api.transactionsControllerList) {
  return (fn.mock.calls.at(-1)?.[0] as { query: object }).query
}

function lastToastAction() {
  const options = toast.success.mock.calls.at(-1)?.[1] as {
    action: { label: string; onClick: () => void }
  }
  return options.action
}

/** Holds the search params like the router would. */
function Harness({
  initial,
  onChange,
}: {
  initial: TransactionsSearch
  onChange: (next: TransactionsSearch, options?: { replace?: boolean }) => void
}) {
  const [search, setSearch] = useState(initial)
  return (
    <TransactionsPage
      search={search}
      onSearchChange={(next, options) => {
        onChange(next, options)
        setSearch(next)
      }}
    />
  )
}

function setup(initial: TransactionsSearch = {}) {
  const onChange = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <Harness initial={initial} onChange={onChange} />
    </QueryClientProvider>,
  )
  return { user, onChange }
}

/**
 * Waits for the first page of rows (coverage, then the list), then returns the
 * salary row's edit button.
 *
 * The wait uses a text query on purpose: the first role query of a worker
 * spends 0.1 s (idle) to 0.75 s (loaded runner) warming up the accessibility
 * tree code, and inside `findByRole` that time counts against the 1 s budget
 * of the async utilities, so the file's first test failed on a busy CI runner
 * (#240). Out of the wait, it is paid once and never times out.
 */
async function waitForRows() {
  await screen.findByText(salaryRow.rawLabel)
  return screen.getByRole('button', { name: `Modifier ${salaryRow.rawLabel}` })
}

beforeEach(() => {
  vi.resetAllMocks()
  // "Today" is November 2026 in Europe/Paris; only Date is faked.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
  api.accountsControllerList.mockReturnValue(ok(accounts))
  api.categoriesControllerList.mockReturnValue(ok(categories))
  api.coverageControllerCoverage.mockReturnValue(
    ok({
      dataUntil: '2026-11-03',
      currentMonth: '2026-11',
      defaultMonth: '2026-11',
      months: ['2026-09', '2026-10', '2026-11'],
    }),
  )
  api.transactionsControllerManualSuggestions.mockReturnValue(
    ok({ items: [], categoryIds: [] }),
  )
  api.transactionsControllerList.mockReturnValue(listOf(rows))
  api.transactionsControllerSummary.mockReturnValue(ok(summary))
  api.transactionsControllerReviewCount.mockReturnValue(ok({ count: 1 }))
  api.categorizationRulesControllerSuggest.mockReturnValue(
    ok({
      matchType: 'contains',
      labelPattern: 'FAKEMART',
      categoryId: groceries.id,
      kind: null,
    }),
  )
  api.categorizationRulesControllerPreview.mockReturnValue(
    ok({ matched: 3, leavingReview: 2 }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TransactionsPage', () => {
  it('loads the current month and shows its summary, transfers excluded', async () => {
    setup()
    await waitForRows()

    expect(lastQuery(api.transactionsControllerList)).toEqual({
      month: '2026-11',
      sort: 'date_desc',
      page: 1,
      limit: 50,
    })
    expect(lastQuery(api.transactionsControllerSummary)).toEqual({
      month: '2026-11',
    })
    expect(screen.getByText('Novembre 2026')).toBeInTheDocument()

    const totals = await screen.findByRole('region', { name: 'Résumé' })
    expect(within(totals).getByText('Revenus').nextSibling).toHaveTextContent(
      euros(250_000),
    )
    expect(within(totals).getByText('Dépenses').nextSibling).toHaveTextContent(
      euros(-4_550),
    )
    expect(within(totals).getByText('Solde').nextSibling).toHaveTextContent(
      euros(245_450),
    )
    expect(
      within(totals).getByText('Opérations').nextSibling,
    ).toHaveTextContent('3')
    expect(
      within(totals).getByText(`dont ponctuelles ${euros(-1_000)}`),
    ).toBeInTheDocument()
    expect(totals).toHaveTextContent(
      'Mouvements internes exclus des revenus et des dépenses (1 virement entre vos comptes).',
    )
  })

  it('opens on the month the data stops in while the current one is empty', async () => {
    api.coverageControllerCoverage.mockReturnValue(
      ok({
        dataUntil: '2026-09-30',
        currentMonth: '2026-11',
        defaultMonth: '2026-09',
        months: ['2026-08', '2026-09'],
      }),
    )
    const { user, onChange } = setup()
    await waitForRows()

    // Never asked for the empty current month first.
    expect(
      api.transactionsControllerList.mock.calls.map(
        (call) => (call[0] as { query: { month?: string } }).query.month,
      ),
    ).toEqual(['2026-09'])
    expect(lastQuery(api.transactionsControllerSummary)).toEqual({
      month: '2026-09',
    })
    expect(
      screen.getByRole('button', { name: 'Septembre 2026, choisir un mois' }),
    ).toBeInTheDocument()

    // A later month goes in the URL; back to September, it leaves it.
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(onChange).toHaveBeenLastCalledWith({ month: '2026-10' }, undefined)
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(onChange).toHaveBeenLastCalledWith({}, undefined)
  })

  it('falls back to the current month when the coverage cannot be read', async () => {
    api.coverageControllerCoverage.mockReturnValue(failed())
    setup()
    await waitForRows()
    expect(lastQuery(api.transactionsControllerSummary)).toEqual({
      month: '2026-11',
    })
  })

  it('groups rows by day with the day total, transfers excluded', async () => {
    setup()
    await waitForRows()

    const nov3 = screen.getByRole('region', { name: 'Mardi 3 novembre 2026' })
    // -45,50 € for the purchase; the -500 € transfer is left out.
    expect(within(nov3).getByRole('heading')).toHaveTextContent(euros(-4_550))
    const shop = within(nov3).getByRole('listitem', { name: 'Fakemart' })
    expect(shop).toHaveTextContent('Sans catégorie')
    expect(shop).toHaveTextContent('À revoir')
    const transfer = within(nov3).getByRole('listitem', {
      name: transferRow.rawLabel,
    })
    expect(transfer).toHaveTextContent('Épargne')
    expect(transfer).toHaveTextContent('Ponctuelle')
    expect(transfer).toHaveTextContent('Interne')
    expect(transfer).toHaveTextContent('Note : Épargne de précaution')
    expect(
      screen.getByRole('region', { name: 'Mercredi 4 novembre 2026' }),
    ).toBeInTheDocument()
  })

  it('reads the filters from the URL', async () => {
    setup({
      month: 'all',
      account: ACCOUNT_ID,
      category: 'none',
      kind: 'expense',
      q: 'fake',
      review: true,
      oneOff: true,
      sort: 'amount_asc',
    })
    await waitForRows()

    expect(lastQuery(api.transactionsControllerList)).toEqual({
      accountId: ACCOUNT_ID,
      uncategorized: true,
      kind: 'expense',
      q: 'fake',
      needsReview: true,
      isOneOff: true,
      sort: 'amount_asc',
      page: 1,
      limit: 50,
    })
    expect(
      screen.getByRole('button', { name: 'Toutes les dates' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Rechercher une opération')).toHaveValue(
      'fake',
    )
    expect(screen.getByLabelText('Catégorie')).toHaveValue('none')
    expect(screen.getByLabelText('Tri')).toHaveValue('amount_asc')
    // Sorted by amount: a flat list, dates in the rows.
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Opérations' })).toBeInTheDocument()
  })

  it('writes filter changes to the URL and refetches', async () => {
    const { user, onChange } = setup()
    await waitForRows()

    // Only transactional accounts are offered.
    const account = screen.getByLabelText('Compte')
    expect(within(account).queryByText('PEA test')).not.toBeInTheDocument()
    await user.selectOptions(account, ACCOUNT_ID)
    expect(onChange).toHaveBeenLastCalledWith(
      { account: ACCOUNT_ID },
      undefined,
    )

    await user.selectOptions(screen.getByLabelText('Catégorie'), 'none')
    await user.selectOptions(screen.getByLabelText('Type'), 'transfer')
    await user.click(screen.getByRole('button', { name: 'À revoir' }))
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))

    expect(onChange).toHaveBeenLastCalledWith(
      {
        account: ACCOUNT_ID,
        category: 'none',
        kind: 'transfer',
        review: true,
        month: '2026-10',
      },
      undefined,
    )
    await waitFor(() =>
      expect(lastQuery(api.transactionsControllerSummary)).toEqual({
        month: '2026-10',
        accountId: ACCOUNT_ID,
        uncategorized: true,
        kind: 'transfer',
        needsReview: true,
      }),
    )
    expect(screen.getByText('Octobre 2026')).toBeInTheDocument()

    // Back to the current month: the default, kept out of the URL.
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty('month')
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled()

    // The whole history: no month sent at all.
    await user.click(screen.getByRole('button', { name: 'Toutes les dates' }))
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ month: 'all' })
    await waitFor(() =>
      expect(lastQuery(api.transactionsControllerSummary)).not.toHaveProperty(
        'month',
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(onChange).toHaveBeenLastCalledWith({}, undefined)
    await waitFor(() =>
      expect(lastQuery(api.transactionsControllerSummary)).toEqual({
        month: '2026-11',
      }),
    )
  })

  it('debounces the search box into the URL (history replaced)', async () => {
    const { user, onChange } = setup()
    await waitForRows()

    await user.type(screen.getByLabelText('Rechercher une opération'), 'fake')
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ q: 'fake' }, { replace: true }),
    )
    // One URL update for the whole word.
    expect(onChange).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(lastQuery(api.transactionsControllerList)).toMatchObject({
        q: 'fake',
      }),
    )
  })

  it('recategorizes a row, offers a rule and undoes', async () => {
    const { user } = setup()
    await waitForRows()
    api.transactionsControllerUpdate.mockReturnValue(
      ok({
        ...shopRow,
        categoryId: groceries.id,
        category: { ...groceries },
        needsReview: false,
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Modifier Fakemart' }))
    const editor = await screen.findByRole('dialog')
    await user.selectOptions(
      within(editor).getByLabelText('Catégorie de Fakemart'),
      groceries.id,
    )

    expect(api.transactionsControllerUpdate).toHaveBeenCalledWith({
      path: { id: shopRow.id },
      body: { categoryId: groceries.id },
      throwOnError: false,
    })
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Classée dans « Courses »',
        expect.objectContaining({ description: 'Fakemart' }),
      ),
    )
    const row = screen.getByRole('listitem', { name: 'Fakemart' })
    expect(row).toHaveTextContent('Courses')
    expect(row).not.toHaveTextContent('À revoir')
    // Totals are refetched after the change.
    await waitFor(() =>
      expect(api.transactionsControllerSummary).toHaveBeenCalledTimes(2),
    )

    // The shared rule dialog, from the offer banner.
    const banner = screen.getByRole('region', { name: 'Créer une règle' })
    await user.click(
      within(banner).getByRole('button', {
        name: 'Créer une règle pour les opérations similaires',
      }),
    )
    await screen.findByRole('dialog', { name: 'Créer une règle' })
    expect(api.categorizationRulesControllerSuggest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          rawLabel: shopRow.rawLabel,
          categoryId: groceries.id,
        }),
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    // Undo restores the previous state (uncategorized, in review).
    api.transactionsControllerUpdate.mockReturnValue(ok(shopRow))
    lastToastAction().onClick()
    await waitFor(() =>
      expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith({
        path: { id: shopRow.id },
        body: {
          categoryId: null,
          kind: 'expense',
          isOneOff: false,
          needsReview: true,
        },
        throwOnError: false,
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('listitem', { name: 'Fakemart' }),
      ).toHaveTextContent('Sans catégorie'),
    )
    expect(
      screen.queryByRole('region', { name: 'Créer une règle' }),
    ).not.toBeInTheDocument()
  })

  it('rolls an edit back when the API refuses it', async () => {
    const { user } = setup()
    await waitForRows()
    api.transactionsControllerUpdate.mockReturnValue(failed())

    await user.click(screen.getByRole('button', { name: 'Modifier Fakemart' }))
    const editor = await screen.findByRole('dialog')
    await user.click(within(editor).getByRole('switch', { name: /Ponctuelle/ }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'La modification n’a pas pu être enregistrée.',
      ),
    )
    expect(
      within(editor).getByRole('switch', { name: /Ponctuelle/ }),
    ).not.toBeChecked()
  })

  it('saves a note and marks a row reviewed from the editor', async () => {
    const { user } = setup()
    await waitForRows()
    api.transactionsControllerUpdate.mockImplementation(
      ({ body }: { body: object }) => ok({ ...shopRow, ...body }),
    )

    await user.click(screen.getByRole('button', { name: 'Modifier Fakemart' }))
    const editor = await screen.findByRole('dialog')
    await user.click(within(editor).getByRole('switch', { name: /À revoir/ }))
    expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { needsReview: false } }),
    )

    await user.type(within(editor).getByLabelText('Note'), 'Cadeau')
    await user.click(
      within(editor).getByRole('button', { name: 'Enregistrer la note' }),
    )
    expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { note: 'Cadeau' } }),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenLastCalledWith(
        'Note enregistrée',
        expect.anything(),
      ),
    )

    // Undoing a note only puts the note back.
    lastToastAction().onClick()
    await waitFor(() =>
      expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: { note: '' } }),
      ),
    )
  })

  it('applies bulk changes to the selection, with undo', async () => {
    const { user } = setup()
    await waitForRows()
    api.transactionsControllerBulkUpdate.mockReturnValue(ok({ updated: 2 }))

    await user.click(
      screen.getByRole('checkbox', {
        name: `Sélectionner ${salaryRow.rawLabel}`,
      }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner Fakemart' }),
    )
    const bar = screen.getByRole('region', { name: 'Actions groupées' })
    expect(bar).toHaveTextContent('2 opérations sélectionnées')

    await user.selectOptions(
      within(bar).getByLabelText('Classer la sélection dans'),
      groceries.id,
    )

    expect(api.transactionsControllerBulkUpdate).toHaveBeenCalledWith({
      body: { categoryId: groceries.id, ids: [salaryRow.id, shopRow.id] },
      throwOnError: false,
    })
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        '2 opérations classées dans « Courses »',
        expect.anything(),
      ),
    )
    expect(
      screen.queryByRole('region', { name: 'Actions groupées' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('listitem', { name: salaryRow.rawLabel }),
    ).toHaveTextContent('Courses')

    // Undo puts each one back as it was (different states: one request each).
    api.transactionsControllerUpdate.mockReturnValue(ok(salaryRow))
    lastToastAction().onClick()
    await waitFor(() =>
      expect(api.transactionsControllerUpdate).toHaveBeenCalledTimes(2),
    )
    expect(api.transactionsControllerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: salaryRow.id },
        body: expect.objectContaining({ kind: 'income', needsReview: false }),
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('listitem', { name: salaryRow.rawLabel }),
      ).toHaveTextContent('Sans catégorie'),
    )
  })

  it('selects every loaded row and marks them reviewed', async () => {
    const { user } = setup()
    await waitForRows()
    api.transactionsControllerBulkUpdate.mockReturnValue(ok({ updated: 3 }))

    await user.click(screen.getByLabelText('Tout sélectionner'))
    const bar = screen.getByRole('region', { name: 'Actions groupées' })
    await user.click(
      within(bar).getByRole('button', { name: 'Marquer revues' }),
    )

    expect(api.transactionsControllerBulkUpdate).toHaveBeenCalledWith({
      body: {
        needsReview: false,
        ids: [salaryRow.id, shopRow.id, transferRow.id],
      },
      throwOnError: false,
    })
  })

  it('loads more pages', async () => {
    // Pages of one: the API caps `limit`, the page only reads `total`.
    api.transactionsControllerList
      .mockReturnValueOnce(
        ok({ items: [salaryRow], total: 2, page: 1, limit: 1 }),
      )
      .mockReturnValueOnce(
        ok({ items: [shopRow], total: 2, page: 2, limit: 1 }),
      )
    const { user } = setup()
    await waitForRows()

    await user.click(
      screen.getByRole('button', { name: 'Charger plus (1 restantes)' }),
    )

    await screen.findByRole('listitem', { name: 'Fakemart' })
    expect(lastQuery(api.transactionsControllerList)).toMatchObject({ page: 2 })
    expect(
      screen.queryByRole('button', { name: /Charger plus/ }),
    ).not.toBeInTheDocument()
  })

  it('shows an empty month: no zero tiles, the month with data, the import', async () => {
    api.transactionsControllerList.mockReturnValue(listOf([]))
    api.transactionsControllerSummary.mockReturnValue(
      ok({
        ...summary,
        count: 0,
        incomeCents: 0,
        expenseCents: 0,
        netCents: 0,
        oneOffExpenseCents: 0,
        transferCount: 0,
      }),
    )
    const { user, onChange } = setup()

    expect(
      await screen.findByText('Aucune opération en novembre 2026'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Vos relevés importés s’arrêtent au 3 nov.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Résumé' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Importer un relevé' }),
    ).toHaveAttribute('href', '/import')

    await user.click(screen.getByRole('button', { name: 'Voir octobre 2026' }))
    expect(onChange).toHaveBeenLastCalledWith({ month: '2026-10' }, undefined)
  })

  it('says when there is no transaction at all', async () => {
    api.coverageControllerCoverage.mockReturnValue(
      ok({
        dataUntil: null,
        currentMonth: '2026-11',
        defaultMonth: '2026-11',
        months: [],
      }),
    )
    api.transactionsControllerList.mockReturnValue(listOf([]))
    setup()

    expect(
      await screen.findByText(
        'Importez un relevé de compte ou ajoutez une opération : elles s’afficheront ici.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Voir / }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Importer un relevé' }),
    ).toBeInTheDocument()
  })

  it('offers to reset filters when nothing matches them', async () => {
    api.transactionsControllerList.mockReturnValue(listOf([]))
    const { user, onChange } = setup({ month: '2026-09', q: 'nothing' })

    await screen.findByText('Aucune opération ne correspond à ces filtres')
    await user.click(
      screen.getByRole('button', { name: 'Réinitialiser les filtres' }),
    )
    expect(onChange).toHaveBeenLastCalledWith({ month: '2026-09' }, undefined)
  })

  describe('editing in place (#74)', () => {
    const manualRow = transaction(4, {
      bookingDate: '2026-11-03',
      rawLabel: 'Marché',
      amountCents: -1_250,
      categoryId: groceries.id,
      category: { ...groceries },
      needsReview: false,
      manual: true,
    })

    it('moves between rows and edits them with the keyboard', async () => {
      const { user } = setup()
      await waitForRows()
      api.transactionsControllerUpdate.mockImplementation(
        ({ body }: { body: object }) => ok({ ...transferRow, ...body }),
      )

      screen.getByRole('button', { name: 'Modifier Fakemart' }).focus()
      await user.keyboard('{ArrowDown}')
      expect(
        screen.getByRole('button', {
          name: `Modifier ${transferRow.rawLabel}`,
        }),
      ).toHaveFocus()
      await user.keyboard('k')
      expect(
        screen.getByRole('button', { name: 'Modifier Fakemart' }),
      ).toHaveFocus()

      // C: the category of the row, chosen in place.
      await user.keyboard('c')
      const select = screen.getByLabelText('Catégorie de Fakemart')
      expect(select).toHaveFocus()
      api.transactionsControllerUpdate.mockReturnValueOnce(
        ok({
          ...shopRow,
          categoryId: groceries.id,
          category: { ...groceries },
        }),
      )
      await user.selectOptions(select, groceries.id)
      expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith({
        path: { id: shopRow.id },
        body: { categoryId: groceries.id },
        throwOnError: false,
      })
      // Escape hands the focus back to the row.
      await user.keyboard('{Escape}')
      expect(
        screen.getByRole('button', { name: 'Modifier Fakemart' }),
      ).toHaveFocus()

      // O toggles one-off, X the selection.
      await user.keyboard('j')
      await user.keyboard('o')
      expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith({
        path: { id: transferRow.id },
        body: { isOneOff: false },
        throwOnError: false,
      })
      await user.keyboard('x')
      expect(
        screen.getByRole('checkbox', {
          name: `Sélectionner ${transferRow.rawLabel}`,
        }),
      ).toBeChecked()
    })

    it('edits a note in the row: N, Enter saves, Escape cancels', async () => {
      const { user } = setup()
      await waitForRows()
      api.transactionsControllerUpdate.mockImplementation(
        ({ body }: { body: object }) => ok({ ...shopRow, ...body }),
      )

      screen.getByRole('button', { name: 'Modifier Fakemart' }).focus()
      await user.keyboard('n')
      const note = screen.getByLabelText('Note de Fakemart')
      expect(note).toHaveFocus()
      await user.type(note, 'Cadeau{Enter}')
      expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith({
        path: { id: shopRow.id },
        body: { note: 'Cadeau' },
        throwOnError: false,
      })
      expect(
        screen.queryByLabelText('Note de Fakemart'),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Modifier Fakemart' }),
      ).toHaveFocus()

      await user.keyboard('n')
      await user.type(screen.getByLabelText('Note de Fakemart'), 'X{Escape}')
      expect(api.transactionsControllerUpdate).toHaveBeenCalledTimes(1)
    })

    it('edits the amount of a manual row in place and undoes it with Ctrl+Z', async () => {
      api.transactionsControllerList.mockReturnValue(
        listOf([...rows, manualRow]),
      )
      api.transactionsControllerUpdateManual.mockImplementation(
        ({ body }: { body: { amountCents?: number } }) =>
          ok({ ...manualRow, amountCents: -(body.amountCents ?? 1_250) }),
      )
      const { user } = setup()
      await waitForRows()

      screen.getByRole('button', { name: 'Modifier Marché' }).focus()
      await user.keyboard('m')
      const amount = screen.getByLabelText('Montant de Marché')
      expect(amount).toHaveValue('12,50')
      await user.clear(amount)
      await user.type(amount, '30{Enter}')
      await waitFor(() =>
        expect(api.transactionsControllerUpdateManual).toHaveBeenCalledWith({
          path: { id: manualRow.id },
          body: { amountCents: 3_000 },
          throwOnError: false,
        }),
      )
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Montant modifié',
          expect.objectContaining({ description: 'Marché' }),
        ),
      )
      expect(
        screen.getByRole('listitem', { name: 'Marché' }),
      ).toHaveTextContent(euros(-3_000))

      // An imported row has no amount edit in place.
      screen.getByRole('button', { name: 'Modifier Fakemart' }).focus()
      await user.keyboard('m')
      expect(
        screen.queryByLabelText('Montant de Fakemart'),
      ).not.toBeInTheDocument()

      await user.keyboard('{Control>}z{/Control}')
      await waitFor(() =>
        expect(api.transactionsControllerUpdateManual).toHaveBeenLastCalledWith(
          {
            path: { id: manualRow.id },
            body: {
              amountCents: 1_250,
              direction: 'out',
              kind: 'expense',
              categoryId: groceries.id,
              bookingDate: '2026-11-03',
              label: 'Marché',
              accountId: ACCOUNT_ID,
              isOneOff: false,
              note: null,
            },
            throwOnError: false,
          },
        ),
      )
      expect(toast.dismiss).toHaveBeenCalled()
    })

    it('splits a transaction between categories and undoes it', async () => {
      const { user } = setup()
      await waitForRows()
      api.transactionsControllerSplit.mockImplementation(
        ({
          body,
        }: {
          body: { parts: { categoryId: string; amountCents: number }[] }
        }) =>
          ok({
            ...shopRow,
            categoryId: groceries.id,
            category: { ...groceries },
            needsReview: false,
            splits: body.parts.map((part, index) => ({
              id: `s000000${index}-0000-4000-8000-000000000000`,
              ...part,
              category: {
                ...(part.categoryId === groceries.id ? groceries : savings),
              },
            })),
          }),
      )

      await user.click(
        screen.getByRole('button', { name: 'Modifier Fakemart' }),
      )
      const editor = await screen.findByRole('dialog')
      await user.click(
        within(editor).getByRole('button', {
          name: 'Répartir entre plusieurs catégories',
        }),
      )
      const form = within(editor).getByRole('form', {
        name: 'Répartir entre catégories',
      })
      // The whole amount starts in the first part.
      expect(within(form).getByLabelText('Montant de la part 1')).toHaveValue(
        '45,50',
      )
      await user.selectOptions(
        within(form).getByLabelText('Catégorie de la part 1'),
        groceries.id,
      )
      const first = within(form).getByLabelText('Montant de la part 1')
      await user.clear(first)
      await user.type(first, '30')
      expect(form).toHaveTextContent(`Reste à répartir : ${euros(1_550)}`)
      await user.selectOptions(
        within(form).getByLabelText('Catégorie de la part 2'),
        savings.id,
      )
      await user.type(
        within(form).getByLabelText('Montant de la part 2'),
        '15,5',
      )
      expect(form).toHaveTextContent('Tout est réparti')
      await user.click(
        within(form).getByRole('button', {
          name: 'Enregistrer la répartition',
        }),
      )

      await waitFor(() =>
        expect(api.transactionsControllerSplit).toHaveBeenCalledWith({
          path: { id: shopRow.id },
          body: {
            parts: [
              { categoryId: groceries.id, amountCents: -3_000 },
              { categoryId: savings.id, amountCents: -1_550 },
            ],
          },
          throwOnError: false,
        }),
      )
      await waitFor(() =>
        expect(
          screen.getByRole('listitem', { name: 'Fakemart' }),
        ).toHaveTextContent('Répartie (2)'),
      )

      // Undo: no split any more, and the row back as it was.
      api.transactionsControllerUnsplit.mockReturnValue(ok(shopRow))
      api.transactionsControllerUpdate.mockReturnValue(ok(shopRow))
      lastToastAction().onClick()
      await waitFor(() =>
        expect(api.transactionsControllerUnsplit).toHaveBeenCalledWith({
          path: { id: shopRow.id },
          throwOnError: false,
        }),
      )
      await waitFor(() =>
        expect(api.transactionsControllerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              categoryId: null,
              needsReview: true,
            }),
          }),
        ),
      )
    })

    it('refuses a split that does not add up', async () => {
      const { user } = setup()
      await waitForRows()
      await user.click(
        screen.getByRole('button', { name: 'Modifier Fakemart' }),
      )
      const editor = await screen.findByRole('dialog')
      await user.click(
        within(editor).getByRole('button', {
          name: 'Répartir entre plusieurs catégories',
        }),
      )
      const form = within(editor).getByRole('form', {
        name: 'Répartir entre catégories',
      })
      await user.selectOptions(
        within(form).getByLabelText('Catégorie de la part 1'),
        groceries.id,
      )
      await user.selectOptions(
        within(form).getByLabelText('Catégorie de la part 2'),
        savings.id,
      )
      await user.type(within(form).getByLabelText('Montant de la part 2'), '1')
      await user.click(
        within(form).getByRole('button', {
          name: 'Enregistrer la répartition',
        }),
      )
      expect(form).toHaveTextContent(
        'Les parts doivent faire exactement le montant de l’opération',
      )
      expect(api.transactionsControllerSplit).not.toHaveBeenCalled()
    })

    it('corrects an imported amount behind an explicit action, and undoes it', async () => {
      const { user } = setup()
      await waitForRows()
      api.transactionsControllerCorrect.mockReturnValue(
        ok({ ...shopRow, amountCents: -4_000, originalAmountCents: -4_550 }),
      )

      await user.click(
        screen.getByRole('button', { name: 'Modifier Fakemart' }),
      )
      const editor = await screen.findByRole('dialog')
      await user.click(
        within(editor).getByRole('button', {
          name: 'Modifier une opération importée',
        }),
      )
      const amount = within(editor).getByLabelText('Montant corrigé')
      expect(amount).toHaveValue('-45,50')
      await user.clear(amount)
      await user.type(amount, '-40')
      await user.click(
        within(editor).getByRole('button', {
          name: 'Enregistrer la correction',
        }),
      )
      await waitFor(() =>
        expect(api.transactionsControllerCorrect).toHaveBeenCalledWith({
          path: { id: shopRow.id },
          body: { amountCents: -4_000 },
          throwOnError: false,
        }),
      )
      await waitFor(() =>
        expect(
          screen.getByRole('listitem', { name: 'Fakemart' }),
        ).toHaveTextContent('Corrigée'),
      )

      api.transactionsControllerRestoreBankValues.mockReturnValue(ok(shopRow))
      lastToastAction().onClick()
      await waitFor(() =>
        expect(
          api.transactionsControllerRestoreBankValues,
        ).toHaveBeenCalledWith({
          path: { id: shopRow.id },
          throwOnError: false,
        }),
      )
    })

    it('adds an income by hand from the page, with undo', async () => {
      const { user } = setup()
      await waitForRows()
      const created = transaction(5, {
        rawLabel: 'Prime',
        amountCents: 30_000,
        kind: 'income',
        categoryId: salary.id,
        category: { ...salary },
        manual: true,
      })
      api.transactionsControllerCreateManual.mockReturnValue(ok(created))

      await user.click(
        screen.getByRole('button', { name: 'Ajouter une opération' }),
      )
      const sheet = await screen.findByRole('dialog', {
        name: 'Ajouter une dépense',
      })
      await user.click(within(sheet).getByRole('radio', { name: 'Revenu' }))
      expect(
        screen.getByRole('dialog', { name: 'Ajouter un revenu' }),
      ).toBeInTheDocument()
      // Category, amount, then the details.
      await user.click(
        within(
          within(sheet).getByRole('radiogroup', { name: 'Catégorie' }),
        ).getByRole('radio', { name: salary.name }),
      )
      await user.type(within(sheet).getByLabelText('Montant'), '300')
      await user.click(within(sheet).getByRole('button', { name: 'Suivant' }))
      await user.type(within(sheet).getByLabelText('Libellé'), 'Prime')
      await user.click(
        within(sheet).getByRole('button', { name: /Plus d’options/ }),
      )
      // The kind sets the sign; it is only changed for a correction.
      expect(within(sheet).getByLabelText('Sens')).toHaveValue('in')
      await user.click(
        within(sheet).getByRole('switch', { name: /Ponctuelle/ }),
      )
      await user.click(within(sheet).getByRole('button', { name: 'Ajouter' }))

      await waitFor(() =>
        expect(api.transactionsControllerCreateManual).toHaveBeenCalledWith({
          body: {
            amountCents: 30_000,
            kind: 'income',
            direction: 'in',
            categoryId: salary.id,
            bookingDate: '2026-11-05',
            label: 'Prime',
            accountId: ACCOUNT_ID,
            isOneOff: true,
            note: null,
          },
          throwOnError: false,
        }),
      )
      api.transactionsControllerRemoveManual.mockReturnValue(
        Promise.resolve({ response: { ok: true, status: 204 } }),
      )
      lastToastAction().onClick()
      await waitFor(() =>
        expect(api.transactionsControllerRemoveManual).toHaveBeenCalledWith({
          path: { id: created.id },
          throwOnError: false,
        }),
      )
    })
  })
})
