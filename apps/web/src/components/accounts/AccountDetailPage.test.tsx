import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountDto,
  AccountMonthFlowsDto,
  AccountPerformanceDto,
  BalanceHistoryDto,
  ImportSummaryDto,
  RecurringItemDto,
  TransactionDto,
  SnapshotDto,
  AccountHoldingsDto,
  ValuedHoldingDto,
  WalletKeyDto,
  WalletSyncStatusDto,
} from '#/api/types.gen'
import type { AccountSearch } from './account-origin'
import { AccountDetailPage } from './AccountDetailPage'

const api = vi.hoisted(() => ({
  accountsControllerFindOne: vi.fn(),
  accountSnapshotsControllerPerformance: vi.fn(),
  accountSnapshotsControllerUpsert: vi.fn(),
  accountSnapshotsControllerRemove: vi.fn(),
  accountSnapshotsControllerBulk: vi.fn(),
  accountHoldingsControllerList: vi.fn(),
  walletKeysControllerList: vi.fn(),
  walletKeysControllerAdd: vi.fn(),
  walletKeysControllerRemove: vi.fn(),
  walletKeysControllerUpdate: vi.fn(),
  walletTokensControllerList: vi.fn(),
  walletTokensControllerAdd: vi.fn(),
  walletTokensControllerRemove: vi.fn(),
  accountHoldingsControllerSync: vi.fn(),
  accountHoldingsControllerRemove: vi.fn(),
  accountHoldingsControllerValuate: vi.fn(),
  cryptoControllerSearch: vi.fn(),
  accountsControllerBalanceHistory: vi.fn(),
  accountsControllerMonthFlows: vi.fn(),
  accountsControllerList: vi.fn(),
  transactionsControllerList: vi.fn(),
  transactionsControllerManualSuggestions: vi.fn(),
  categoriesControllerList: vi.fn(),
  importsControllerList: vi.fn(),
  recurringControllerList: vi.fn(),
}))
const navigate = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
)

vi.mock('#/api', () => api)
vi.mock('sonner', () => ({ toast }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: ReactNode
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (url, [key, value]) => url.replace(`$${key}`, value),
      to,
    )
    const query = new URLSearchParams(search).toString()
    return (
      <a href={query ? `${path}?${query}` : path} {...props}>
        {children}
      </a>
    )
  },
}))

/** Testing Library collapses the narrow no-break spaces `Intl` emits. */
const text = (value: string | null) => (value ?? '').replace(/\s/g, ' ')

/** Synthetic data only. */
const ACCOUNT_ID = 'a0000000-0000-4000-8000-000000000001'

function account(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: ACCOUNT_ID,
    name: 'PEA test',
    type: 'brokerage',
    institution: 'Banque test',
    position: 0,
    archivedAt: null,
    balanceCents: 1_250_000,
    balanceDate: '2026-09-30',
    cryptoSource: null,
    cryptoProvider: null,
    cryptoSyncedAt: null,
    investedBaseCents: null,
    investedBaseOn: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function snapshot(
  date: string,
  valueCents: number,
  contributionsCents: number | null,
  note: string | null = null,
): SnapshotDto {
  return { id: `s-${date}`, date, valueCents, contributionsCents, note }
}

const snapshots = [
  snapshot('2025-09-30', 1_000_000, 950_000),
  snapshot('2026-06-30', 1_200_000, 1_000_000),
  snapshot('2026-09-30', 1_250_000, 1_020_000, 'Relevé T3'),
]

function performance(
  overrides: Partial<AccountPerformanceDto> = {},
): AccountPerformanceDto {
  return {
    accountId: ACCOUNT_ID,
    type: 'brokerage',
    valueCents: 1_250_000,
    valueDate: '2026-09-30',
    contributionsCents: 1_020_000,
    contributionsDate: '2026-09-30',
    contributionsSource: 'typed',
    typedContributionsCents: null,
    linkedTransfersCount: 0,
    unknownCostCount: 0,
    linkedAfterValueCents: 0,
    gainCents: 230_000,
    returnRate: 230_000 / 1_020_000,
    sincePrevious: {
      fromDate: '2026-06-30',
      fromValueCents: 1_200_000,
      changeCents: 50_000,
      changeRate: 50_000 / 1_200_000,
      contributionsChangeCents: 20_000,
    },
    sinceOneYear: {
      fromDate: '2025-09-30',
      fromValueCents: 1_000_000,
      changeCents: 250_000,
      changeRate: 0.25,
      contributionsChangeCents: 70_000,
    },
    daysSinceLatest: 37,
    staleAfterDays: 100,
    stale: false,
    snapshots,
    contributionsHistory: snapshots.map((s) => ({
      date: s.date,
      contributionsCents: s.contributionsCents,
    })),
    investedBase: null,
    ...overrides,
  }
}

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, response: new Response(null, { status }) })
}

function renderPage(origin?: AccountSearch) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AccountDetailPage accountId={ACCOUNT_ID} origin={origin} />
    </QueryClientProvider>,
  )
}

