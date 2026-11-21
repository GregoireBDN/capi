import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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
import { resetReviewCount, setReviewCount } from '#/lib/review-count'
import {
  categoryField,
  chooseCategory,
  pickCategory,
} from '#/test/category-picker'
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
  investmentsControllerSummary: vi.fn(),
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
  Link: ({
    to,
    search,
    children,
  }: {
    to: string
    search?: Record<string, string>
    children: ReactNode
  }) => {
    const query = new URLSearchParams(search).toString()
    return <a href={query ? `${to}?${query}` : to}>{children}</a>
  },
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
    icon: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  }
}
const groceries = category(1, 'Courses', 'expense')
const salary = category(2, 'Salaire', 'income')
const savings = category(3, 'Épargne', 'transfer')
const household = category(4, 'Maison', 'expense')
const categories = [groceries, salary, savings, household]

function transaction(
  n: number,
  overrides: Partial<TransactionDto> = {},
): TransactionDto {
  return {
    id: `a0000000-0000-4000-8000-00000000000${n}`,
    accountId: ACCOUNT_ID,
    accountName: 'Compte test',
    paidByContactId: null,
    paidByContactName: null,
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
    prepaidItemId: null,
    prepaidTermMonths: null,
    originalAmountCents: null,
    originalBookingDate: null,
    counterpartAccountId: null,
    counterpartAccountName: null,
    splits: [],
    shares: [],
    repayments: [],
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

/** The step shown in an editor, from its steps (« 1. Courses »). */
function currentStepOf(editor: HTMLElement): string {
  return (
    within(editor)
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-current') === 'step')
      ?.getAttribute('aria-label') ?? ''
  )
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
  // No delay between the events of an interaction: same events, less time.
  const user = userEvent.setup({ delay: null })
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

/**
 * Queries scoped to the month bar: a role query over the whole page (bar,
 * totals and rows) is slow enough to push long tests past Vitest's 5 s.
 */
function monthBar() {
  const bar = document.querySelector<HTMLElement>('[data-slot=month-toolbar]')
  if (!bar) throw new Error('No month bar')
  return within(bar)
}

/** An open popover (portaled out of the bar), found by its label. */
async function picker(label: string) {
  const dialog = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(
      `[role="dialog"][aria-label="${label}"]`,
    )
    if (!found) throw new Error(`No « ${label} » picker`)
    return found
  })
  return within(dialog)
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
  api.investmentsControllerSummary.mockReturnValue(ok({ accounts: [] }))
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
  resetReviewCount()
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
    // « Net », not « Solde » (it isn't an account balance); only it is toned.
    const net = within(totals).getByText('Net').nextSibling as HTMLElement
    expect(net).toHaveTextContent(euros(245_450))
    expect(net).toHaveClass('text-chart-delta-good')
    expect(
      within(totals).getByText('Dépenses').nextSibling as HTMLElement,
    ).not.toHaveClass('text-chart-delta-bad')
    expect(within(totals).queryByText('Solde')).not.toBeInTheDocument()
    expect(totals).toHaveTextContent(
      `Dont ponctuelles ${euros(-1_000)} · 1 virement interne exclu`,
    )
    // The count heads the list.
    expect(screen.getByText('3 opérations')).toBeInTheDocument()
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
    expect(transfer).toHaveTextContent('Note : Épargne de précaution')
    // The kind once (#266): no « Interne » badge, a ⇄ before the amount.
    expect(transfer).not.toHaveTextContent('Interne')
    expect(
      within(transfer).getAllByLabelText('Virement interne').length,
    ).toBeGreaterThan(0)
    // Money in is green with a plus; money out keeps the text colour.
    const income = screen.getByRole('listitem', {
      name: salaryRow.rawLabel,
    })
    expect(income).toHaveTextContent(`+${euros(250_000)}`)
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
    // « Toutes les dates » is the navigator's label, arrows off.
    expect(
      screen.getByRole('button', { name: 'Toutes les dates, choisir un mois' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Mois précédent' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Rechercher une opération')).toHaveValue(
      'fake',
    )
    // Every filter shows its value on its chip.
    expect(
      screen.getByRole('button', { name: 'Compte : Compte test, changer' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Catégorie : Sans catégorie, changer',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Type : Dépenses, changer' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'À revoir' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Ponctuelles' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      screen.getByRole('button', { name: 'Filtres, 5 actifs' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Tri')).toHaveValue('amount_asc')
    // Sorted by amount: a flat list, dates in the rows.
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Opérations' })).toBeInTheDocument()
  })

  it('writes the chips to the URL and refetches', async () => {
    const { user, onChange } = setup()
    await waitForRows()
    const bar = monthBar()

    // No filter on: nothing to clear.
    expect(
      bar.queryByRole('button', { name: 'Effacer' }),
    ).not.toBeInTheDocument()

    // Only transactional accounts are offered.
    await user.click(bar.getByRole('button', { name: 'Compte, tous' }))
    const accountPicker = await picker('Compte')
    expect(
      accountPicker.queryByRole('button', { name: 'PEA test' }),
    ).not.toBeInTheDocument()
    await user.click(accountPicker.getByRole('button', { name: 'Compte test' }))
    expect(onChange).toHaveBeenLastCalledWith(
      { account: ACCOUNT_ID },
      undefined,
    )

    // Categories can be searched.
    await user.click(bar.getByRole('button', { name: 'Catégorie, tous' }))
    const categoryPicker = await picker('Catégorie')
    await user.type(
      categoryPicker.getByLabelText('Rechercher catégorie'),
      'sans',
    )
    await user.click(
      categoryPicker.getByRole('button', { name: 'Sans catégorie' }),
    )

    await user.click(bar.getByRole('button', { name: 'Type, tous' }))
    await user.click(
      (await picker('Type')).getByRole('button', {
        name: 'Mouvements internes',
      }),
    )
    await user.click(bar.getByRole('button', { name: 'Mois précédent' }))

    expect(onChange).toHaveBeenLastCalledWith(
      {
        account: ACCOUNT_ID,
        category: 'none',
        kind: 'transfer',
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
      }),
    )

    // « À revoir » opens the queue over every date, like its count (#393).
    await user.click(bar.getByRole('button', { name: 'À revoir' }))
    expect(onChange).toHaveBeenLastCalledWith(
      {
        account: ACCOUNT_ID,
        category: 'none',
        kind: 'transfer',
        review: true,
        month: 'all',
      },
      undefined,
    )
  })

  it('puts « À revoir » first with its count while some wait (#393)', async () => {
    setReviewCount(7)
    const { user, onChange } = setup({ month: '2026-10' })
    await waitForRows()
    const chips = screen.getAllByRole('button', { pressed: false })
    const chip = screen.getByRole('button', {
      name: /^À revoir\s*, 7 opérations à revoir$/,
    })
    expect(chips[0]).toBe(chip)
    expect(chip).toHaveTextContent(/^À revoir7/)

    await user.click(chip)
    expect(onChange).toHaveBeenLastCalledWith(
      { review: true, month: 'all' },
      undefined,
    )
    // On, it is a plain filter again: no count, × clears it.
    expect(
      screen.getByRole('button', { name: 'À revoir', pressed: true }),
    ).not.toHaveTextContent('7')
  })

  it('offers no « À revoir » when nothing waits for review (#393)', async () => {
    setReviewCount(0)
    setup({ month: '2026-10' })
    await waitForRows()
    expect(
      screen.queryByRole('button', { name: /À revoir/ }),
    ).not.toBeInTheDocument()
  })

  it('goes back to Dépenses, its parent page, on the month shown (#393)', async () => {
    setup({ month: '2026-10', review: true })
    await waitForRows()
    expect(screen.getByRole('link', { name: 'Dépenses' })).toHaveAttribute(
      'href',
      '/spending?month=2026-10',
    )
    expect(
      screen.getByRole('button', { name: 'Ajouter une dépense' }),
    ).toBeInTheDocument()
  })

  it('goes back to Dépenses on its default month from every date (#393)', async () => {
    setup({ month: 'all' })
    await waitForRows()
    expect(screen.getByRole('link', { name: 'Dépenses' })).toHaveAttribute(
      'href',
      '/spending',
    )
  })

  it('moves back to the default month, then to the whole history', async () => {
    const { user, onChange } = setup({ month: '2026-10' })
    await waitForRows()
    const bar = monthBar()

    // Back to the current month: the default, kept out of the URL.
    await user.click(bar.getByRole('button', { name: 'Mois suivant' }))
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty('month')
    expect(bar.getByRole('button', { name: 'Mois suivant' })).toBeDisabled()

    // The whole history, from the month picker: no month sent at all.
    await user.click(
      bar.getByRole('button', { name: 'Novembre 2026, choisir un mois' }),
    )
    await user.click(
      (await picker('Choisir un mois')).getByRole('button', {
        name: 'Toutes les dates',
      }),
    )
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ month: 'all' })
    await waitFor(() =>
      expect(lastQuery(api.transactionsControllerSummary)).not.toHaveProperty(
        'month',
      ),
    )
  })

  it('clears one filter with ×, all of them with « Effacer », the period kept', async () => {
    const { user, onChange } = setup({
      month: 'all',
      kind: 'transfer',
      review: true,
    })
    await waitForRows()
    const bar = monthBar()

    await user.click(
      bar.getByRole('button', { name: 'Retirer le filtre Type' }),
    )
    expect(onChange).toHaveBeenLastCalledWith(
      { month: 'all', review: true },
      undefined,
    )
    await user.click(bar.getByRole('button', { name: 'Effacer' }))
    expect(onChange).toHaveBeenLastCalledWith({ month: 'all' }, undefined)
    await waitFor(() =>
      expect(lastQuery(api.transactionsControllerSummary)).toEqual({}),
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
    // The editor (#398): the add steps, filled in; the category on step 1.
    await user.click(within(editor).getByRole('button', { name: /^1\. / }))
    await pickCategory(user, 'Courses')
    // Back on the options; ✓ saves.
    expect(api.transactionsControllerUpdate).not.toHaveBeenCalled()
    await user.click(
      within(editor).getByRole('button', { name: 'Enregistrer' }),
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

  it('links a transfer to the account it goes to (#296)', async () => {
    const { user } = setup()
    await waitForRows()
    const pea = accounts[1]
    api.transactionsControllerUpdate.mockReturnValue(
      ok({
        ...transferRow,
        counterpartAccountId: pea.id,
        counterpartAccountName: pea.name,
      }),
    )

    await user.click(
      screen.getByRole('button', { name: 'Modifier VIR LIVRET TEST' }),
    )
    const editor = await screen.findByRole('dialog')
    // What only an edit has, on its own screen from « Options ».
    await user.click(within(editor).getByRole('button', { name: /^Vers/ }))
    const choices = within(editor).getByRole('radiogroup', { name: 'Vers' })
    // Every other account, never the transaction's own.
    expect(
      within(choices)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['PEA test', 'Aucun'])
    await user.click(within(choices).getByRole('radio', { name: 'PEA test' }))

    expect(api.transactionsControllerUpdate).toHaveBeenCalledWith({
      path: { id: transferRow.id },
      body: { counterpartAccountId: pea.id },
      throwOnError: false,
    })
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Vers PEA test',
        expect.anything(),
      ),
    )
    // Back on the options, which show the link.
    expect(
      within(editor).getByRole('button', { name: /^Vers/ }),
    ).toHaveTextContent('PEA test')
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Modifier VIR LIVRET TEST' })
          .closest('li'),
      ).toHaveTextContent('Vers PEA test'),
    )
  })

  it('edits in the four steps of adding, the kind with its tiles (#398)', async () => {
    const { user } = setup()
    await waitForRows()
    api.transactionsControllerUpdate.mockImplementation(
      ({ body }: { body: object }) => ok({ ...shopRow, ...body }),
    )

    await user.click(screen.getByRole('button', { name: 'Modifier Fakemart' }))
    const editor = await screen.findByRole('dialog')
    // Without a category it opens on its categories (#398); the other
    // steps are a tap away, no select, no « Type » screen any more.
    expect(currentStepOf(editor)).toMatch(/^1\./)
    expect(within(editor).queryByRole('combobox')).not.toBeInTheDocument()
    expect(
      within(editor).queryByRole('button', { name: /^Type/ }),
    ).not.toBeInTheDocument()
    await user.click(
      within(editor).getByRole('button', { name: /^4\. Options/ }),
    )
    expect(
      within(editor).getByRole('button', { name: 'Enregistrer' }),
    ).toBeDisabled()

    // The category step: the row's kind only, another one at its end; its
    // search ignores accents.
    await user.click(within(editor).getByRole('button', { name: /^1\. / }))
    expect(
      within(editor).queryByRole('radio', { name: /^Épargne/ }),
    ).not.toBeInTheDocument()
    await user.click(
      within(editor).getByRole('button', { name: /^Classer en virement/ }),
    )
    await user.type(
      within(editor).getByRole('searchbox', {
        name: 'Rechercher une catégorie',
      }),
      'epar',
    )
    expect(
      within(editor).getByRole('radio', { name: /^Épargne/ }),
    ).toBeInTheDocument()
    expect(
      within(editor).queryByRole('radio', { name: /^Courses/ }),
    ).not.toBeInTheDocument()
    await user.clear(
      within(editor).getByRole('searchbox', {
        name: 'Rechercher une catégorie',
      }),
    )

    // An uncategorized row takes a kind alone.
    await user.click(
      within(editor).getByRole('button', { name: /^Classer en revenu/ }),
    )
    await user.click(
      within(editor).getByRole('radio', { name: 'Sans catégorie, à revoir' }),
    )
    await user.click(
      within(editor).getByRole('button', { name: 'Enregistrer' }),
    )
    expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { kind: 'income' } }),
    )
  })

  it('changes the type of a categorized row by choosing a category of it (#368)', async () => {
    const { user } = setup()
    await waitForRows()
    api.transactionsControllerUpdate.mockImplementation(
      ({ body }: { body: object }) => ok({ ...transferRow, ...body }),
    )

    await user.click(
      screen.getByRole('button', { name: 'Modifier VIR LIVRET TEST' }),
    )
    const editor = await screen.findByRole('dialog')
    await user.click(within(editor).getByRole('button', { name: /^1\. / }))
    await user.click(
      within(editor).getByRole('button', { name: /^Classer en dépense/ }),
    )
    // No request yet: the categories of that kind, and only them.
    expect(api.transactionsControllerUpdate).not.toHaveBeenCalled()
    expect(
      within(editor).queryByRole('radio', { name: /^Épargne/ }),
    ).not.toBeInTheDocument()
    await pickCategory(user, 'Courses')
    await user.click(
      within(editor).getByRole('button', { name: 'Enregistrer' }),
    )
    expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { categoryId: groceries.id } }),
    )
  })

  it('or leaves a categorized row without a category, with the new kind (#368)', async () => {
    const { user } = setup()
    await waitForRows()
    api.transactionsControllerUpdate.mockImplementation(
      ({ body }: { body: object }) => ok({ ...transferRow, ...body }),
    )

    await user.click(
      screen.getByRole('button', { name: 'Modifier VIR LIVRET TEST' }),
    )
    const editor = await screen.findByRole('dialog')
    await user.click(within(editor).getByRole('button', { name: /^1\. / }))
    await user.click(
      within(editor).getByRole('button', { name: /^Classer en revenu/ }),
    )
    await user.click(
      within(editor).getByRole('radio', { name: 'Sans catégorie, à revoir' }),
    )
    await user.click(
      within(editor).getByRole('button', { name: 'Enregistrer' }),
    )
    expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { categoryId: null, kind: 'income' } }),
    )
  })

  it('changes the type of a selection only when none has a category (#368)', async () => {
    const { user } = setup()
    await waitForRows()
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner Fakemart' }),
    )
    const bar = screen.getByRole('region', { name: 'Actions groupées' })
    expect(
      within(bar).getByLabelText('Changer le type de la sélection'),
    ).toBeEnabled()
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner VIR LIVRET TEST' }),
    )
    expect(
      within(bar).getByLabelText('Changer le type de la sélection'),
    ).toBeDisabled()
  })

  it('rolls an edit back when the API refuses it', async () => {
    const { user } = setup()
    await waitForRows()
    api.transactionsControllerUpdate.mockReturnValue(failed())

    await user.click(screen.getByRole('button', { name: 'Modifier Fakemart' }))
    const editor = await screen.findByRole('dialog')
    // A row without a category opens on its categories (#398).
    await user.click(
      within(editor).getByRole('button', { name: /^4\. Options/ }),
    )
    await user.click(within(editor).getByRole('switch', { name: /Ponctuelle/ }))
    await user.click(
      within(editor).getByRole('button', { name: 'Enregistrer' }),
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'La modification n’a pas pu être enregistrée.',
      ),
    )
    expect(
      screen.getByRole('listitem', { name: 'Fakemart' }),
    ).not.toHaveTextContent('Ponctuelle')
  })

  it('saves a note and marks a row reviewed from the editor', async () => {
    const { user } = setup()
    await waitForRows()
    api.transactionsControllerUpdate.mockImplementation(
      ({ body }: { body: object }) => ok({ ...shopRow, ...body }),
    )

    await user.click(screen.getByRole('button', { name: 'Modifier Fakemart' }))
    const editor = await screen.findByRole('dialog')
    // A row without a category opens on its categories (#398).
    await user.click(
      within(editor).getByRole('button', { name: /^4\. Options/ }),
    )
    await user.click(within(editor).getByRole('switch', { name: /À revoir/ }))
    await user.type(within(editor).getByLabelText('Note'), 'Cadeau')
    // Nothing is sent before ✓, then one request for both.
    expect(api.transactionsControllerUpdate).not.toHaveBeenCalled()
    await user.click(
      within(editor).getByRole('button', { name: 'Enregistrer' }),
    )
    expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: { needsReview: false, note: 'Cadeau' },
      }),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenLastCalledWith(
        'Opération validée',
        expect.anything(),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
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

    await user.click(within(bar).getByRole('button', { name: 'Classer dans…' }))
    await pickCategory(user, groceries.name)

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

  describe('« À revoir » (#322)', () => {
    const filed = transaction(5, {
      bookingDate: '2026-10-12',
      rawLabel: 'PRLV SEPA FAKE TELECOM',
      merchant: 'Faketel',
      amountCents: -1_999,
      categoryId: groceries.id,
      category: { ...groceries },
      needsReview: true,
    })
    const review: TransactionsSearch = { review: true, month: 'all' }

    it('counts what is left, without totals, and validates a row with undo', async () => {
      api.transactionsControllerList.mockReturnValue(listOf([filed, shopRow]))
      const { user } = setup(review)
      await screen.findByText(filed.rawLabel)

      expect(lastQuery(api.transactionsControllerList)).toMatchObject({
        needsReview: true,
      })
      expect(lastQuery(api.transactionsControllerList)).not.toHaveProperty(
        'month',
      )
      expect(screen.getByText('2 opérations à revoir')).toBeInTheDocument()
      // No totals strip while reviewing.
      expect(screen.queryByText('Revenus')).not.toBeInTheDocument()

      // « Valider » on the filed row; the uncategorized one is filed first.
      expect(
        screen.queryByRole('button', { name: 'Valider Fakemart' }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Classer Fakemart' }),
      ).toBeInTheDocument()

      api.transactionsControllerUpdate.mockReturnValue(
        ok({ ...filed, needsReview: false }),
      )
      api.transactionsControllerList.mockReturnValue(listOf([shopRow]))
      await user.click(screen.getByRole('button', { name: 'Valider Faketel' }))

      expect(api.transactionsControllerUpdate).toHaveBeenCalledWith({
        path: { id: filed.id },
        body: { needsReview: false },
        throwOnError: false,
      })
      // It leaves the list at once.
      expect(
        screen.queryByRole('listitem', { name: 'Faketel' }),
      ).not.toBeInTheDocument()
      expect(screen.getByText('1 opération à revoir')).toBeInTheDocument()
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Opération validée',
          expect.objectContaining({ description: 'Faketel' }),
        ),
      )

      // « Annuler » puts it back in review, and in the list.
      api.transactionsControllerUpdate.mockReturnValue(ok(filed))
      api.transactionsControllerList.mockReturnValue(listOf([filed, shopRow]))
      lastToastAction().onClick()
      await waitFor(() =>
        expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith(
          expect.objectContaining({
            path: { id: filed.id },
            body: expect.objectContaining({ needsReview: true }),
          }),
        ),
      )
      await screen.findByRole('listitem', { name: 'Faketel' })
    })

    it('takes a row filed in a category out of the list', async () => {
      api.transactionsControllerList.mockReturnValue(listOf([filed, shopRow]))
      const { user } = setup(review)
      await screen.findByText(filed.rawLabel)
      api.transactionsControllerUpdate.mockReturnValue(
        ok({
          ...shopRow,
          categoryId: groceries.id,
          category: { ...groceries },
          needsReview: false,
        }),
      )
      api.transactionsControllerList.mockReturnValue(listOf([filed]))

      // « Classer » opens the editor on the categories: two taps.
      await user.click(screen.getByRole('button', { name: 'Classer Fakemart' }))
      await screen.findByRole('dialog')
      await pickCategory(user, 'Courses')

      expect(api.transactionsControllerUpdate).toHaveBeenCalledWith({
        path: { id: shopRow.id },
        body: { categoryId: groceries.id },
        throwOnError: false,
      })
      await waitFor(() =>
        expect(
          screen.queryByRole('listitem', { name: 'Fakemart' }),
        ).not.toBeInTheDocument(),
      )
      // The rule offer stays.
      expect(
        screen.getByRole('region', { name: 'Créer une règle' }),
      ).toBeInTheDocument()
    })

    it('validates every row at once when they all have a category', async () => {
      const other = {
        ...filed,
        id: shopRow.id,
        rawLabel: 'CB FAKE BAKERY',
        merchant: null,
      }
      api.transactionsControllerList.mockReturnValue(listOf([filed, shopRow]))
      setup(review)
      await screen.findByText(filed.rawLabel)
      // One row without a category: no « Tout valider ».
      expect(
        screen.queryByRole('button', { name: 'Tout valider' }),
      ).not.toBeInTheDocument()
      cleanup()

      api.transactionsControllerList.mockReturnValue(listOf([filed, other]))
      const { user } = setup(review)
      await screen.findByText(other.rawLabel)
      api.transactionsControllerBulkUpdate.mockReturnValue(ok({ updated: 2 }))
      api.transactionsControllerList.mockReturnValue(listOf([]))

      await user.click(screen.getByRole('button', { name: 'Tout valider' }))
      expect(api.transactionsControllerBulkUpdate).toHaveBeenCalledWith({
        body: { needsReview: false, ids: [filed.id, other.id] },
        throwOnError: false,
      })
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          '2 opérations validées',
          expect.anything(),
        ),
      )
      expect(await screen.findByText('Tout est à jour')).toBeInTheDocument()
    })

    it('says when nothing is left to review, and leads back to the list', async () => {
      api.transactionsControllerList.mockReturnValue(listOf([]))
      const { user, onChange } = setup({ review: true, month: '2026-10' })

      await screen.findByText('Rien à revoir en octobre 2026')
      await user.click(
        screen.getByRole('button', { name: 'Voir toutes les dates' }),
      )
      expect(onChange).toHaveBeenLastCalledWith(review, undefined)
      await screen.findByText('Tout est à jour')
      await user.click(
        screen.getByRole('button', { name: 'Voir les opérations' }),
      )
      expect(onChange).toHaveBeenLastCalledWith({}, undefined)
    })
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

    it('has no keyboard shortcuts: no hints, the keys do nothing (#265)', async () => {
      const { user } = setup()
      await waitForRows()

      expect(screen.queryByText('naviguer')).not.toBeInTheDocument()
      expect(screen.queryByText('sélectionner')).not.toBeInTheDocument()

      const trigger = screen.getByRole('button', { name: 'Modifier Fakemart' })
      trigger.focus()
      await user.keyboard(
        'cnomxjk{ArrowDown}{ArrowUp}{Control>}z{/Control}{Meta>}z{/Meta}',
      )
      expect(trigger).toHaveFocus()
      expect(api.transactionsControllerUpdate).not.toHaveBeenCalled()
      expect(
        screen.queryByLabelText('Note de Fakemart'),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('checkbox', { name: 'Sélectionner Fakemart' }),
      ).not.toBeChecked()
    })

    it('picks the category from its name in the row, and its toast undoes', async () => {
      const { user } = setup()
      await waitForRows()
      api.transactionsControllerUpdate.mockReturnValueOnce(
        ok({
          ...shopRow,
          categoryId: groceries.id,
          category: { ...groceries },
          needsReview: false,
        }),
      )

      // No select per row: the category is text that opens the list (#266).
      expect(
        within(screen.getByRole('listitem', { name: 'Fakemart' })).queryByRole(
          'combobox',
        ),
      ).not.toBeInTheDocument()
      screen.getByRole('button', { name: 'Modifier Fakemart' }).focus()
      await user.tab()
      const trigger = screen.getByRole('button', {
        name: 'Catégorie de Fakemart',
      })
      expect(trigger).toHaveFocus()
      await user.keyboard('{Enter}')
      await user.click(
        await screen.findByRole('menuitemradio', { name: 'Courses' }),
      )
      expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith({
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

      api.transactionsControllerUpdate.mockReturnValueOnce(ok(shopRow))
      expect(lastToastAction().label).toBe('Annuler')
      lastToastAction().onClick()
      await waitFor(() =>
        expect(api.transactionsControllerUpdate).toHaveBeenLastCalledWith({
          path: { id: shopRow.id },
          body: expect.objectContaining({ categoryId: null }),
          throwOnError: false,
        }),
      )
    })

    it('edits the amount of a manual row in place and undoes it from the toast', async () => {
      api.transactionsControllerList.mockReturnValue(
        listOf([...rows, manualRow]),
      )
      api.transactionsControllerUpdateManual.mockImplementation(
        ({ body }: { body: { amountCents?: number } }) =>
          ok({ ...manualRow, amountCents: -(body.amountCents ?? 1_250) }),
      )
      const { user } = setup()
      await waitForRows()

      // Tab from the row reaches its amount, Enter opens it.
      screen.getByRole('button', { name: 'Modifier Marché' }).focus()
      await user.tab()
      await user.tab()
      expect(
        screen.getByRole('button', { name: 'Modifier le montant de Marché' }),
      ).toHaveFocus()
      await user.keyboard('{Enter}')
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

      // Leaving the edit hands the focus back to the amount.
      expect(
        screen.getByRole('button', { name: 'Modifier le montant de Marché' }),
      ).toHaveFocus()
      // An imported row has no amount edit in place.
      expect(
        screen.queryByRole('button', {
          name: 'Modifier le montant de Fakemart',
        }),
      ).not.toBeInTheDocument()

      lastToastAction().onClick()
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
              kind: 'expense' as const,
              category: {
                ...(part.categoryId === groceries.id ? groceries : household),
              },
            })),
          }),
      )

      await user.click(
        screen.getByRole('button', { name: 'Modifier Fakemart' }),
      )
      const editor = await screen.findByRole('dialog')
      // A row without a category opens on its categories (#398).
      await user.click(
        within(editor).getByRole('button', { name: /^4\. Options/ }),
      )
      await user.click(
        within(editor).getByRole('button', { name: /^Répartir/ }),
      )
      const form = within(editor).getByRole('form', {
        name: 'Répartir entre catégories',
      })
      // The whole amount starts in the first part.
      expect(within(form).getByLabelText('Montant de la part 1')).toHaveValue(
        '45,50',
      )
      await chooseCategory(
        user,
        categoryField('Catégorie de la part 1', form),
        groceries.name,
      )
      const first = within(form).getByLabelText('Montant de la part 1')
      await user.clear(first)
      await user.type(first, '30')
      expect(form).toHaveTextContent(`Reste à répartir : ${euros(1_550)}`)
      await chooseCategory(
        user,
        categoryField('Catégorie de la part 2', form),
        household.name,
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
              { categoryId: household.id, amountCents: -1_550 },
            ],
          },
          throwOnError: false,
        }),
      )
      // Back on the options of the editor, which shows the split.
      await waitFor(() =>
        expect(
          within(editor).getByRole('button', { name: /^Répartition/ }),
        ).toHaveTextContent('Courses, Maison'),
      )
      await user.keyboard('{Escape}')
      await waitFor(() =>
        expect(
          screen.getByRole('listitem', { name: 'Fakemart' }),
        ).toHaveTextContent('Courses, Maison'),
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
      // A row without a category opens on its categories (#398).
      await user.click(
        within(editor).getByRole('button', { name: /^4\. Options/ }),
      )
      await user.click(
        within(editor).getByRole('button', { name: /^Répartir/ }),
      )
      const form = within(editor).getByRole('form', {
        name: 'Répartir entre catégories',
      })
      await chooseCategory(
        user,
        categoryField('Catégorie de la part 1', form),
        groceries.name,
      )
      await chooseCategory(
        user,
        categoryField('Catégorie de la part 2', form),
        household.name,
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

    it('corrects an imported amount in its step, the bank value kept, and undoes it', async () => {
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
        within(editor).getByRole('button', { name: /^2\. Montant/ }),
      )
      const amount = within(editor).getByLabelText('Montant')
      // Typed unsigned (#326): the sign is the transaction's own.
      expect(amount).toHaveValue('45,50')
      expect(editor).toHaveTextContent('Montant de la banque')
      await user.clear(amount)
      await user.type(amount, '40')
      // The bank's value stays in view, one tap to put it back.
      expect(editor).toHaveTextContent(`Corrigé · banque : ${euros(-4_550)}`)
      await user.click(
        within(editor).getByRole('button', { name: 'Enregistrer' }),
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
        ).toHaveTextContent('Montant ou date corrigé à la main'),
      )
      expect(api.transactionsControllerUpdate).not.toHaveBeenCalled()

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

      // The kind is chosen first (#398): three page actions.
      await user.click(
        screen.getByRole('button', { name: 'Ajouter un revenu' }),
      )
      const sheet = await screen.findByRole('dialog', {
        name: 'Ajouter un revenu',
      })
      // Category, amount, then the details.
      await user.click(
        within(
          within(sheet).getByRole('radiogroup', { name: 'Catégorie' }),
        ).getByRole('radio', { name: salary.name }),
      )
      await user.type(within(sheet).getByLabelText('Montant'), '300')
      // The kind sets the sign, shown on the amount.
      expect(
        within(sheet).getByRole('button', {
          name: 'Entrée d’argent, changer de signe',
        }),
      ).toHaveTextContent('+')
      await user.click(within(sheet).getByRole('button', { name: 'Suivant' }))
      // The label and the rest in « Options » (#398).
      await user.click(
        within(sheet).getByRole('button', { name: /^4\. Options/ }),
      )
      await user.type(within(sheet).getByLabelText('Libellé'), 'Prime')
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
