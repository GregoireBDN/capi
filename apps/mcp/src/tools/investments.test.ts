// Investment tools (#104): values extracted by Claude from the owner's
// documents, written through previews; a second identical run writes nothing.
// Synthetic accounts, dates, amounts and quantities only.
import { describe, expect, it } from 'vitest'
import type {
  AccountDto,
  AccountHoldingsDto,
  BulkSnapshotsDto,
  CryptoAssetDto,
  InvestedBasePreviewDto,
  InvestedFiguresDto,
  InvestmentsSummaryDto,
  SetInvestedBaseDto,
  SaveHoldingDto,
  SnapshotDto,
  ValuedHoldingDto,
} from '../api/types.js'
import { checking, livret, pea } from '../test/fixtures.js'
import { connect, jsonError } from '../test/mock-api.js'

const lifeInsurance: AccountDto = {
  ...pea,
  id: '00000000-0000-4000-8000-000000000004',
  name: 'Assurance vie Test',
  type: 'life_insurance',
  institution: 'Assureur Test',
}
const cryptoWallet: AccountDto = {
  ...pea,
  id: '00000000-0000-4000-8000-000000000005',
  name: 'Crypto Test',
  type: 'crypto',
  institution: null,
  cryptoSource: 'manual',
}
const archivedPee: AccountDto = {
  ...pea,
  id: '00000000-0000-4000-8000-000000000006',
  name: 'PEE Ancien',
  type: 'employee_savings',
  archivedAt: '2026-01-01T00:00:00.000Z',
}
const binance: AccountDto = {
  ...cryptoWallet,
  id: '00000000-0000-4000-8000-000000000007',
  name: 'Plateforme Test',
  cryptoSource: 'exchange',
  cryptoProvider: 'binance',
}
const ledger: AccountDto = {
  ...cryptoWallet,
  id: '00000000-0000-4000-8000-000000000008',
  name: 'Portefeuille Test',
  cryptoSource: 'wallet',
}
const accounts = [
  checking,
  livret,
  pea,
  lifeInsurance,
  cryptoWallet,
  archivedPee,
  binance,
  ledger,
]

function snapshot(
  date: string,
  valueCents: number,
  contributionsCents: number | null = null,
): SnapshotDto {
  return {
    id: `00000000-0000-4000-8000-${date.replace(/-/g, '').padStart(12, '0')}`,
    date,
    valueCents,
    contributionsCents,
    note: null,
  }
}

/** Snapshots of the PEA, updated by the bulk route like the API does. */
function snapshotRoutes(initial: SnapshotDto[]) {
  const rows = [...initial]
  return {
    rows,
    routes: {
      '/api/accounts': accounts,
      [`GET /api/accounts/${pea.id}/snapshots`]: () =>
        [...rows].sort((a, b) => a.date.localeCompare(b.date)),
      [`POST /api/accounts/${pea.id}/snapshots/bulk`]: (
        _url: URL,
        body: unknown,
      ) => {
        let created = 0
        let updated = 0
        for (const row of (body as BulkSnapshotsDto).rows) {
          const current = rows.find((r) => r.date === row.date)
          if (current) {
            updated++
            current.valueCents = row.valueCents
            if (
              row.contributionsCents !== undefined &&
              row.contributionsCents !== null
            ) {
              current.contributionsCents = row.contributionsCents
            }
          } else {
            created++
            rows.push(
              snapshot(
                row.date,
                row.valueCents,
                row.contributionsCents ?? null,
              ),
            )
          }
        }
        return { created, updated }
      },
    },
  }
}

