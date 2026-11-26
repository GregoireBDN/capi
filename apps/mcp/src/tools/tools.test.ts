import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  BudgetMonthDto,
  DashboardOverviewDto,
  EnvelopesDto,
  ForecastDto,
  MonthReviewDto,
  RecurringItemDto,
  RecurringSummaryDto,
  SavingsOverviewDto,
  SpendingByCategoryDto,
  SpendingTrendDto,
  TransactionListDto,
  TransactionSummaryDto,
} from '../api/types.js'
import {
  checking,
  flow,
  groceries,
  livret,
  pea,
  period,
  restaurants,
  salary,
  transaction,
} from '../test/fixtures.js'
import { connect, jsonError } from '../test/mock-api.js'
import { transactionLine } from './transactions.js'

const accounts = [checking, livret, pea]
const categories = [groceries, restaurants, salary]

const list: TransactionListDto = {
  items: [transaction],
  total: 31,
  page: 1,
  limit: 30,
}
const summary: TransactionSummaryDto = {
  count: 31,
  incomeCents: 0,
  expenseCents: -98765,
  netCents: -98765,
  oneOffIncomeCents: 0,
  oneOffExpenseCents: 0,
  transferCount: 2,
}

afterEach(() => vi.restoreAllMocks())

describe('tool list', () => {
  it('exposes small tools, read-only ones marked so', async () => {
    const { client } = await connect({})
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'accounts_overview',
      'add_investment_snapshots',
      'add_transaction',
      'budget_history',
      'budget_status',
      'budget_suggestions',
      'categorize_transactions',
      'close_months',
      'commit_bank_import',
      'create_investment_account',
      'create_rule',
      'integrity_checks',
      'link_repayment',
      'list_categories',
      'list_imports',
      'list_investment_accounts',
      'mark_one_off',
      'month_close_status',
      'month_end_forecast',
      'month_review',
      'owed_to_me',
      'preview_bank_import',
      'review_queue',
      'savings_and_goals',
      'search_transactions',
      'set_budget_targets',
      'set_invested_amount',
      'set_transaction_note',
      'share_expense',
      'spending_by_category',
      'spending_history',
      'split_transaction',
      'subscriptions',
      'sync_crypto_holdings',
      'sync_security_positions',
    ])
    const writeTools = new Set([
      'add_investment_snapshots',
      'sync_crypto_holdings',
      'sync_security_positions',
      'set_invested_amount',
      'add_transaction',
      'categorize_transactions',
      'create_rule',
      'mark_one_off',
      'set_budget_targets',
      'set_transaction_note',
      'preview_bank_import',
      'commit_bank_import',
      'close_months',
      'split_transaction',
      'share_expense',
      'link_repayment',
    ])
    // Writes no transaction (a pending preview only): nothing to confirm (#103).
    const withoutConfirm = new Set(['preview_bank_import'])
    for (const tool of tools) {
      const write = writeTools.has(tool.name)
      expect(tool.annotations?.readOnlyHint).toBe(!write)
      if (write) {
        expect(tool.annotations?.destructiveHint).toBe(false)
        if (!withoutConfirm.has(tool.name))
          expect(tool.inputSchema.properties).toHaveProperty('confirm')
      }
      expect(tool.name).not.toMatch(/delete|remove/)
      expect(tool.description?.length).toBeGreaterThan(40)
      expect(
        Object.keys(tool.inputSchema.properties ?? {}).length,
      ).toBeLessThanOrEqual(10)
    }
  })
})

describe('accounts_overview', () => {
  it('shows net worth and balances in euros with French dates', async () => {
    const overview: DashboardOverviewDto = {
      netWorth: {
        totalCents: 1234567,
        cashCents: 234567,
        investmentsCents: 1000000,
        previousMonthEnd: '2026-10-31',
        previousMonthEndCents: 1200000,
        unknownBalanceCount: 0,
      },
      accounts: [
        { ...checking, group: 'cash', dataUntil: '2026-11-10', stale: false },
        {
          ...pea,
          group: 'investments',
          balanceCents: 1000000,
          balanceDate: '2026-09-30',
          dataUntil: null,
          stale: true,
        },
      ],
      period: period(),
      current: flow({ month: '2026-11' }),
      previous: flow(),
      reviewCount: 0,
    }
    const { call } = await connect({ '/api/dashboard/overview': overview })
    const { text, isError } = await call('accounts_overview')
    expect(isError).toBe(false)
    expect(text).toContain('Patrimoine net : 12 345,67 €')
    expect(text).toContain('soit +345,67 € depuis')
    expect(text).toContain(
      '- Compte courant (compte courant, Banque Test) : 1 234,56 € au 10/11/2026',
    )
    expect(text).toContain(
      'PEA (PEA, Banque Test) : 10 000,00 € au 30/09/2026 — pas à jour',
    )
  })
})