describe('AccountDetailPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'))
    for (const fn of Object.values(api)) fn.mockReset()
    navigate.mockReset()
    api.accountsControllerFindOne.mockImplementation(() => ok(account()))
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(performance()),
    )
    api.accountSnapshotsControllerUpsert.mockImplementation(
      ({ path, body }: { path: { date: string }; body: SnapshotDto }) =>
        ok({ ...body, id: 'new', date: path.date }),
    )
    api.accountSnapshotsControllerRemove.mockImplementation(() =>
      ok(undefined, 204),
    )
    api.accountSnapshotsControllerBulk.mockImplementation(() =>
      ok({ created: 2, updated: 1 }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('goes back to the page it was opened from, with its month (#324)', async () => {
    renderPage({ from: 'savings', month: '2026-10' })

    expect(
      await screen.findByRole('heading', { name: 'PEA test' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Épargne' })).toHaveAttribute(
      'href',
      '/savings?month=2026-10',
    )
    expect(screen.queryByRole('link', { name: 'Comptes' })).toBeNull()
  })

  it('shows the way back while the account loads', () => {
    renderPage({ from: 'crypto' })
    // The back link is there before the account is loaded.
    expect(screen.getByRole('link', { name: 'Crypto' })).toHaveAttribute(
      'href',
      '/crypto',
    )
  })

  it('shows the value, the invested amount, the result and the changes (#360)', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'PEA test' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Banque test')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Comptes' })).toHaveAttribute(
      'href',
      '/accounts',
    )
    const summary = screen.getByRole('region', { name: 'Valeur' })
    const content = text(summary.textContent)
    expect(content).toContain(
      'Valeur12 500,00 €Au 30 sept. 2026, il y a 37 jours+500,00 € depuis le 30 juin',
    )
    expect(content).toContain('Investi10 200 €')
    expect(
      within(summary).getByRole('img', {
        name: (name) => text(name) === 'Valeur : 10 200,00 € investis et 2 300,00 € de résultat',
      }),
    ).toBeInTheDocument()
    expect(content).toContain('Résultat+2 300 €+22,5 %')
    expect(content).toContain('Sur 1 an+2 500 €+25 %')
    expect(content).toContain('Saisi sur la valeur du 30 sept. 2026')
    // One word for the money put in, and no dashes.
    expect(content).not.toMatch(/Versements|Plus-value|—/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const list = screen.getByRole('list', { name: 'Valeurs enregistrées' })
    const rows = within(list).getAllByRole('listitem')
    // Newest first.
    expect(text(rows[0].textContent)).toContain('30 sept. 2026')
    expect(text(rows[0].textContent)).toContain('Relevé T3')
    expect(text(rows[0].textContent)).toContain('Investi 10 200,00 €')
    expect(
      screen.getByRole('img', { name: /Valeur et montant investi/ }),
    ).toBeInTheDocument()
  })

  it('warns about an old value and says where the contributions come from', async () => {
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          valueDate: '2026-08-06',
          contributionsDate: '2025-12-31',
          daysSinceLatest: 92,
          staleAfterDays: 35,
          stale: true,
          sinceOneYear: null,
        }),
      ),
    )
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(text(alert.textContent)).toContain(
      'Valeur du 6 août 2026, il y a 92 jours',
    )
    expect(
      screen.getByText('Saisi sur la valeur du 31 déc. 2025'),
    ).toBeInTheDocument()
  })

  it('adds a value, refusing a future date and a bad amount', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Mettre à jour la valeur' }),
    )
    const dialog = await screen.findByRole('dialog')
    const date = within(dialog).getByLabelText('Date')
    expect(date).toHaveValue('2026-11-06')
    // The invested amount is folded under « Plus d’options » (#360),
    // prefilled with the latest one typed on the values.
    expect(within(dialog).queryByLabelText('Investi à cette date')).toBeNull()
    await user.click(
      within(dialog).getByRole('button', { name: 'Plus d’options' }),
    )
    expect(within(dialog).getByLabelText('Investi à cette date')).toHaveValue(
      '10200',
    )

    await user.clear(date)
    await user.type(date, '2026-11-07')
    // Letters never reach the field (#326): the value stays to fill.
    await user.type(within(dialog).getByLabelText('Valeur'), 'beaucoup')
    expect(within(dialog).getByLabelText('Valeur')).toHaveValue('')
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )
    expect(
      within(dialog).getByText('La date ne peut pas être dans le futur'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Indiquez la valeur')).toBeInTheDocument()
    expect(api.accountSnapshotsControllerUpsert).not.toHaveBeenCalled()

    await user.clear(date)
    await user.type(date, '2026-10-31')
    const value = within(dialog).getByLabelText('Valeur')
    await user.clear(value)
    await user.type(value, '12 750,50')
    await user.type(within(dialog).getByLabelText('Note'), 'Espace client')
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )

    await waitFor(() =>
      expect(api.accountSnapshotsControllerUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID, date: '2026-10-31' },
          body: {
            valueCents: 1_275_050,
            contributionsCents: 1_020_000,
            note: 'Espace client',
          },
        }),
      ),
    )
    expect(toast.success).toHaveBeenCalled()
    // Refetched after the change.
    await waitFor(() =>
      expect(api.accountSnapshotsControllerPerformance).toHaveBeenCalledTimes(
        2,
      ),
    )
  })

  it('edits and deletes a value', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Modifier la valeur du 30 juin 2026',
      }),
    )
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Date')).not.toBeInTheDocument()
    // Opened at once: the value has one.
    const contributions = within(dialog).getByLabelText('Investi à cette date')
    expect(contributions).toHaveValue('10000')
    await user.clear(contributions)
    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer' }),
    )
    await waitFor(() =>
      expect(api.accountSnapshotsControllerUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID, date: '2026-06-30' },
          body: { valueCents: 1_200_000, contributionsCents: null, note: null },
        }),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Modifier la valeur du 30 sept. 2026',
      }),
    )
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    const confirm = await screen.findByRole('dialog', {
      name: 'Supprimer la valeur du 30 sept. 2026 ?',
    })
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(api.accountSnapshotsControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID, date: '2026-09-30' },
        }),
      ),
    )
  })

  it('previews a pasted history and saves the valid lines', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Coller un historique' }),
    )
    const dialog = await screen.findByRole('dialog')
    const save = within(dialog).getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()

    await user.click(within(dialog).getByLabelText('Historique'))
    await user.paste(
      '31/12/2024;9 000,00;8 500\n31/13/2024;1\n31/03/2025;9 500,5\n31/12/2026;1',
    )
    const preview = within(dialog).getByRole('region', { name: 'Aperçu' })
    expect(within(preview).getAllByRole('listitem')).toHaveLength(2)
    expect(text(preview.textContent)).toContain('9 500,50 €')
    const warning = within(dialog).getByRole('alert')
    expect(text(warning.textContent)).toContain('2 lignes ignorées')
    expect(text(warning.textContent)).toContain('Ligne 2 : Date invalide')
    expect(text(warning.textContent)).toContain('Ligne 4 : Date dans le futur')

    await user.click(
      within(dialog).getByRole('button', { name: 'Enregistrer 2 valeurs' }),
    )
    await waitFor(() =>
      expect(api.accountSnapshotsControllerBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID },
          body: {
            rows: [
              {
                date: '2024-12-31',
                valueCents: 900_000,
                contributionsCents: 850_000,
              },
              {
                date: '2025-03-31',
                valueCents: 950_050,
                contributionsCents: null,
              },
            ],
          },
        }),
      ),
    )
    expect(toast.success).toHaveBeenCalledWith(
      '2 valeurs ajoutées, 1 mise à jour',
    )
  })

  describe('cash account (#293)', () => {
    const transactions: TransactionDto[] = [
      {
        id: 'b0000000-0000-4000-8000-000000000001',
        accountId: ACCOUNT_ID,
        accountName: 'Courant test',
        importId: null,
        bookingDate: '2026-11-04',
        valueDate: null,
        amountCents: 250_000,
        rawLabel: 'VIR SEPA FAKE EMPLOYER',
        merchant: null,
        kind: 'income',
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
        createdAt: '2026-11-05T00:00:00.000Z',
        updatedAt: '2026-11-05T00:00:00.000Z',
      },
    ]

    function history(
      overrides: Partial<BalanceHistoryDto> = {},
    ): BalanceHistoryDto {
      return {
        from: '2026-10-01',
        to: '2026-11-04',
        points: [
          { date: '2026-10-01', balanceCents: 100_000 },
          { date: '2026-11-04', balanceCents: 154_321 },
        ],
        statements: [{ date: '2026-10-01', valueCents: 100_000 }],
        gaps: [
          {
            fromDate: '2026-10-10',
            toDate: '2026-10-14',
            differenceCents: -4_200,
          },
        ],
        dataUntil: '2026-11-04',
        lastImportOn: '2026-11-04',
        ...overrides,
      }
    }

    function flows(
      overrides: Partial<AccountMonthFlowsDto> = {},
    ): AccountMonthFlowsDto {
      return {
        period: {
          month: '2026-11',
          dataUntil: '2026-11-04',
          status: 'partial',
          throughDay: 4,
          previousMonth: '2026-10',
          previousUntil: '2026-10-04',
          defaultMonth: '2026-11',
        },
        inCents: 250_000,
        outCents: -195_679,
        netCents: 54_321,
        transfersInCents: 0,
        transfersOutCents: -50_000,
        count: 12,
        ...overrides,
      }
    }

    const importRow = {
      id: 'c0000000-0000-4000-8000-000000000001',
      accountId: ACCOUNT_ID,
      accountName: 'Courant test',
      source: 'cic_csv',
      fileName: 'export-test.csv',
      status: 'committed',
      periodStart: '2026-10-01',
      periodEnd: '2026-11-04',
      counts: {
        rows: 20,
        new: 20,
        duplicates: 0,
        conflicts: 0,
        issues: 0,
        inserted: 20,
        skipped: 0,
      },
      createdAt: '2026-11-04T09:00:00.000Z',
      committedAt: '2026-11-04T09:00:00.000Z',
    } as unknown as ImportSummaryDto

    const recurringItem = {
      id: 'd0000000-0000-4000-8000-000000000001',
      accountId: ACCOUNT_ID,
      name: 'Box internet test',
      direction: 'debit',
      status: 'confirmed',
      cadence: 'monthly',
      amountType: 'fixed',
      typicalAmountCents: 2_999,
      monthlyEquivalentCents: 2_999,
      active: true,
      ended: false,
      nextExpectedDate: '2026-11-12',
    } as unknown as RecurringItemDto

    beforeEach(() => {
      api.accountsControllerFindOne.mockImplementation(() =>
        ok(
          account({
            type: 'checking',
            name: 'Courant test',
            institution: 'CIC',
            balanceCents: 154_321,
            balanceDate: '2026-11-04',
          }),
        ),
      )
      api.accountSnapshotsControllerPerformance.mockImplementation(() =>
        ok(
          performance({
            type: 'checking',
            snapshots: [snapshot('2026-10-01', 100_000, null)],
          }),
        ),
      )
      api.accountsControllerBalanceHistory.mockImplementation(() =>
        ok(history()),
      )
      api.accountsControllerMonthFlows.mockImplementation(() => ok(flows()))
      api.transactionsControllerList.mockImplementation(() =>
        ok({ items: transactions, total: 30, page: 1, limit: 50 }),
      )
      api.categoriesControllerList.mockImplementation(() => ok([]))
      api.accountsControllerList.mockImplementation(() => ok([]))
      api.importsControllerList.mockImplementation(() => ok([importRow]))
      api.recurringControllerList.mockImplementation(() =>
        ok([
          recurringItem,
          { ...recurringItem, id: 'other', accountId: 'another-account' },
        ]),
      )
    })

    it('shows the balance, its freshness, the month and the account’s life', async () => {
      renderPage()

      expect(
        await screen.findByRole('heading', { name: 'Courant test' }),
      ).toBeInTheDocument()
      // The institution only: the type is not repeated.
      expect(screen.getByText('CIC')).toBeInTheDocument()
      expect(screen.queryByText(/Compte courant/)).toBeNull()

      const balance = screen.getByRole('region', { name: 'Solde' })
      expect(text(balance.textContent)).toContain('1 543,21 €')
      expect(
        text((await within(balance).findByText(/^À jour au/)).textContent),
      ).toBe('À jour au 4 nov. · importé il y a 2 jours')
      const month = within(balance).getByRole('region', {
        name: 'Mouvements de novembre 2026',
      })
      expect(text(month.textContent)).toContain(
        'Novembre 2026 · jusqu’au 4 nov.',
      )
      expect(text(month.textContent)).toContain('Entrées+2 500,00 €')
      expect(text(month.textContent)).toContain('Sorties-1 956,79 €')
      expect(text(month.textContent)).toContain('Variation+543,21 €')

      const latest = screen.getByRole('region', {
        name: 'Dernières opérations',
      })
      expect(
        await within(latest).findByText('VIR SEPA FAKE EMPLOYER'),
      ).toBeInTheDocument()
      // No bulk selection on this short list.
      expect(within(latest).queryByRole('checkbox')).toBeNull()
      expect(
        within(latest).getByRole('link', { name: 'Tout voir' }),
      ).toHaveAttribute('href', `/transactions?account=${ACCOUNT_ID}`)

      const imports = screen.getByRole('region', { name: 'Imports' })
      expect(
        text((await within(imports).findByText(/20 ajoutées/)).textContent),
      ).toBe('20 ajoutées · le 4 nov.')
      expect(text(imports.textContent)).toContain(
        'Entre le 10 oct. et le 14 oct. : -42,00 € d’opérations manquantes',
      )

      const recurring = await screen.findByRole('region', {
        name: 'Prélèvements',
      })
      expect(text(recurring.textContent)).toContain('Box internet test')
      expect(text(recurring.textContent)).toContain('29,99 € / mois')
      expect(text(recurring.textContent)).toContain('prévu le 12 nov.')

      // Statement balances: their own folded section, no hand-built buttons
      // beside the header.
      expect(screen.getByText('Soldes de relevés')).toBeInTheDocument()
      expect(screen.getByText('1 solde')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ajouter' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Coller' })).toBeNull()
      expect(screen.queryByText(/Versé/)).toBeNull()
    })

    it('puts import, add and edit in the page actions', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderPage()

      await screen.findByRole('heading', { name: 'Courant test' })
      expect(
        screen
          .getAllByRole('button')
          .map((button) => button.textContent)
          .filter((label) =>
            [
              'Importer un relevé',
              'Ajouter une opération',
              'Modifier',
            ].includes(label),
          ),
      ).toEqual(['Importer un relevé', 'Ajouter une opération', 'Modifier'])

      await user.click(
        screen.getByRole('button', { name: 'Importer un relevé' }),
      )
      expect(navigate).toHaveBeenCalledWith({
        to: '/import',
        search: { account: ACCOUNT_ID },
      })

      await user.click(
        screen.getByRole('button', { name: 'Ajouter une opération' }),
      )
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('warns when the bank data stops before the previous month end', async () => {
      api.accountsControllerBalanceHistory.mockImplementation(() =>
        ok(history({ dataUntil: '2026-09-30', lastImportOn: '2026-10-02' })),
      )
      renderPage()

      const warning = await screen.findByRole('status')
      expect(text(warning.textContent)).toContain(
        'Relevé à importer : les opérations s’arrêtent au 30 sept.',
      )
      expect(text(warning.textContent)).toContain(
        'Dernier import il y a 35 jours.',
      )
      expect(
        within(warning).getByRole('button', { name: 'Importer un relevé' }),
      ).toBeInTheDocument()
    })

    it('says what to do when the account has no data yet', async () => {
      api.accountsControllerFindOne.mockImplementation(() =>
        ok(
          account({
            type: 'savings',
            name: 'Livret test',
            institution: null,
            balanceCents: null,
            balanceDate: null,
          }),
        ),
      )
      api.accountSnapshotsControllerPerformance.mockImplementation(() =>
        ok(performance({ type: 'savings', snapshots: [] })),
      )
      api.accountsControllerBalanceHistory.mockImplementation(() =>
        ok(
          history({
            from: null,
            to: null,
            points: [],
            statements: [],
            gaps: [],
            dataUntil: null,
            lastImportOn: null,
          }),
        ),
      )
      api.accountsControllerMonthFlows.mockImplementation(() =>
        ok(
          flows({
            period: { ...flows().period, status: 'empty', dataUntil: null },
            inCents: 0,
            outCents: 0,
            netCents: 0,
            transfersOutCents: 0,
            count: 0,
          }),
        ),
      )
      api.transactionsControllerList.mockImplementation(() =>
        ok({ items: [], total: 0, page: 1, limit: 50 }),
      )
      api.importsControllerList.mockImplementation(() => ok([]))
      api.recurringControllerList.mockImplementation(() => ok([]))
      renderPage()

      expect(
        await screen.findByText('Aucune opération pour ce compte'),
      ).toBeInTheDocument()
      expect(
        await screen.findByText('Aucun relevé importé'),
      ).toBeInTheDocument()
      expect(screen.queryByText('Évolution du solde')).toBeNull()
      expect(screen.queryByRole('region', { name: 'Prélèvements' })).toBeNull()
    })
  })

  it('is read-only for an archived account and handles unknown ones', async () => {
    api.accountsControllerFindOne.mockImplementation(() =>
      ok(account({ archivedAt: '2026-10-01T00:00:00.000Z' })),
    )
    renderPage()
    expect(await screen.findByText('Archivé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Modifier la valeur/ }),
    ).toBeNull()
  })

  it('says when the account does not exist', async () => {
    api.accountsControllerFindOne.mockImplementation(() =>
      Promise.resolve({
        error: { message: 'Account not found' },
        response: new Response(null, { status: 404 }),
      }),
    )
    renderPage()
    expect(await screen.findByText('Compte introuvable')).toBeInTheDocument()
  })
  function mockCrypto(
    overrides: Partial<AccountDto>,
    holdings: ValuedHoldingDto[] = [],
    sync: WalletSyncStatusDto | null = null,
  ) {
    api.accountsControllerFindOne.mockImplementation(() =>
      ok(
        account({
          type: 'crypto',
          name: 'Crypto test',
          balanceCents: null,
          cryptoSource: 'manual',
          ...overrides,
        }),
      ),
    )
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          type: 'crypto',
          valueCents: null,
          valueDate: null,
          contributionsCents: null,
          contributionsDate: null,
          gainCents: null,
          returnRate: null,
          sincePrevious: null,
          sinceOneYear: null,
          daysSinceLatest: null,
          stale: false,
          snapshots: [],
        }),
      ),
    )
    api.accountHoldingsControllerList.mockImplementation(() =>
      ok({
        accountId: ACCOUNT_ID,
        holdings,
        totals: {
          valueCents: holdings.reduce((sum, h) => sum + (h.valueCents ?? 0), 0),
          investedCents: null,
          gainCents: null,
          missingPriceCount: 0,
          staleCount: 0,
          withoutInvestedCount: 0,
        },
        complete: true,
        snapshot: null,
        priceApiEnabled: true,
        refreshFailed: false,
        sync,
      }),
    )
  }

  function holding(overrides: Partial<ValuedHoldingDto>): ValuedHoldingDto {
    return {
      id: 'h0000000-0000-4000-8000-000000000001',
      accountId: ACCOUNT_ID,
      assetId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      quantity: '0.5',
      location: '',
      investedCents: null,
      note: null,
      origin: 'manual',
      priceEur: '60000',
      priceSource: 'provider',
      priceFetchedAt: new Date().toISOString(),
      priceStale: false,
      priceChange24hPercent: null,
      valueCents: 3_000_000,
      gainCents: null,
      ...overrides,
    }
  }

  /** Public test vectors only (BIP32 test vector 1, EIP-55 example). */
  function walletKey(overrides: Partial<WalletKeyDto>): WalletKeyDto {
    return {
      id: 'k0000000-0000-4000-8000-000000000001',
      accountId: ACCOUNT_ID,
      family: 'bitcoin',
      publicKey:
        'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8',
      chains: ['bitcoin'],
      label: null,
      format: 'xpub',
      addressTypes: ['native_segwit'],
      detectingAddressType: false,
      scans: [],
      createdAt: '2026-11-01T10:00:00.000Z',
      ...overrides,
    }
  }

  it('shows the source of an exchange account and keeps imported holdings read-only', async () => {
    mockCrypto(
      {
        cryptoSource: 'exchange',
        cryptoProvider: 'binance',
        institution: 'Binance',
      },
      [
        holding({ id: 'h-import', origin: 'import', location: '' }),
        holding({
          id: 'h-manual',
          symbol: 'ETH',
          name: 'Ethereum',
          location: 'Carte test',
        }),
      ],
    )
    renderPage()

    const source = await screen.findByRole('region', {
      name: 'Source des avoirs',
    })
    expect(
      within(source).getByText('Plateforme d’échange · Binance'),
    ).toBeInTheDocument()
    expect(
      within(source).getByText('Dernier import : jamais'),
    ).toBeInTheDocument()
    // Exports are imported from here (#128).
    expect(
      within(source).getByRole('button', { name: 'Importer un export' }),
    ).toBeEnabled()
    expect(within(source).queryByText(/Bientôt disponible/)).toBeNull()

    const list = await screen.findByRole('list', { name: 'Avoirs' })
    // The imported line is read-only, the line typed by hand opens its editor.
    // Where each line comes from, on its second row when the list mixes them.
    expect(within(list).getByText(/ · importé$/)).toBeInTheDocument()
    expect(within(list).getByText(/ · à la main$/)).toBeInTheDocument()
    expect(
      within(list).queryByRole('button', { name: /^Modifier BTC/ }),
    ).not.toBeInTheDocument()
    expect(
      within(list).getByRole('button', { name: 'Modifier ETH · Carte test' }),
    ).toBeInTheDocument()
  })

  it('lists the public keys of a wallet account, what they found, and adds one', async () => {
    // Radix Checkbox measures itself; jsdom has no ResizeObserver (left
    // undefined elsewhere: the charts fall back without it).
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const user = userEvent.setup()
    mockCrypto(
      {
        cryptoSource: 'wallet',
        institution: 'Ledger',
        cryptoSyncedAt: '2026-11-05T09:30:00.000Z',
      },
      [holding({ origin: 'sync', location: 'Bitcoin' })],
      {
        enabled: false,
        syncedAt: '2026-11-05T09:30:00.000Z',
        failedAt: null,
        failedChains: [],
        retryAt: null,
      },
    )
    api.walletTokensControllerList.mockImplementation(() => ok([]))
    api.walletKeysControllerList.mockImplementation(() =>
      ok([
        walletKey({
          label: 'Épargne',
          scans: [
            {
              addressType: 'native_segwit',
              usedAddresses: 3,
              completedAt: '2026-11-05T09:30:00.000Z',
            },
          ],
        }),
        walletKey({
          id: 'k-legacy',
          publicKey:
            'xpub6D4BDPcP2GT577Vvch3R8wDkScZWzQzMMUm3PWbmWvVJrZwQY4VUNgqFJPMM3No2dFDFGTsxxpG5uJh7n7epu4trkrX7x7DogT5Uv6fcLW5',
          addressTypes: ['legacy'],
          scans: [
            {
              addressType: 'legacy',
              usedAddresses: 0,
              completedAt: '2026-11-05T09:30:00.000Z',
            },
          ],
        }),
        walletKey({
          id: 'k-evm',
          family: 'evm',
          publicKey: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
          chains: ['ethereum', 'base'],
          format: null,
          addressTypes: null,
        }),
      ]),
    )
    api.walletKeysControllerUpdate.mockImplementation(() =>
      ok(walletKey({ addressTypes: ['legacy'] })),
    )
    api.walletKeysControllerAdd.mockImplementation(
      ({ body }: { body: { publicKey: string } }) =>
        ok(walletKey({ id: 'k-new', publicKey: body.publicKey }), 201),
    )
    api.walletKeysControllerRemove.mockImplementation(() =>
      Promise.resolve({
        data: undefined,
        response: new Response(null, { status: 204 }),
      }),
    )
    renderPage()

    const status = await screen.findByRole('region', {
      name: 'Valeur du wallet',
    })
    expect(within(status).getByText(/30\s000,00\s€/)).toBeInTheDocument()
    // The server does not read chains: said once, beside the balances' age.
    expect(
      within(status).getByText(/^Soldes lus .* · synchronisation désactivée$/),
    ).toBeInTheDocument()

    // Keys and tokens are settings: one row per key, what it found (#294).
    const settings = screen.getByRole('region', { name: 'Clés et jetons' })
    expect(
      await within(settings).findByRole('button', {
        name: 'Épargne : xpub661M…GMcet8 · 3 adresses utilisées',
      }),
    ).toBeInTheDocument()
    expect(
      within(settings).getByRole('button', {
        name: 'Adresse EVM : 0x5aAeb6…1BeAed · Ethereum, Base',
      }),
    ).toBeInTheDocument()

    // Each key opens its own screen (the owner's « Un écran par clé »).
    await user.click(
      within(settings).getByRole('button', {
        name: 'Bitcoin : xpub6D4B…6fcLW5 · Aucune adresse utilisée en Legacy (1…) : vérifiez le type',
      }),
    )
    let keySheet = await screen.findByRole('dialog', { name: 'Bitcoin' })
    expect(within(keySheet).getByText('xpub6D4B…6fcLW5')).toBeInTheDocument()
    expect(within(keySheet).getByText('Legacy (1…)')).toBeInTheDocument()
    // An xpub that found nothing in its type says so, with « Changer » (#268).
    expect(
      within(keySheet).getByText(
        'Aucune adresse utilisée en Legacy (1…) : vérifiez le type',
      ),
    ).toBeInTheDocument()
    // Copies the whole key, not its masked form.
    await user.click(within(keySheet).getByRole('button', { name: 'Copier' }))
    expect(await navigator.clipboard.readText()).toMatch(/^xpub6D4BDPcP2GT5/)
    await user.click(
      within(keySheet).getByRole('button', {
        name: 'Changer le type d’adresses',
      }),
    )
    const typeSheet = await screen.findByRole('dialog', {
      name: 'Type d’adresses',
    })
    await user.click(within(typeSheet).getByLabelText(/^Native SegWit/))
    await user.click(
      within(typeSheet).getByRole('button', { name: 'Enregistrer' }),
    )
    await waitFor(() =>
      expect(api.walletKeysControllerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID, keyId: 'k-legacy' },
          body: { addressType: 'native_segwit' },
        }),
      ),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Type d’adresses' }),
      ).not.toBeInTheDocument(),
    )
    // Every line is synced: no badge saying so, nothing to edit or add.
    expect(screen.queryByText('Synchronisé')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Modifier BTC/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Ajouter un avoir/ }),
    ).not.toBeInTheDocument()

    await user.click(
      within(settings).getByRole('button', { name: 'Ajouter une clé' }),
    )
    const sheet = await screen.findByRole('dialog', {
      name: 'Ajouter une clé publique',
    })
    await user.click(within(sheet).getByLabelText('Clé publique'))
    await user.paste('0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359')
    await user.click(within(sheet).getByRole('checkbox', { name: 'Polygon' }))
    await user.type(
      within(sheet).getByLabelText('Libellé (facultatif)'),
      'Compte 2',
    )
    await user.click(
      within(sheet).getByRole('button', { name: 'Ajouter la clé' }),
    )
    await waitFor(() =>
      expect(api.walletKeysControllerAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID },
          body: {
            publicKey: '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359',
            chains: ['ethereum', 'polygon'],
            label: 'Compte 2',
          },
        }),
      ),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Ajouter une clé publique' }),
      ).not.toBeInTheDocument(),
    )

    // Removing a key, from its screen, asks first.
    await user.click(
      within(settings).getByRole('button', { name: /^Adresse EVM : / }),
    )
    keySheet = await screen.findByRole('dialog', { name: 'Adresse EVM' })
    expect(within(keySheet).getByText('Ethereum, Base')).toBeInTheDocument()
    // An EVM address has no address type to change.
    expect(
      within(keySheet).queryByRole('button', { name: /Changer/ }),
    ).not.toBeInTheDocument()
    await user.click(
      within(keySheet).getByRole('button', { name: 'Retirer la clé' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Retirer' }))
    await waitFor(() =>
      expect(api.walletKeysControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: ACCOUNT_ID, keyId: 'k-evm' } }),
      ),
    )
  })

  function walletHoldings(
    sync: WalletSyncStatusDto,
    holdings: ValuedHoldingDto[] = [],
  ): AccountHoldingsDto {
    return {
      accountId: ACCOUNT_ID,
      holdings,
      totals: {
        valueCents: holdings.reduce((sum, h) => sum + (h.valueCents ?? 0), 0),
        investedCents: null,
        gainCents: null,
        missingPriceCount: 0,
        staleCount: 0,
        withoutInvestedCount: 0,
      },
      complete: true,
      snapshot: null,
      priceApiEnabled: true,
      refreshFailed: false,
      sync,
    }
  }

  function mockWallet(
    sync: WalletSyncStatusDto,
    holdings: ValuedHoldingDto[] = [],
  ) {
    mockCrypto(
      {
        cryptoSource: 'wallet',
        institution: 'Ledger',
        cryptoSyncedAt: sync.syncedAt,
      },
      holdings,
      sync,
    )
    api.walletKeysControllerList.mockImplementation(() =>
      ok([
        walletKey({}),
        walletKey({
          id: 'k-evm',
          family: 'evm',
          publicKey: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
          chains: ['ethereum', 'arbitrum'],
          format: null,
          addressTypes: null,
        }),
      ]),
    )
    api.walletTokensControllerList.mockImplementation(() => ok([]))
  }

  it('refreshes a wallet with one « Actualiser »: chains then prices', async () => {
    const user = userEvent.setup()
    mockWallet({
      enabled: true,
      syncedAt: null,
      failedAt: null,
      failedChains: [],
      retryAt: null,
    })
    const synced = walletHoldings(
      {
        enabled: true,
        syncedAt: '2026-11-06T09:59:00.000Z',
        failedAt: null,
        failedChains: [],
        retryAt: null,
      },
      [holding({ origin: 'sync', location: 'Bitcoin' })],
    )
    api.accountHoldingsControllerSync.mockImplementation(() => {
      // The API now lists the synced holdings too.
      api.accountHoldingsControllerList.mockImplementation(() => ok(synced))
      return ok(synced)
    })
    renderPage()

    const status = await screen.findByRole('region', {
      name: 'Valeur du wallet',
    })
    expect(within(status).getByText(/^Jamais synchronisé/)).toBeInTheDocument()
    // One refresh button on the page: no « Synchroniser » nor « Actualiser
    // les cours » apart.
    expect(
      screen.queryByRole('button', { name: 'Synchroniser' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Actualiser les cours' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actualiser' }))
    await waitFor(() =>
      expect(api.accountHoldingsControllerSync).toHaveBeenCalledWith(
        expect.objectContaining({ path: { id: ACCOUNT_ID } }),
      ),
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Wallet synchronisé'),
    )
    expect(
      await within(status).findByText('Soldes lus il y a 1 min'),
    ).toBeInTheDocument()
  })

  it('shows a wallet value once, without contribution tiles', async () => {
    mockWallet(
      {
        enabled: true,
        syncedAt: '2026-11-06T09:00:00.000Z',
        failedAt: null,
        failedChains: [],
        retryAt: null,
      },
      [holding({ origin: 'sync', location: 'Bitcoin' })],
    )
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          type: 'crypto',
          valueCents: 3_000_000,
          contributionsCents: null,
          contributionsDate: null,
          gainCents: null,
          returnRate: null,
          sinceOneYear: null,
        }),
      ),
    )
    renderPage()

    const summary = await screen.findByRole('region', {
      name: 'Valeur du wallet',
    })
    expect(within(summary).getAllByText(/30\s000,00\s€/)).toHaveLength(1)
    // Once more on its asset's row, nowhere else on the page.
    const assets = screen.getByRole('list', { name: 'Avoirs' })
    expect(
      within(assets).getByRole('button', {
        name: /^Bitcoin, 30\s000,00\s€, 0,5 BTC, 100 %$/,
      }),
    ).toBeInTheDocument()
    // No key figures left without a year of history: nothing but dashes.
    expect(
      screen.queryByRole('region', { name: 'Chiffres clés' }),
    ).not.toBeInTheDocument()
    for (const label of [
      'Valeur des avoirs',
      'Investi',
      'Versements',
      'Plus-value',
      'Rendement',
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('shows what the wallet holds before its keys: change, split, assets, evolution', async () => {
    const user = userEvent.setup()
    mockWallet(
      {
        enabled: true,
        syncedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
        failedAt: null,
        failedChains: [],
        retryAt: null,
      },
      [
        holding({ id: 'h-btc', origin: 'sync', location: 'Bitcoin' }),
        holding({
          id: 'h-eth',
          origin: 'sync',
          assetId: 'ethereum',
          symbol: 'ETH',
          name: 'Ethereum',
          quantity: '1',
          location: 'Ethereum',
          priceEur: '1000',
          valueCents: 100_000,
        }),
        holding({
          id: 'h-demo',
          origin: 'sync',
          assetId: 'erc20.42161.0x1111111111111111111111111111111111111111',
          symbol: 'DEMO',
          name: 'Demo Token',
          quantity: '15000',
          location: 'Arbitrum',
          priceEur: null,
          priceFetchedAt: null,
          valueCents: null,
        }),
      ],
    )
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          type: 'crypto',
          contributionsCents: null,
          contributionsDate: null,
          gainCents: null,
          returnRate: null,
        }),
      ),
    )
    renderPage()

    const summary = await screen.findByRole('region', {
      name: 'Valeur du wallet',
    })
    // The change since the previous value, then how fresh the balances are.
    expect(text(summary.textContent)).toContain('+500,00 € depuis le 30 juin')
    expect(
      within(summary).getByText('Soldes lus il y a 6 min'),
    ).toBeInTheDocument()
    // No invested amount yet: one line and its action, no dashes (#360).
    expect(text(summary.textContent)).toContain(
      'Montant investi pas encore renseigné',
    )
    expect(
      within(summary).getByRole('button', {
        name: 'Renseigner le montant investi',
      }),
    ).toBeInTheDocument()
    expect(text(summary.textContent)).toContain('Sur 1 an+2 500 €+25 %')
    expect(text(summary.textContent)).not.toContain('—')
    // The split by asset, priced ones only, heads the holdings.
    expect(
      within(screen.getByRole('region', { name: 'Avoirs crypto' })).getByRole(
        'img',
        { name: 'Répartition : BTC 97 %, ETH 3 %' },
      ),
    ).toBeInTheDocument()

    // Tokens without a price apart, last.
    const unpriced = screen.getByRole('list', { name: 'Avoirs sans cours' })
    expect(
      within(unpriced).getByRole('button', {
        name: /^Demo Token, sans cours, 15\s000 DEMO · Arbitrum$/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('3 actifs · 3 réseaux · cours à l’instant'),
    ).toBeInTheDocument()

    // The evolution: the values folded (its change over one year is the
    // summary's).
    const evolution = screen.getByRole('region', { name: 'Évolution' })
    expect(text(evolution.textContent)).not.toContain('sur 1 an')
    const values = within(evolution).getByRole('button', {
      name: 'Valeurs enregistrées (3)',
    })
    expect(values).toHaveAttribute('aria-expanded', 'false')
    await user.click(values)
    expect(
      within(evolution).getByRole('button', {
        name: /^Modifier la valeur du 30 sept\.? 2026$/,
      }),
    ).toBeInTheDocument()

    // Then the keys and tokens, last.
    const regions = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label') ?? 'Valeur du wallet')
    expect(regions).toEqual([
      'Valeur du wallet',
      'Avoirs crypto',
      'Évolution',
      'Clés et jetons',
    ])
  })

  it('states what the coins sent to a wallet cost, when the movements say (#296)', async () => {
    mockWallet(
      {
        enabled: true,
        syncedAt: '2026-11-06T09:00:00.000Z',
        failedAt: null,
        failedChains: [],
        retryAt: null,
      },
      [holding({ origin: 'sync', location: 'Bitcoin' })],
    )
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          type: 'crypto',
          valueCents: 3_000_000,
          contributionsCents: 2_400_000,
          gainCents: 600_000,
          returnRate: 0.25,
        }),
      ),
    )
    renderPage()

    const summary = await screen.findByRole('region', {
      name: 'Valeur du wallet',
    })
    expect(text(summary.textContent)).toContain('Investi24 000 €')
    expect(text(summary.textContent)).toContain('Résultat+6 000 €+25 %')
  })

  it('shows the invested base of a wallet and the coins of unknown cost (#358)', async () => {
    mockWallet(
      {
        enabled: true,
        syncedAt: '2026-11-06T09:00:00.000Z',
        failedAt: null,
        failedChains: [],
        retryAt: null,
      },
      [holding({ origin: 'sync', location: 'Bitcoin' })],
    )
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          type: 'crypto',
          valueCents: 300_000,
          contributionsCents: 500_000,
          contributionsSource: 'base',
          gainCents: -200_000,
          returnRate: -0.4,
          unknownCostCount: 1,
          investedBase: { amountCents: 500_000, on: '2026-06-30' },
        }),
      ),
    )
    renderPage()

    const summary = await screen.findByRole('region', {
      name: 'Valeur du wallet',
    })
    expect(text(summary.textContent)).toContain('Investi5 000 €')
    expect(text(summary.textContent)).toContain('Résultat-2 000 €-40 %')
    expect(text(summary.textContent)).toContain(
      'Saisi au 30 juin 2026 · dont 1 envoi sans coût connu',
    )
    expect(
      within(summary).getByRole('img', {
        name: (name) => text(name) === 'Valeur : 5 000,00 € investis, dont 2 000,00 € perdus',
      }),
    ).toBeInTheDocument()
  })

  it('flags stale holdings when the last sync failed', async () => {
    const user = userEvent.setup()
    const stale: WalletSyncStatusDto = {
      enabled: true,
      syncedAt: '2026-11-05T09:30:00.000Z',
      failedAt: '2026-11-06T09:00:00.000Z',
      failedChains: [],
      retryAt: null,
    }
    mockWallet(stale)
    api.accountHoldingsControllerSync.mockImplementation(() =>
      ok(walletHoldings({ ...stale, failedAt: '2026-11-06T09:59:00.000Z' })),
    )
    renderPage()

    const status = await screen.findByRole('region', {
      name: 'Valeur du wallet',
    })
    expect(
      await within(status).findByText(
        'La dernière synchronisation a échoué : soldes de la précédente.',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actualiser' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Synchronisation impossible pour le moment : les derniers avoirs connus sont conservés.',
      ),
    )
  })

  it('names each chain a sync could not read once, with its retry time', async () => {
    const user = userEvent.setup()
    // Bitcoin rate limited until 11:30 (Paris), Ethereum read at 10:58.
    const partial: WalletSyncStatusDto = {
      enabled: true,
      syncedAt: '2026-11-06T09:58:00.000Z',
      failedAt: '2026-11-06T09:58:00.000Z',
      failedChains: [
        {
          chain: 'bitcoin',
          reason: 'rate_limited',
          retryAt: '2026-11-06T10:30:00.000Z',
        },
      ],
      retryAt: '2026-11-06T10:30:00.000Z',
    }
    mockWallet(partial)
    api.accountHoldingsControllerSync.mockImplementation(() =>
      ok(
        walletHoldings({
          ...partial,
          syncedAt: '2026-11-06T09:59:30.000Z',
          failedAt: '2026-11-06T09:59:30.000Z',
        }),
      ),
    )
    renderPage()

    const status = await screen.findByRole('region', {
      name: 'Valeur du wallet',
    })
    const chains = await within(status).findByRole('list', {
      name: 'Chaînes non lues',
    })
    expect(text(chains.textContent)).toBe(
      'Bitcoin : trop de requêtes, nouvel essai possible à 11:30',
    )
    // Said once on the page.
    expect(screen.getAllByText(/11:30/)).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Actualiser' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Lecture impossible pour Bitcoin (nouvel essai possible à 11:30) : leurs derniers avoirs connus sont conservés, les autres chaînes sont à jour.',
      ),
    )
  })

  it('adds a token by its name or its contract address, then refreshes', async () => {
    const user = userEvent.setup()
    const sync: WalletSyncStatusDto = {
      enabled: true,
      syncedAt: null,
      failedAt: null,
      failedChains: [],
      retryAt: null,
    }
    mockWallet(sync)
    api.cryptoControllerSearch.mockImplementation(() =>
      ok([{ id: 'usd-coin', symbol: 'USDC', name: 'USDC', rank: 7 }]),
    )
    api.walletTokensControllerAdd.mockImplementation(
      ({ body }: { body: { contract?: string } }) =>
        ok(
          body.contract
            ? {
                id: 't-2',
                accountId: ACCOUNT_ID,
                assetId: `erc20.42161.${body.contract.toLowerCase()}`,
                symbol: 'TKN',
                name: 'Test Token',
                chain: 'arbitrum',
                contract: body.contract,
                priced: false,
              }
            : {
                id: 't-1',
                accountId: ACCOUNT_ID,
                assetId: 'usd-coin',
                symbol: 'USDC',
                name: 'USDC',
                chain: null,
                contract: null,
                priced: true,
              },
          201,
        ),
    )
    api.accountHoldingsControllerSync.mockImplementation(() =>
      ok(walletHoldings(sync)),
    )
    renderPage()

    await user.click(
      await screen.findByRole('button', {
        name: 'Jetons lus : ETH, BNB et POL seulement',
      }),
    )
    expect(
      await screen.findByText(
        'ETH, BNB et POL sont toujours lus. Ajoutez les jetons ERC-20 / BEP-20 de vos adresses.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/actifs déjà détenus uniquement/),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter un jeton' }))
    let sheet = await screen.findByRole('dialog', { name: 'Ajouter un jeton' })
    await user.type(within(sheet).getByLabelText('Jeton'), 'usdc')
    await user.click(
      await within(sheet).findByRole(
        'button',
        { name: /USDC/ },
        { timeout: 2000 },
      ),
    )
    await waitFor(() =>
      expect(api.walletTokensControllerAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID },
          body: { assetId: 'usd-coin', symbol: 'USDC', name: 'USDC' },
        }),
      ),
    )
    await waitFor(() =>
      expect(api.accountHoldingsControllerSync).toHaveBeenCalledTimes(1),
    )

    // By its contract, on one of the wallet's chains.
    await user.click(screen.getByRole('button', { name: 'Ajouter un jeton' }))
    sheet = await screen.findByRole('dialog', { name: 'Ajouter un jeton' })
    await user.click(
      within(sheet).getByRole('radio', { name: 'Par son adresse' }),
    )
    await user.click(
      within(sheet).getByRole('button', { name: 'Ajouter le jeton' }),
    )
    expect(
      within(sheet).getByText('Collez l’adresse du contrat du jeton.'),
    ).toBeInTheDocument()
    await user.click(within(sheet).getByLabelText('Adresse du contrat'))
    await user.paste('0xab12ab12ab12ab12ab12ab12ab12ab12ab12ab12')
    expect(within(sheet).getByLabelText('Chaîne')).toHaveValue('ethereum')
    await user.selectOptions(within(sheet).getByLabelText('Chaîne'), 'arbitrum')
    await user.click(
      within(sheet).getByRole('button', { name: 'Ajouter le jeton' }),
    )
    await waitFor(() =>
      expect(api.walletTokensControllerAdd).toHaveBeenLastCalledWith(
        expect.objectContaining({
          body: {
            contract: '0xab12ab12ab12ab12ab12ab12ab12ab12ab12ab12',
            chain: 'arbitrum',
          },
        }),
      ),
    )
    await waitFor(() =>
      expect(api.accountHoldingsControllerSync).toHaveBeenCalledTimes(2),
    )
  })

  it('lets a manual line typed on a wallet be deleted, not edited, and badges mixed origins', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    mockWallet(
      {
        enabled: true,
        syncedAt: '2026-11-06T09:00:00.000Z',
        failedAt: null,
        failedChains: [],
        retryAt: null,
      },
      [
        holding({
          id: 'h-sync',
          origin: 'sync',
          assetId: 'ethereum',
          symbol: 'ETH',
          name: 'Ethereum',
          location: 'Ethereum',
        }),
        holding({
          id: 'h-arb',
          origin: 'sync',
          assetId: 'ethereum',
          symbol: 'ETH',
          name: 'Ethereum',
          location: 'Arbitrum',
        }),
        holding({ id: 'h-manual', origin: 'manual', location: 'Papier' }),
      ],
    )
    api.accountHoldingsControllerRemove.mockImplementation(() =>
      ok(undefined, 204),
    )
    renderPage()

    // One row per asset (#294): ETH read on two chains is one row.
    const list = await screen.findByRole('list', { name: 'Avoirs' })
    const ethRow = within(list).getByRole('button', {
      name: /^Ethereum, 60\s000,00\s€, 1 ETH · 2 réseaux, 67 %$/,
    })
    const btcRow = within(list).getByRole('button', {
      name: /^Bitcoin, 30\s000,00\s€, 0,5 BTC · Papier, 33 %$/,
    })
    expect(ethRow).toHaveAttribute('aria-expanded', 'false')
    // Its chains and price fold under it.
    await user.click(ethRow)
    expect(ethRow).toHaveAttribute('aria-expanded', 'true')
    const ethLines = screen.getByRole('list', { name: 'Lignes ETH' })
    expect(
      within(ethLines)
        .getAllByRole('listitem')
        .map((item) => text(item.textContent)),
    ).toEqual([
      'Ethereum · 0,5 ETHSynchronisé30 000,00 €',
      'Arbitrum · 0,5 ETHSynchronisé30 000,00 €',
    ])
    expect(
      screen.getByText(/^1 ETH = 60\s000,00\s€ · cours /),
    ).toBeInTheDocument()
    // Mixed origins: each line says where it comes from; nothing to edit.
    await user.click(btcRow)
    expect(
      within(screen.getByRole('list', { name: 'Lignes BTC' })).getByText(
        'Saisi à la main',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Modifier (BTC|ETH)/ }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Supprimer BTC · Papier' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(api.accountHoldingsControllerRemove).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: ACCOUNT_ID, holdingId: 'h-manual' },
        }),
      ),
    )
  })

  it('lists the holdings of a crypto account instead of the empty state', async () => {
    api.accountsControllerFindOne.mockImplementation(() =>
      ok(
        account({
          type: 'crypto',
          name: 'Crypto test',
          balanceCents: null,
          cryptoSource: 'manual',
          institution: 'Ledger',
        }),
      ),
    )
    api.accountSnapshotsControllerPerformance.mockImplementation(() =>
      ok(
        performance({
          type: 'crypto',
          valueCents: null,
          valueDate: null,
          contributionsCents: null,
          contributionsDate: null,
          gainCents: null,
          returnRate: null,
          sincePrevious: null,
          sinceOneYear: null,
          daysSinceLatest: null,
          stale: false,
          snapshots: [],
        }),
      ),
    )
    api.accountHoldingsControllerList.mockImplementation(() =>
      ok({
        accountId: ACCOUNT_ID,
        holdings: [],
        totals: {
          valueCents: 0,
          investedCents: null,
          gainCents: null,
          missingPriceCount: 0,
          staleCount: 0,
          withoutInvestedCount: 0,
        },
        complete: true,
        snapshot: null,
        priceApiEnabled: true,
        refreshFailed: false,
        sync: null,
      }),
    )
    renderPage()

    expect(await screen.findByText('Aucun avoir')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Avoirs crypto' }),
    ).toBeInTheDocument()
    // Typed by hand: no import or sync action, only the way to read it from
    // a wallet or an exchange instead (#207).
    const source = screen.getByRole('region', { name: 'Source des avoirs' })
    expect(
      within(source).getByText('Saisie manuelle · Ledger'),
    ).toBeInTheDocument()
    expect(
      within(source)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Relier à un wallet ou une plateforme'])
    expect(
      screen.queryByText('Aucune valeur pour ce compte'),
    ).not.toBeInTheDocument()
    // Its value comes from its holdings: no "Ajouter" next to "Ajouter un
    // avoir", only past values can be pasted.
    expect(
      screen.queryByRole('button', { name: 'Ajouter' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Coller un historique de valeurs' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Ajouter un avoir' }),
    ).not.toHaveLength(0)
  })
})