describe('list_investment_accounts', () => {
  it('lists investment accounts with their last value and the stale ones', async () => {
    const summary: InvestmentsSummaryDto = {
      totals: {
        valueCents: 2500000,
        contributionsCents: 2000000,
        gainCents: 500000,
        returnRate: 0.25,
        withoutContributionsCount: 0,
        withoutValueCount: 1,
        staleCount: 1,
      },
      accounts: [
        {
          id: pea.id,
          name: pea.name,
          type: 'brokerage',
          institution: 'Banque Test',
          valueCents: 2500000,
          valueDate: '2026-09-30',
          contributionsCents: 2000000,
          contributionsDate: '2026-09-30',
          contributionsSource: 'typed',
          typedContributionsCents: null,
          linkedTransfersCount: 0,
          unknownCostCount: 0,
          linkedAfterValueCents: 0,
          gainCents: 500000,
          returnRate: 0.25,
          daysSinceLatest: 45,
          staleAfterDays: 31,
          stale: true,
        },
        {
          id: cryptoWallet.id,
          name: cryptoWallet.name,
          type: 'crypto',
          institution: null,
          valueCents: null,
          valueDate: null,
          contributionsCents: null,
          contributionsDate: null,
          contributionsSource: null,
          typedContributionsCents: null,
          linkedTransfersCount: 0,
          unknownCostCount: 0,
          linkedAfterValueCents: 0,
          gainCents: null,
          returnRate: null,
          daysSinceLatest: null,
          staleAfterDays: 35,
          stale: false,
        },
        {
          id: ledger.id,
          name: ledger.name,
          type: 'crypto',
          institution: null,
          valueCents: 300000,
          valueDate: '2026-11-14',
          contributionsCents: 500000,
          contributionsDate: '2026-11-14',
          contributionsSource: 'base',
          typedContributionsCents: null,
          linkedTransfersCount: 0,
          unknownCostCount: 1,
          linkedAfterValueCents: 0,
          gainCents: -200000,
          returnRate: -0.4,
          daysSinceLatest: 0,
          staleAfterDays: 35,
          stale: false,
        },
      ],
    }
    const { call } = await connect({
      '/api/investments/summary': summary,
      '/api/accounts': accounts,
    })
    const { text, isError } = await call('list_investment_accounts')
    expect(isError).toBe(false)
    expect(text).toContain('Placements : 25 000,00 € au total')
    expect(text).toContain(
      '- PEA (PEA / compte-titres, Banque Test) : dernière valeur 25 000,00 € au 30/09/2026 (il y a 45 j), investi 20 000,00 €, résultat +5 000,00 € (25 %) — PAS À JOUR',
    )
    // Crypto too (#358): invested, gain, rate and the coins of unknown cost.
    expect(text).toContain(
      '- Portefeuille Test (crypto, portefeuille synchronisé) : dernière valeur 3 000,00 € au 14/11/2026 (il y a 0 j), investi 5 000,00 €, résultat -2 000,00 € (-40 %), dont 1 envoi(s) sans coût connu non compté(s)',
    )
    expect(text).toContain(
      '- Crypto Test (crypto, saisie manuelle) : aucune valeur enregistrée',
    )
    expect(text).toContain('À mettre à jour : PEA, Crypto Test.')
    expect(text).toContain('Archivés (non modifiables) : PEE Ancien.')
  })
})