describe('search_transactions', () => {
  it('maps names to ids and filters to query parameters', async () => {
    const { call, calls } = await connect({
      '/api/accounts': accounts,
      '/api/categories': categories,
      '/api/transactions': list,
      '/api/transactions/summary': summary,
    })
    const { text, isError } = await call('search_transactions', {
      month: '2026-11',
      account: 'compte COURANT',
      category: 'courses',
      text: 'epicerie',
      kind: 'expense',
    })
    expect(isError).toBe(false)
    const listCall = calls.find((c) => c.url.pathname === '/api/transactions')
    expect(Object.fromEntries(listCall!.url.searchParams)).toEqual({
      month: '2026-11',
      q: 'epicerie',
      kind: 'expense',
      accountId: checking.id,
      categoryId: groceries.id,
      limit: '30',
      page: '1',
    })
    const summaryCall = calls.find(
      (c) => c.url.pathname === '/api/transactions/summary',
    )
    expect(summaryCall!.url.searchParams.has('limit')).toBe(false)
    expect(text).toContain('31 trouvée(s), 1 à 1 affichées (page 1/2)')
    expect(text).toContain('dépenses -987,65 €')
    expect(text).toContain('2 virement(s) interne(s), exclus des totaux')
    expect(text).toContain(
      '- 03/11/2026 · -45,20 € · CB EPICERIE TEST (EPICERIE TEST) · Courses · Compte courant',
    )
    expect(text).toContain('page = 2')
  })

  it('accepts "uncategorized" and a category slug', async () => {
    const { call, calls } = await connect({
      '/api/transactions': list,
      '/api/transactions/summary': summary,
    })
    await call('search_transactions', { category: 'uncategorized' })
    expect(
      calls
        .find((c) => c.url.pathname === '/api/transactions')!
        .url.searchParams.get('uncategorized'),
    ).toBe('true')
  })

  it('refuses month combined with from/to without calling the API', async () => {
    const { call, calls } = await connect({})
    const result = await call('search_transactions', {
      month: '2026-11',
      from: '2026-11-01',
    })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('soit month, soit from/to')
    expect(calls).toHaveLength(0)
  })

  it('lists the choices for an unknown or ambiguous account', async () => {
    const { call } = await connect({ '/api/accounts': accounts })
    const unknown = await call('search_transactions', {
      account: 'Livret Jeune',
    })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain('introuvable')
    expect(unknown.text).toContain('Compte courant, Livret A, PEA')
    const ambiguous = await call('search_transactions', { account: 'e' })
    expect(ambiguous.isError).toBe(true)
    expect(ambiguous.text).toContain('ambigu')
  })

  it('rejects invalid arguments through the schema', async () => {
    const { call, calls } = await connect({})
    const result = await call('search_transactions', { month: '11/2026' })
    expect(result.isError).toBe(true)
    expect(calls).toHaveLength(0)
  })
})

describe('API errors', () => {
  it.each([
    [401, /Token refusé/],
    [403, /Accès refusé/],
    [429, /Réessayez dans 30 s/],
  ])(
    'returns a readable error result for HTTP %i and logs only the status',
    async (status, message) => {
      const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { call } = await connect({
        '/api/dashboard/review': jsonError(
          status,
          { message: 'secret 1234,56' },
          { 'retry-after': '30' },
        ),
      })
      const result = await call('month_review')
      expect(result.isError).toBe(true)
      expect(result.text).toMatch(message)
      expect(stderr).toHaveBeenCalledWith(
        `[capi-mcp] month_review: API error ${status}`,
      )
      expect(stderr.mock.calls.flat().join(' ')).not.toContain('1234')
    },
  )
})