describe('set_invested_amount', () => {
  /** The API's invested base of the wallet, set by the PUT like the API. */
  function investedRoutes() {
    const state: { base: SetInvestedBaseDto | null } = { base: null }
    const figures = (base: SetInvestedBaseDto | null): InvestedFiguresDto => ({
      investedBase: base,
      valueCents: 300000,
      valueDate: '2026-11-14',
      contributionsCents: base ? base.amountCents + 40000 : 40000,
      contributionsSource: base ? 'base' : 'links',
      gainCents: 300000 - (base ? base.amountCents + 40000 : 40000),
      returnRate: base
        ? (300000 - base.amountCents - 40000) / (base.amountCents + 40000)
        : 6.5,
      linkedTransfersCount: 1,
      unknownCostCount: 1,
    })
    return {
      state,
      routes: {
        '/api/accounts': accounts,
        [`POST /api/accounts/${ledger.id}/invested-base/preview`]: (
          _url: URL,
          body: unknown,
        ): InvestedBasePreviewDto => ({
          current: figures(state.base),
          next: figures(body as SetInvestedBaseDto),
        }),
        [`PUT /api/accounts/${ledger.id}/invested-base`]: (
          _url: URL,
          body: unknown,
        ) => {
          state.base = body as SetInvestedBaseDto
          return figures(state.base)
        },
      },
    }
  }
  const args = {
    account: 'portefeuille test',
    amount: '4 600',
    until: '2026-06-30',
  }

  it('previews the invested amount, gain and rate without writing', async () => {
    const { routes, state } = investedRoutes()
    const { call, writes } = await connect(routes)
    const { text, isError } = await call('set_invested_amount', args)
    expect(isError).toBe(false)
    expect(text).toContain('APERÇU')
    expect(text).toContain(
      'Montant investi de base : aucun → 4 600,00 € au 30/06/2026.',
    )
    expect(text).toContain('Avant : investi 400,00 €, résultat +2 600,00 €')
    expect(text).toContain(
      'Après : investi 5 000,00 €, résultat -2 000,00 € (-40 %).',
    )
    expect(text).toContain('Dont 1 envoi(s) sans coût connu')
    expect(writes()).toHaveLength(0)
    expect(state.base).toBeNull()
  })

  it('saves it with confirm, then a repeated call changes nothing', async () => {
    const { routes, state } = investedRoutes()
    const { call, writes } = await connect(routes)
    const saved = await call('set_invested_amount', { ...args, confirm: true })
    expect(saved.isError).toBe(false)
    expect(saved.text).toContain(
      'Portefeuille Test : montant investi enregistré, investi 5 000,00 €, résultat -2 000,00 € (-40 %).',
    )
    expect(saved.text).toContain("dans l'application")
    expect(state.base).toEqual({ amountCents: 460000, on: '2026-06-30' })
    expect(writes()).toHaveLength(1)

    const again = await call('set_invested_amount', { ...args, confirm: true })
    expect(again.text).toContain('Rien à modifier')
    expect(writes()).toHaveLength(1)
  })

  it('sets the invested amount of a PEA too (#360)', async () => {
    const { call, writes } = await connect({
      '/api/accounts': accounts,
      [`POST /api/accounts/${pea.id}/invested-base/preview`]: (
        _url: URL,
        body: unknown,
      ): InvestedBasePreviewDto => ({
        current: {
          investedBase: null,
          valueCents: 2_500_000,
          valueDate: '2026-09-30',
          contributionsCents: 2_000_000,
          contributionsSource: 'typed',
          gainCents: 500_000,
          returnRate: 0.25,
          linkedTransfersCount: 0,
          unknownCostCount: 0,
        },
        next: {
          investedBase: body as SetInvestedBaseDto,
          valueCents: 2_500_000,
          valueDate: '2026-09-30',
          contributionsCents: 2_060_000,
          contributionsSource: 'base',
          gainCents: 440_000,
          returnRate: 0.2136,
          linkedTransfersCount: 2,
          unknownCostCount: 0,
        },
      }),
    })
    const { text, isError } = await call('set_invested_amount', {
      account: 'pea',
      amount: '20 000',
      until: '2026-06-30',
    })
    expect(isError).toBe(false)
    expect(text).toContain('Après : investi 20 600,00 €, résultat +4 400,00 €')
    expect(text).toContain(
      "S'y ajoutent 2 virement(s) lié(s) depuis le 30/06/2026.",
    )
    expect(writes()).toHaveLength(0)
  })

  it('refuses an exchange, negative amounts and future days', async () => {
    const { routes } = investedRoutes()
    const { call, writes } = await connect(routes)
    for (const [input, message] of [
      [{ ...args, account: 'plateforme test' }, 'elle garde le coût'],
      [{ ...args, amount: '-10' }, 'invalide'],
      [{ ...args, until: '2026-11-15' }, 'dans le futur'],
    ] as const) {
      const result = await call('set_invested_amount', input)
      expect(result.isError).toBe(true)
      expect(result.text).toContain(message)
    }
    expect(writes()).toHaveLength(0)
  })
})

describe('add_investment_snapshots', () => {
  const args = {
    account: 'pea',
    snapshots: [
      { date: '2026-10-31', value: '26 000,50', contributions: '20 500' },
      { date: '2026-09-30', value: '25 000' },
    ],
  }

  it('previews new / replaced / unchanged days and the net-worth effect without writing', async () => {
    const { routes } = snapshotRoutes([
      snapshot('2026-08-31', 2400000, 2000000),
      snapshot('2026-09-30', 2500000, 2000000),
    ])
    const { call, writes } = await connect(routes)
    const { text, isError } = await call('add_investment_snapshots', {
      ...args,
      snapshots: [
        ...args.snapshots,
        { date: '2026-08-31', value: '23 999,99' },
      ],
    })
    expect(isError).toBe(false)
    expect(text).toContain('APERÇU')
    expect(text).toContain('Nouvelles valeurs (1) :')
    expect(text).toContain(
      '- 31/10/2026 : nouvelle valeur 26 000,50 € (investi 20 500,00 €)',
    )
    expect(text).toContain('Valeurs remplacées (1) :')
    expect(text).toContain('- 31/08/2026 : 24 000,00 € → 23 999,99 €')
    expect(text).toContain(
      "Déjà enregistrés à l'identique, rien à faire : 1 jour(s).",
    )
    expect(text).toContain(
      'Valeur actuelle de PEA : 25 000,00 € au 30/09/2026 → 26 000,50 € au 31/10/2026, soit +1 000,50 € sur le patrimoine net.',
    )
    expect(writes()).toHaveLength(0)
  })

  it('writes only the days that differ, in cents, and a second run writes nothing', async () => {
    const { routes, rows } = snapshotRoutes([snapshot('2026-09-30', 2500000)])
    const { call, writes } = await connect(routes)
    const first = await call('add_investment_snapshots', {
      ...args,
      confirm: true,
    })
    expect(first.isError).toBe(false)
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.body).toEqual({
      rows: [
        {
          date: '2026-10-31',
          valueCents: 2600050,
          contributionsCents: 2050000,
        },
      ],
    })
    expect(first.text).toContain('1 valeur(s) ajoutée(s), 0 remplacée(s)')
    expect(first.text).toContain('aucun outil MCP ne supprime')
    expect(rows).toHaveLength(2)

    const second = await call('add_investment_snapshots', {
      ...args,
      confirm: true,
    })
    expect(second.isError).toBe(false)
    expect(second.text).toContain('Rien à modifier')
    expect(writes()).toHaveLength(1)
  })

  it('gives the previous values back to undo a replacement', async () => {
    const { routes } = snapshotRoutes([
      snapshot('2026-09-30', 2500000, 2000000),
    ])
    const { call } = await connect(routes)
    const { text } = await call('add_investment_snapshots', {
      account: 'PEA',
      snapshots: [{ date: '2026-09-30', value: '25100' }],
      confirm: true,
    })
    expect(text).toContain(
      'snapshots [{"date":"2026-09-30","value":"25000,00","contributions":"20000,00"}], confirm: true',
    )
  })

  it.each([
    [{ date: '2026-11-15', value: '1' }, 'dans le futur'],
    [{ date: '2026-10-31', value: '-5' }, 'Valeur « -5 » invalide'],
    [{ date: '2026-10-31', value: '12.345' }, 'invalide'],
    [{ date: '2026-10-31', value: '1e5' }, 'invalide'],
  ])('refuses %o before writing', async (row, message) => {
    const { routes } = snapshotRoutes([])
    const { call, writes } = await connect(routes)
    const { text, isError } = await call('add_investment_snapshots', {
      account: 'PEA',
      snapshots: [row],
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain(message)
    expect(writes()).toHaveLength(0)
  })

  it('refuses a day given twice, an archived or a cash account', async () => {
    const { routes } = snapshotRoutes([])
    const { call, writes } = await connect(routes)
    const twice = await call('add_investment_snapshots', {
      account: 'PEA',
      snapshots: [
        { date: '2026-10-31', value: '1' },
        { date: '2026-10-31', value: '2' },
      ],
    })
    expect(twice.text).toContain('apparaît deux fois')
    const archived = await call('add_investment_snapshots', {
      account: 'PEE Ancien',
      snapshots: [{ date: '2026-10-31', value: '1' }],
    })
    expect(archived.text).toContain('archivé')
    const cash = await call('add_investment_snapshots', {
      account: 'Livret A',
      snapshots: [{ date: '2026-10-31', value: '1' }],
    })
    expect(cash.isError).toBe(true)
    expect(cash.text).toContain('introuvable')
    expect(writes()).toHaveLength(0)
  })

  it('explains a read-only token', async () => {
    const { routes } = snapshotRoutes([])
    const { call } = await connect({
      ...routes,
      [`POST /api/accounts/${pea.id}/snapshots/bulk`]: jsonError(403),
    })
    const { text, isError } = await call('add_investment_snapshots', {
      ...args,
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toMatch(/lecture seule.*Rien n'a été modifié/s)
  })
})

describe('sync_crypto_holdings', () => {
  const path = `/api/accounts/${cryptoWallet.id}/holdings`
  let nextId = 0

  function holding(overrides: Partial<ValuedHoldingDto>): ValuedHoldingDto {
    nextId++
    return {
      id: `00000000-0000-4000-8000-0000000001${String(nextId).padStart(2, '0')}`,
      accountId: cryptoWallet.id,
      assetId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      quantity: '0.500000000000000000',
      location: 'Ledger',
      investedCents: 1000000,
      note: null,
      origin: 'manual',
      priceEur: '50000',
      priceSource: 'provider',
      priceFetchedAt: null,
      priceStale: false,
      priceChange24hPercent: null,
      valueCents: null,
      gainCents: null,
      ...overrides,
    }
  }

  const assets: CryptoAssetDto[] = [
    { id: 'ethereum', symbol: 'eth', name: 'Ethereum', rank: 2 },
    { id: 'eth-copy', symbol: 'eth', name: 'Copie Test', rank: null },
    { id: 'solana', symbol: 'sol', name: 'Solana', rank: 5 },
  ]

  /** Holdings of the crypto account, changed by POST / PUT like the API. */
  function holdingRoutes(initial: ValuedHoldingDto[]) {
    const lines = [...initial]
    const state = (): AccountHoldingsDto => ({
      accountId: cryptoWallet.id,
      holdings: lines,
      totals: {
        // Synthetic: 1 € per whole unit, just to see the total move.
        valueCents: lines.reduce(
          (sum, h) => sum + Math.trunc(Number(h.quantity.split('.')[0])) * 100,
          0,
        ),
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
    })
    return {
      lines,
      routes: {
        '/api/accounts': accounts,
        '/api/crypto/assets': (url: URL) => {
          const q = url.searchParams.get('q')?.toLowerCase() ?? ''
          return assets.filter((a) => a.symbol === q || a.id.includes(q))
        },
        [`GET ${path}`]: state,
        [`POST ${path}`]: (_url: URL, body: unknown) => {
          const dto = body as SaveHoldingDto
          const line = holding({
            ...dto,
            location: dto.location ?? '',
            investedCents: dto.investedCents ?? null,
            note: dto.note ?? null,
          })
          lines.push(line)
          return line
        },
        ...Object.fromEntries(
          lines.map((line) => [
            `PUT ${path}/${line.id}`,
            (_url: URL, body: unknown) => {
              Object.assign(line, body as SaveHoldingDto)
              return line
            },
          ]),
        ),
      },
    }
  }

  it('previews added, changed, zeroed and untouched lines without writing', async () => {
    const btc = holding({ quantity: '0.500000000000000000' })
    const ada = holding({
      assetId: 'cardano',
      symbol: 'ADA',
      name: 'Cardano',
      quantity: '100',
    })
    const other = holding({
      assetId: 'solana',
      symbol: 'SOL',
      location: 'Autre',
      quantity: '3',
    })
    const imported = holding({
      assetId: 'tether',
      symbol: 'USDT',
      name: 'Tether',
      origin: 'import',
    })
    const { routes } = holdingRoutes([btc, ada, other, imported])
    const { call, writes } = await connect(routes)
    const { text, isError } = await call('sync_crypto_holdings', {
      account: 'crypto',
      location: 'ledger',
      holdings: [
        { asset: 'BTC', quantity: '0,75', invested: '12 000' },
        { asset: 'ETH', quantity: '1.123456789012345678' },
      ],
    })
    expect(isError).toBe(false)
    expect(text).toContain('APERÇU')
    expect(text).toContain(
      'Ajoutés (1) :\n- eth (Ethereum) : 1,123456789012345678, investi inconnu',
    )
    expect(text).toContain(
      'Modifiés (1) :\n- BTC : 0,5 → 0,75, investi 10 000,00 € → 12 000,00 €',
    )
    expect(text).toContain(
      "Mis à 0 (1) :\n- ADA : 100 → 0 (absent de l'export : la ligne reste, à 0, jusqu'à ce que le propriétaire la supprime dans l'application)",
    )
    expect(text).toContain('jamais modifiées par cet outil : USDT')
    expect(text).not.toContain('SOL')
    expect(writes()).toHaveLength(0)
  })

  it('applies exact decimal strings once, then a second run writes nothing', async () => {
    const btc = holding({
      quantity: '0.500000000000000000',
      note: 'clé froide',
    })
    const ada = holding({
      assetId: 'cardano',
      symbol: 'ADA',
      name: 'Cardano',
      quantity: '100',
    })
    const { routes, lines } = holdingRoutes([btc, ada])
    const { call, writes } = await connect(routes)
    const args = {
      account: 'Crypto Test',
      location: 'Ledger',
      holdings: [
        { asset: 'bitcoin', quantity: '0.75' },
        { asset: 'eth', quantity: '1.123456789012345678', invested: '1500' },
      ],
      confirm: true,
    }
    const first = await call('sync_crypto_holdings', args)
    expect(first.isError).toBe(false)
    expect(writes().map((w) => `${w.method} ${w.url.pathname}`)).toEqual([
      `PUT ${path}/${btc.id}`,
      `POST ${path}`,
      `PUT ${path}/${ada.id}`,
    ])
    const bodies = writes().map((w) => w.body as SaveHoldingDto)
    expect(bodies).toContainEqual({
      assetId: 'ethereum',
      symbol: 'eth',
      name: 'Ethereum',
      quantity: '1.123456789012345678',
      location: 'Ledger',
      investedCents: 150000,
      note: null,
    })
    expect(bodies).toContainEqual({
      assetId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      quantity: '0.75',
      location: 'Ledger',
      investedCents: 1000000,
      note: 'clé froide',
    })
    expect(bodies).toContainEqual(
      expect.objectContaining({
        assetId: 'cardano',
        quantity: '0',
        investedCents: 0,
      }),
    )
    for (const body of bodies) expect(typeof body.quantity).toBe('string')
    expect(first.text).toContain('3 ligne(s) mise(s) à jour')
    expect(first.text).toContain(
      "À supprimer dans l'application (compte Crypto Test, avoirs) si ces actifs ne reviendront pas : ADA, maintenant à 0.",
    )
    expect(first.text).toContain('Valeur du compte : 100,00 € → 1,00 €')
    expect(first.text).toContain(
      'holdings [{"asset":"bitcoin","quantity":"0.5","invested":"10000,00"},{"asset":"cardano","quantity":"100","invested":"10000,00"}], confirm: true',
    )
    expect(lines).toHaveLength(3)

    const second = await call('sync_crypto_holdings', args)
    expect(second.isError).toBe(false)
    expect(second.text).toContain('Rien à modifier')
    expect(writes()).toHaveLength(3)
  })

  it('never touches imported or synced lines', async () => {
    const synced = holding({ origin: 'sync', location: 'Ledger' })
    const { routes } = holdingRoutes([synced])
    const { call, writes } = await connect(routes)
    const blocked = await call('sync_crypto_holdings', {
      account: 'Crypto Test',
      location: 'Ledger',
      holdings: [{ asset: 'BTC', quantity: '1' }],
      confirm: true,
    })
    expect(blocked.isError).toBe(true)
    expect(blocked.text).toContain('synchronisée')
    const empty = await call('sync_crypto_holdings', {
      account: 'Crypto Test',
      location: 'Ledger',
      holdings: [],
      confirm: true,
    })
    expect(empty.text).toContain('Rien à modifier')
    expect(writes()).toHaveLength(0)
  })

  it.each([
    ['-1', 'invalide'],
    ['1e-8', 'invalide'],
    ['0.1234567890123456789', 'invalide'],
    ['0,000', 'Quantité nulle'],
  ])('refuses the quantity %s before writing', async (quantity, message) => {
    const { routes } = holdingRoutes([])
    const { call, writes } = await connect(routes)
    const { text, isError } = await call('sync_crypto_holdings', {
      account: 'Crypto Test',
      location: '',
      holdings: [{ asset: 'BTC', quantity }],
      confirm: true,
    })
    expect(isError).toBe(true)
    expect(text).toContain(message)
    expect(writes()).toHaveLength(0)
  })

  it('asks for the id of an unknown asset, an asset given twice or a non-crypto account', async () => {
    const { routes } = holdingRoutes([])
    const { call, writes } = await connect(routes)
    const unknown = await call('sync_crypto_holdings', {
      account: 'Crypto Test',
      location: '',
      holdings: [{ asset: 'XYZ', quantity: '1' }],
    })
    expect(unknown.text).toContain('introuvable')
    const twice = await call('sync_crypto_holdings', {
      account: 'Crypto Test',
      location: '',
      holdings: [
        { asset: 'sol', quantity: '1' },
        { asset: 'solana', quantity: '2' },
      ],
    })
    expect(twice.text).toContain('apparaît deux fois')
    const notCrypto = await call('sync_crypto_holdings', {
      account: 'PEA',
      location: '',
      holdings: [],
    })
    expect(notCrypto.text).toContain("n'est pas un compte crypto")
    const exchange = await call('sync_crypto_holdings', {
      account: 'Plateforme Test',
      location: '',
      holdings: [{ asset: 'BTC', quantity: '1' }],
      confirm: true,
    })
    expect(exchange.isError).toBe(true)
    expect(exchange.text).toContain('compte de plateforme')
    const wallet = await call('sync_crypto_holdings', {
      account: 'Portefeuille Test',
      location: '',
      holdings: [],
      confirm: true,
    })
    expect(wallet.text).toContain('portefeuille synchronisé')
    expect(writes()).toHaveLength(0)
  })
})

describe('create_investment_account', () => {
  it('never creates an account: it says what to create in the app', async () => {
    const { call, writes } = await connect({ '/api/accounts': accounts })
    const fresh = await call('create_investment_account', {
      name: 'PEE Entreprise Test',
      type: 'employee_savings',
      institution: 'Gestionnaire Test',
    })
    expect(fresh.isError).toBe(false)
    expect(fresh.text).toContain('Aucun compte « PEE Entreprise Test »')
    expect(fresh.text).toContain('- Type : Épargne salariale')
    expect(fresh.text).toContain('- Établissement : Gestionnaire Test')
    expect(fresh.text).toContain("Rien n'a été créé")

    const existing = await call('create_investment_account', {
      name: 'assurance vie test',
      type: 'life_insurance',
    })
    expect(existing.text).toContain('existe déjà')
    const archived = await call('create_investment_account', {
      name: 'PEE ancien',
      type: 'employee_savings',
    })
    expect(archived.text).toContain('archivé : restaurez-le')
    expect(writes()).toHaveLength(0)
  })
})

describe('prompt importer_mes_investissements', () => {
  it('walks the Drive folder with the investment tools', async () => {
    const { client } = await connect({})
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name)).toContain('importer_mes_investissements')
    const result = await client.getPrompt({
      name: 'importer_mes_investissements',
      arguments: { folder: 'Docs Test' },
    })
    const message = result.messages[0]?.content
    const text = message?.type === 'text' ? message.text : ''
    expect(text).toContain('« Docs Test »')
    expect(text).toContain('Nous sommes le 14/11/2026')
    for (const tool of [
      'list_investment_accounts',
      'add_investment_snapshots',
      'sync_crypto_holdings',
      'create_investment_account',
    ]) {
      expect(text).toContain(tool)
    }
    expect(text).toContain('<Support>_<Document>_<AAAA-MM[-JJ]>')
    expect(text).toContain('scanné')
    expect(text).toContain('Récapitulatif avant')
  })
})