describe('spending', () => {
  it('passes the month, average window and account', async () => {
    const data: SpendingByCategoryDto = {
      kind: 'expense',
      month: '2026-11',
      previousMonth: '2026-10',
      period: period(),
      includeOneOffs: false,
      averageMonths: 3,
      averageFrom: '2026-08',
      totalCents: 50000,
      transactionCount: 12,
      previousTotalCents: 45000,
      averageTotalCents: 47000,
      oneOffCents: 0,
      expectedCents: 1500,
      categories: [
        {
          categoryId: groceries.id,
          slug: groceries.slug,
          name: groceries.name,
          color: null,
          icon: null,
          spentCents: 30000,
          share: 0.6,
          transactionCount: 8,
          previousSpentCents: 25000,
          deltaCents: 5000,
          averageCents: 28000,
          notYetThisMonth: false,
          targetCents: 40000,
          expectedCents: 0,
          accountId: null,
          accountType: null,
          inCents: null,
          outCents: null,
        },
      ],
    }
    const { call, calls } = await connect({
      '/api/accounts': accounts,
      '/api/spending/by-category': data,
    })
    const { text } = await call('spending_by_category', {
      month: '2026-11',
      average_months: 3,
      account: 'Compte courant',
    })
    const query = calls.find(
      (c) => c.url.pathname === '/api/spending/by-category',
    )!.url.searchParams
    expect(Object.fromEntries(query)).toEqual({
      month: '2026-11',
      averageMonths: '3',
      accountId: checking.id,
    })
    expect(text).toContain('Mois partiel')
    expect(text).toContain(
      '- Courses : 300,00 € (60 %, 8 op.) · mois précédent 250,00 € (+50,00 €) · moyenne 3 mois 280,00 € · budget 400,00 €',
    )
    expect(text).toContain(
      "encore attendues d'ici la fin du mois (non comptées) : 15,00 €",
    )
  })

  it('renders the history as a table', async () => {
    const data: SpendingTrendDto = {
      kind: 'expense',
      months: ['2026-09', '2026-10'],
      includeOneOffs: false,
      series: [
        {
          key: groceries.id,
          type: 'category',
          categoryId: groceries.id,
          accountId: null,
          slug: groceries.slug,
          name: groceries.name,
          color: null,
          icon: null,
          valuesCents: [10000, 12000],
          totalCents: 22000,
        },
        {
          key: 'other',
          type: 'other',
          categoryId: null,
          accountId: null,
          slug: null,
          name: null,
          color: null,
          icon: null,
          valuesCents: [500, 0],
          totalCents: 500,
        },
      ],
      totalsCents: [10500, 12000],
      averageCents: 10500,
      averageMonths: 1,
      details: [
        {
          month: '2026-09',
          status: 'complete',
          throughDay: null,
          topCategories: [],
        },
        {
          month: '2026-10',
          status: 'partial',
          throughDay: 12,
          topCategories: [],
        },
      ],
      sameDaysAverageCents: 4000,
    }
    const { call } = await connect({ '/api/spending/trend': data })
    const { text } = await call('spending_history', { months: 2 })
    expect(text).toContain('| Catégorie | sept. 2026 | oct. 2026 | Total |')
    expect(text).toContain('| Courses | 100,00 € | 120,00 € | 220,00 € |')
    expect(text).toContain('| Autres | 5,00 € | 0,00 € | 5,00 € |')
    expect(text).toContain('| Total | 105,00 € | 120,00 € | 225,00 € |')
  })
})

describe('budget_status', () => {
  const budget: BudgetMonthDto = {
    month: '2026-11',
    period: period(),
    items: [
      {
        categoryId: restaurants.id,
        slug: restaurants.slug,
        name: restaurants.name,
        color: null,
        icon: null,
        targetCents: 20000,
        effectiveFrom: '2026-01',
        note: null,
        tracked: true,
        spentCents: 25000,
        spentExcludingOneOffsCents: 25000,
        grossSpentCents: 25000,
        envelopePaidCents: 0,
        envelopes: [],
        prepaid: [],
        remainingCents: -5000,
        percentUsed: 125,
        status: 'over',
      },
    ],
    totals: {
      targetCents: 20000,
      spentCents: 25000,
      spentExcludingOneOffsCents: 25000,
      envelopePaidCents: 0,
      remainingCents: -5000,
      percentUsed: 125,
      status: 'over',
      budgetCount: 1,
      overCount: 1,
      warningCount: 0,
    },
    unbudgeted: { totalCents: 0, categoryCount: 0, top: [] },
    income: {
      items: [],
      totals: {
        plannedCents: 0,
        receivedCents: 0,
        unplannedCents: 0,
        lineCount: 0,
      },
    },
    plan: {
      plannedIncomeCents: 0,
      budgetedExpensesCents: 20000,
      toSaveCents: null,
    },
  }
  const envelopes: EnvelopesDto = {
    month: '2026-11',
    current: true,
    today: '2026-11-14',
    dayOfMonth: 14,
    daysInMonth: 30,
    items: [
      {
        categoryId: restaurants.id,
        slug: restaurants.slug,
        name: restaurants.name,
        color: null,
        icon: null,
        targetCents: 20000,
        spentCents: 25000,
        manualCents: 1000,
        envelopePaidCents: 0,
        remainingCents: -5000,
        paceCents: 9333,
        aheadOfPace: true,
        status: 'over',
      },
    ],
  }

  it('adds the tracked envelopes for the current month', async () => {
    const { call } = await connect({
      '/api/budgets': budget,
      '/api/budgets/envelopes': envelopes,
    })
    const { text } = await call('budget_status')
    expect(text).toContain(
      '- Restaurants : 250,00 € sur 200,00 € (125 %), reste -50,00 € — dépassé · suivi pendant le mois',
    )
    expect(text).toContain('Enveloppes suivies au 14/11/2026 (jour 14/30)')
    expect(text).toContain(
      'rythme régulier à ce jour 93,33 € (en avance sur le rythme)',
    )
  })

  it('shows the planned income and what the plan leaves to save (#315)', async () => {
    const { call } = await connect({
      '/api/budgets': {
        ...budget,
        income: {
          items: [
            {
              categoryId: salary.id,
              slug: salary.slug,
              name: salary.name,
              color: null,
              icon: null,
              plannedCents: 210000,
              effectiveFrom: '2026-09',
              note: 'Estimation',
              receivedCents: 0,
              expectedByNowCents: 0,
              expectedOn: '2026-11-27',
              status: 'pending',
            },
          ],
          totals: {
            plannedCents: 210000,
            receivedCents: 0,
            unplannedCents: 1500,
            lineCount: 1,
          },
        },
        plan: {
          plannedIncomeCents: 210000,
          budgetedExpensesCents: 20000,
          toSaveCents: 190000,
        },
      },
      '/api/budgets/envelopes': envelopes,
    })
    const { text } = await call('budget_status')
    expect(text).toContain(
      'Revenus prévus : 2 100,00 €, reçus 0,00 € · hors plan 15,00 €.',
    )
    expect(text).toContain(
      '- Salaire : prévu 2 100,00 € — attendu le 27/11/2026 · note : Estimation',
    )
    expect(text).toContain(
      "À épargner d'après le budget : 2 100,00 € de revenus prévus − 200,00 € de dépenses prévues = 1 900,00 €.",
    )
  })

  it('proposes the income to plan from the confirmed recurring credits', async () => {
    const { call, calls } = await connect({
      '/api/budgets': budget,
      '/api/budgets/envelopes': envelopes,
      '/api/budgets/income-suggestions': {
        month: '2026-11',
        items: [
          {
            categoryId: salary.id,
            slug: salary.slug,
            name: salary.name,
            color: null,
            icon: null,
            suggestedCents: 210000,
            currentPlannedCents: null,
            sources: ['Acme'],
          },
        ],
      },
    })
    const { text } = await call('budget_status')
    expect(text).toContain('Aucun revenu prévu pour ce mois.')
    expect(text).toContain('- Salaire : 2 100,00 € (Acme)')
    expect(
      calls
        .find((c) => c.url.pathname === '/api/budgets/income-suggestions')
        ?.url.searchParams.get('month'),
    ).toBe('2026-11')
  })

  it('leaves the envelopes out for another month', async () => {
    const { call, calls } = await connect({
      '/api/budgets': {
        ...budget,
        month: '2026-09',
        period: period({ month: '2026-09', status: 'complete' }),
      },
      '/api/budgets/envelopes': envelopes,
    })
    const { text } = await call('budget_status', { month: '2026-09' })
    expect(
      calls
        .find((c) => c.url.pathname === '/api/budgets')!
        .url.searchParams.get('month'),
    ).toBe('2026-09')
    expect(text).not.toContain('Enveloppes')
  })
})

describe('subscriptions', () => {
  const item: RecurringItemDto = {
    id: 'r1',
    accountId: checking.id,
    accountName: checking.name,
    merchantKey: 'streamflix',
    searchText: 'STREAMFLIX',
    name: 'Streamflix',
    direction: 'debit',
    status: 'confirmed',
    categoryId: null,
    categorySlug: null,
    categoryName: 'Loisirs',
    categoryColor: null,
    categoryIcon: null,
    isFixedCost: false,
    isSubscription: true,
    cadence: 'monthly',
    detectedCadence: 'monthly',
    cadenceOverridden: false,
    amountType: 'fixed',
    typicalAmountCents: 1399,
    latestAmountCents: 1399,
    minAmountCents: 1199,
    maxAmountCents: 1399,
    yearlyCostCents: 16788,
    monthlyEquivalentCents: 1399,
    previousAmountCents: 1199,
    priceChangeCents: 200,
    priceChangedOn: '2026-10-05',
    confidence: 0.9,
    active: true,
    firstSeenDate: '2025-01-05',
    lastSeenDate: '2026-11-05',
    nextExpectedDate: '2026-12-05',
    occurrenceCount: 23,
    occurrences: [],
    amountRuns: [],
    notes: null,
    endedOn: null,
    ended: false,
    chargedAfterEnd: null,
    termMonths: null,
    renewalDate: null,
    renewalReminder: false,
    share: null,
    ownMonthlyEquivalentCents: 1399,
    ownYearlyCostCents: 16788,
  }
  const total = { monthlyCents: 1399, yearlyCents: 16788, count: 1 }
  const summaryDto: RecurringSummaryDto = {
    debits: {
      ...total,
      fixed: total,
      variable: { monthlyCents: 0, yearlyCents: 0, count: 0 },
      subscriptions: total,
    },
    credits: { monthlyCents: 0, yearlyCents: 0, count: 0 },
    suggestedCount: 1,
    inactiveCount: 0,
    endedCount: 1,
  }

  it('lists upcoming debits within the window from today in Paris', async () => {
    const { call } = await connect({
      '/api/recurring/summary': summaryDto,
      '/api/recurring': [
        item,
        {
          ...item,
          id: 'r2',
          name: 'Salle de sport',
          nextExpectedDate: '2027-01-20',
          status: 'suggested',
        },
        { ...item, id: 'r3', name: 'Ancien abonnement', status: 'dismissed' },
      ],
    })
    const { text } = await call('subscriptions', { upcoming_days: 30 })
    expect(text).toContain('Prélèvements attendus du 14/11/2026 au 14/12/2026')
    expect(text).toContain(
      '- 05/12/2026 · Streamflix · 13,99 € · Compte courant',
    )
    expect(text).not.toMatch(/- 20\/01\/2027/)
    expect(text).toContain('Salle de sport')
    expect(text).toContain('[détecté, non confirmé]')
    expect(text).not.toContain('Ancien abonnement')
    expect(text).toContain('[prix +2,00 € le 05/10/2026]')
  })

  it('lists cancelled subscriptions apart, with their end date', async () => {
    const { call } = await connect({
      '/api/recurring/summary': summaryDto,
      '/api/recurring': [
        // Cancelled from after its next charge: still upcoming.
        { ...item, endedOn: '2026-12-06' },
        {
          ...item,
          id: 'r2',
          name: 'Vidéo résiliée',
          nextExpectedDate: '2026-11-20',
          endedOn: '2026-11-01',
          ended: true,
          chargedAfterEnd: '2026-11-05',
        },
      ],
    })
    const { text } = await call('subscriptions', { upcoming_days: 30 })
    expect(text).toContain(
      '- 05/12/2026 · Streamflix · 13,99 € · Compte courant',
    )
    expect(text).toContain(
      '[résilié, plus de prélèvement à partir du 06/12/2026]',
    )
    expect(text).not.toMatch(/- 20\/11\/2026 · Vidéo résiliée/)
    expect(text).toContain('Abonnements résiliés (hors totaux) :')
    expect(text).toContain(
      '- Vidéo résiliée : résilié, fin le 01/11/2026 · dernier prélèvement 05/11/2026 · 167,88 € / an avant la fin · prélevé après la résiliation le 05/11/2026, à vérifier',
    )
  })
  it('shows a prepaid plan’s term, monthly equivalent and renewal (#314)', async () => {
    const { call } = await connect({
      '/api/recurring/summary': summaryDto,
      '/api/recurring': [
        {
          ...item,
          id: 'r4',
          name: 'Hébergeur VPS',
          cadence: 'yearly',
          typicalAmountCents: 18000,
          monthlyEquivalentCents: 750,
          yearlyCostCents: 9000,
          priceChangeCents: null,
          priceChangedOn: null,
          nextExpectedDate: '2026-12-07',
          termMonths: 24,
          renewalDate: '2026-12-07',
          renewalReminder: true,
        },
      ],
    })
    const { text } = await call('subscriptions', { upcoming_days: 30 })
    expect(text).toContain(
      '- Hébergeur VPS : 180,00 € (prépayé pour 24 mois, abonnement) · 7,50 € / mois, 90,00 € / an · renouvellement le 07/12/2026',
    )
    expect(text).toContain('[renouvellement à décider')
    expect(text).toContain(
      '- 07/12/2026 · Hébergeur VPS · 180,00 € (renouvellement pour 24 mois) · Compte courant',
    )
  })
})

describe('month_end_forecast', () => {
  it('converts the threshold to cents and accounts to ids', async () => {
    const forecast: ForecastDto = {
      today: '2026-11-14',
      monthEnd: '2026-11-30',
      accounts: [
        {
          id: checking.id,
          name: checking.name,
          type: 'checking',
          balanceCents: 123456,
          balanceDate: '2026-11-10',
        },
      ],
      startingBalanceCents: 123456,
      startingBalanceDate: '2026-11-10',
      knownUntil: '2026-11-10',
      projectedFrom: '2026-11-11',
      stale: false,
      staleAfterDays: 7,
      thresholdCents: 50000,
      recurringItemCount: 3,
      items: [],
      expectedDebitsCents: -60000,
      expectedCreditsCents: 0,
      estimate: null,
      points: [],
      endBalanceCents: 63456,
      lowest: { date: '2026-11-30', balanceCents: 63456 },
      belowThreshold: null,
    }
    const { call, calls } = await connect({
      '/api/accounts': accounts,
      '/api/forecast': forecast,
    })
    const { text } = await call('month_end_forecast', {
      accounts: ['Compte courant'],
      low_balance_threshold_euros: 500,
      include_variable: false,
    })
    const query = calls.find((c) => c.url.pathname === '/api/forecast')!.url
      .searchParams
    expect(Object.fromEntries(query)).toEqual({
      accountIds: checking.id,
      threshold: '50000',
      includeVariable: 'false',
    })
    expect(text).toContain('Solde projeté en fin de mois : 634,56 €.')
    expect(text).toContain('Ne passe pas sous 500,00 €.')
    expect(text).toContain(
      "Relevés importés jusqu'au 10/11/2026 : prévision à partir du 11/11/2026.",
    )
    expect(text).not.toContain('indicative')
  })

  it('says when the forecast is only indicative', async () => {
    const forecast: ForecastDto = {
      today: '2026-11-16',
      monthEnd: '2026-11-30',
      accounts: [],
      startingBalanceCents: 10000,
      startingBalanceDate: '2026-10-31',
      knownUntil: '2026-10-31',
      projectedFrom: '2026-11-01',
      stale: true,
      staleAfterDays: 7,
      thresholdCents: 0,
      recurringItemCount: 0,
      items: [],
      expectedDebitsCents: 0,
      expectedCreditsCents: 0,
      estimate: {
        dailyCents: 1000,
        days: 30,
        coveredCents: 2500,
        totalCents: -27500,
        basedOnFrom: '2026-08-01',
        basedOnTo: '2026-10-31',
      },
      points: [],
      endBalanceCents: -17500,
      lowest: { date: '2026-11-30', balanceCents: -17500 },
      belowThreshold: null,
    }
    const { call } = await connect({ '/api/forecast': forecast })
    const { text } = await call('month_end_forecast', {})
    expect(text).toContain(
      "Relevés importés jusqu'au 31/10/2026 : prévision à partir du 01/11/2026.",
    )
    expect(text).toContain('Prévision indicative')
    expect(text).toContain('Seuil de 0,00 € non vérifié')
    expect(text).toContain('25,00 € de dépenses notées à la main')
  })

  it('refuses an investment account', async () => {
    const { call, calls } = await connect({ '/api/accounts': accounts })
    const result = await call('month_end_forecast', { accounts: ['PEA'] })
    expect(result.isError).toBe(true)
    expect(calls.some((c) => c.url.pathname === '/api/forecast')).toBe(false)
  })
})

describe('month_review', () => {
  it('summarizes the review of the previous month', async () => {
    const review: MonthReviewDto = {
      month: '2026-10',
      defaultMonth: '2026-11',
      current: false,
      nextMonth: '2026-11',
      period: period({
        month: '2026-10',
        status: 'complete',
        throughDay: null,
        dataUntil: '2026-11-10',
      }),
      closed: false,
      closedAt: null,
      nextMonthBudgeted: true,
      netWorth: {
        date: '2026-10-31',
        endCents: 1200000,
        previousDate: '2026-09-30',
        previousEndCents: 1100000,
        changeCents: 100000,
        savedCents: 70000,
        otherCents: 30000,
      },
      flow: flow(),
      budget: {
        budgetCount: 2,
        targetCents: 60000,
        spentCents: 65000,
        remainingCents: -5000,
        unbudgetedCents: 1000,
        over: [
          {
            categoryId: restaurants.id,
            slug: restaurants.slug,
            name: restaurants.name,
            color: null,
            icon: null,
            targetCents: 20000,
            spentCents: 30000,
            gapCents: 10000,
          },
        ],
        under: [],
      },
      missing: [
        {
          id: pea.id,
          name: pea.name,
          type: 'brokerage',
          group: 'investments',
          lastDate: '2026-09-30',
        },
      ],
    }
    const { call, calls } = await connect({ '/api/dashboard/review': review })
    const { text } = await call('month_review')
    // The previous month is named: the API's default may be the current one.
    expect(
      calls
        .find((c) => c.url.pathname === '/api/dashboard/review')
        ?.url.searchParams.get('month'),
    ).toBe('2026-10')
    expect(text).toContain(
      'Bilan de octobre 2026 : des données manquent encore.',
    )
    expect(text).toContain("- PEA (PEA) : données jusqu'au 30/09/2026")
    expect(text).toContain(
      'Variation : +1 000,00 €, dont épargné +700,00 € et reste (marchés, mises à jour de valeur) +300,00 €.',
    )
    expect(text).toContain("taux d'épargne 28 %")
    expect(text).toContain('- Restaurants : 300,00 € pour 200,00 € (+100,00 €)')
  })
})

/** A synthetic exchange withdrawal for the movements listing. */
function crypto(
  id: string,
  to: { name: string } | null,
  amountCents: number | null,
) {
  return {
    id,
    source: 'crypto',
    date: '2026-10-20',
    from: { id: 'ex', name: 'Plateforme', type: 'crypto' },
    to: to && { id: 'led', type: 'crypto', ...to },
    amountCents,
    asset: 'BTC',
    quantity: '0.01',
    cryptoKind: 'withdrawal',
    linkable: true,
  }
}

describe('savings_and_goals', () => {
  it('shows each distinct average window once and the envelopes', async () => {
    const window = {
      months: 3,
      monthCount: 3,
      from: '2026-08',
      to: '2026-10',
      incomeCents: 250000,
      expenseCents: -180000,
      netCents: 70000,
      netExcludingOneOffsCents: 70000,
      movedCents: 50000,
      savingsRate: 0.28,
    }
    const overview: SavingsOverviewDto = {
      currentMonth: '2026-11',
      period: period(),
      current: flow({ month: '2026-11' }),
      previous: flow(),
      moved: {
        toSavingsCents: 40000,
        toInvestmentsCents: 50000,
        totalCents: 90000,
      },
      monthlyTargetCents: 60000,
      months: [],
      averages: [window, { ...window, months: 6 }, { ...window, months: 12 }],
      projectionAverageCents: 70000,
      stock: {
        totalCents: 500000,
        gainCents: null,
        cash: {
          totalCents: 500000,
          accounts: [{ ...livret, balanceCents: null, balanceDate: null }],
        },
        investments: {
          totals: {
            valueCents: 0,
            contributionsCents: null,
            gainCents: null,
            returnRate: null,
            withoutContributionsCount: 0,
            withoutValueCount: 0,
            staleCount: 0,
          },
          accounts: [],
        },
      },
    }
    const { call } = await connect({
      '/api/savings/overview': overview,
      '/api/envelopes': [
        {
          id: 'e1',
          name: 'Lisbonne',
          icon: 'plane',
          color: null,
          targetCents: 80000,
          dueDate: '2027-06-30',
          archived: false,
          categoryIds: [],
          totalCents: 40000,
          paidCents: 8500,
          putAsideCents: 48500,
          accounts: [
            { accountId: 'l', accountName: 'Livret test', amountCents: 30000 },
            { accountId: 'c', accountName: 'Courant test', amountCents: 10000 },
          ],
          plan: {
            remainingCents: 40000,
            progressRatio: 0.5,
            reached: false,
            monthsLeft: 8,
            targetDatePassed: false,
            requiredMonthlyCents: 5000,
          },
        },
      ],
      '/api/investments/movements': {
        from: '2025-12-01',
        to: '2026-11-05',
        items: [
          crypto('m1', { name: 'Ledger' }, 50000),
          crypto('m2', { name: 'Ledger' }, 30000),
          crypto('m3', null, null),
        ],
      },
      '/api/investments/flows': {
        from: '2025-12-01',
        to: '2026-11-05',
        depositsCents: 90000,
        withdrawalsCents: 10000,
        netCents: 80000,
        accounts: [
          {
            accountId: 'pea',
            name: 'PEA test',
            type: 'brokerage',
            depositsCents: 90000,
            withdrawalsCents: 10000,
            netCents: 80000,
            count: 3,
          },
        ],
        months: [
          {
            month: '2026-10',
            netCents: 80000,
            accounts: [{ accountId: 'pea', netCents: 80000 }],
          },
        ],
      },
    })
    const { text } = await call('savings_and_goals')
    // Envelopes (#429), read only.
    expect(text).toContain(
      'Enveloppes (argent mis de côté, déjà compté dans les soldes) : 400,00 €.',
    )
    expect(text).toContain(
      '- Lisbonne : 400,00 € sur 800,00 € (50 %) · Livret test 300,00 €, Courant test 100,00 € · a payé 85,00 € · pour le 30/06/2027 · 50,00 € par mois pendant 8 mois',
    )
    // The app's words (#407): Épargné, Mis de côté, Livrets et placements, Cible.
    expect(text).toContain(
      'Mis de côté en novembre 2026 : +900,00 € (livrets +400,00 €, placements +500,00 €).',
    )
    expect(text).toContain('Cible : 600,00 € par mois')
    expect(text).toContain('Livrets et placements : 5 000,00 €.')
    expect(text).toContain(
      '- Plateforme → Ledger : 2 mouvement(s), coût 800,00 €',
    )
    expect(text).toContain('- 1 retrait(s) ou dépôt(s) sans compte lié')
    expect(text).toContain(
      "Où est allé l'argent investi du 01/12/2025 au 05/11/2026 : +800,00 € nets (mis de côté 900,00 €, retiré 100,00 €).",
    )
    expect(text).toContain(
      '- PEA test (PEA) : +800,00 € en 3 virement(s), dont 100,00 € retirés',
    )
    expect(text.match(/- 3 mois \(août 2026 à oct\. 2026\)/g)).toHaveLength(1)
    expect(text).toContain('- Livret A : solde inconnu')
    // Savings goals became envelopes (#430).
    expect(text).not.toContain('Objectifs')
  })
})

describe('transactionLine', () => {
  it('shows the account a transfer goes to or comes from (#296)', () => {
    const transfer = {
      ...transaction,
      kind: 'transfer' as const,
      counterpartAccountId: 'pea',
      counterpartAccountName: 'PEA test',
    }
    expect(transactionLine(transfer)).toContain('Compte courant → PEA test')
    expect(transactionLine({ ...transfer, amountCents: 5000 })).toContain(
      '← PEA test',
    )
  })
})
