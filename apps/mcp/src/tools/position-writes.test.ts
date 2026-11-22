import { describe, expect, it } from 'vitest'
import type {
  InvestmentsSummaryDto,
  PositionsDto,
  StatementPreviewDto,
} from '../api/types.js'
import { checking, pea } from '../test/fixtures.js'
import { connect } from '../test/mock-api.js'
import { parseEurPrice } from './position-writes.js'

// Synthetic securities (`ZZ…` ISINs) and amounts only.
const accounts = [checking, pea]
const preview: StatementPreviewDto = {
  asOf: '2026-10-31',
  comparedWith: '2026-09-30',
  lines: [
    {
      isin: 'ZZ00MSCIWD03',
      name: 'ETF Monde fictif',
      status: 'changed',
      quantityBefore: '40',
      quantityAfter: '48',
      unitCostBefore: '400',
      unitCostAfter: '412.515',
      priceEur: '498.32',
      priceKept: false,
    },
    {
      isin: 'ZZ00EMMKT008',
      name: 'ETF Émergents fictif',
      status: 'new',
      quantityBefore: null,
      quantityAfter: '210',
      unitCostBefore: null,
      unitCostAfter: null,
      priceEur: '26.07',
      priceKept: false,
    },
  ],
  cashBeforeCents: 10_000,
  cashAfterCents: 48_224,
  valueBeforeCents: null,
  valueAfterCents: 2_987_630,
  typedValueCents: null,
  unknownWithoutName: [],
  unchanged: false,
}

const written: PositionsDto = {
  accountId: pea.id,
  asOf: '2026-10-31',
  cashCents: 48_224,
  lines: [],
  totals: {
    valueCents: 2_987_630,
    pricedValueCents: 2_987_630,
    costCents: 0,
    gainCents: 0,
    withoutPriceCount: 0,
    withoutCostCount: 0,
  },
  statements: [],
}

const args = {
  account: 'PEA',
  asOf: '2026-10-31',
  lines: [
    {
      isin: 'zz00 msciwd03',
      quantity: '48',
      unitCost: '412,515',
      price: '498,32',
    },
    {
      isin: 'ZZ00EMMKT008',
      name: 'ETF Émergents fictif',
      quantity: '210',
      price: '26,07 €',
    },
  ],
  cash: '482,24',
}

function routes() {
  return {
    '/api/accounts': accounts,
    '/api/investments/summary': {
      totals: {},
      accounts: [],
    } as unknown as InvestmentsSummaryDto,
    [`POST /api/accounts/${pea.id}/positions/statements/2026-10-31/preview`]:
      preview,
    [`PUT /api/accounts/${pea.id}/positions/statements/2026-10-31`]: written,
  }
}

describe('sync_security_positions', () => {
  it('previews a statement without writing it, with exact decimals', async () => {
    const { call, calls } = await connect(routes())
    const { text, isError } = await call('sync_security_positions', args)
    expect(isError).toBe(false)
    expect(text).toContain('APERÇU')
    expect(text).toContain(
      '- ETF Monde fictif (ZZ00MSCIWD03) : 40 → 48 parts, PRU 400 € → PRU 412,515 €, cours 498,32 €',
    )
    expect(text).toContain(
      '- ETF Émergents fictif (ZZ00EMMKT008) : nouvelle ligne, 210 parts, PRU inconnu, cours 26,07 €',
    )
    expect(text).toContain('Liquidités : 100,00 € → 482,24 €')
    expect(text).toContain(
      "Valeur du 31/10/2026 : 29 876,30 € d'après les lignes (aucune valeur ce jour-là jusqu'ici).",
    )
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
    const sent = calls.find((c) => c.method === 'POST')!.body
    // ISINs normalized, decimals as exact text, cents for the cash.
    expect(sent).toEqual({
      lines: [
        {
          isin: 'ZZ00MSCIWD03',
          quantity: '48',
          unitCostEur: '412.515',
          priceEur: '498.32',
        },
        {
          isin: 'ZZ00EMMKT008',
          name: 'ETF Émergents fictif',
          quantity: '210',
          priceEur: '26.07',
        },
      ],
      cashCents: 48_224,
    })
  })

  it('writes the statement with confirm: true', async () => {
    const { call, calls } = await connect(routes())
    const { text } = await call('sync_security_positions', {
      ...args,
      confirm: true,
    })
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
    expect(text).toContain('Relevé du 31/10/2026 enregistré pour PEA.')
    expect(text).toContain('aucun outil MCP ne supprime')
  })

  it('writes the lines of a compte-titres alike (#414)', async () => {
    const cto = {
      ...pea,
      id: 'a0000000-0000-4000-8000-0000000000c7',
      name: 'CTO test',
      type: 'securities' as const,
    }
    const { call, calls } = await connect({
      ...routes(),
      '/api/accounts': [...accounts, cto],
      [`POST /api/accounts/${cto.id}/positions/statements/2026-10-31/preview`]:
        preview,
      [`PUT /api/accounts/${cto.id}/positions/statements/2026-10-31`]: {
        ...written,
        accountId: cto.id,
      },
    })
    const { text, isError } = await call('sync_security_positions', {
      ...args,
      account: 'CTO test',
      confirm: true,
    })
    expect(isError).toBe(false)
    expect(text).toContain('Relevé du 31/10/2026 enregistré pour CTO test.')
    expect(
      calls.filter(
        (c) => c.method === 'PUT' && c.url.pathname.includes(cto.id),
      ),
    ).toHaveLength(1)
  })

  it('changes nothing when the statement is already there', async () => {
    const { call, calls } = await connect({
      ...routes(),
      [`POST /api/accounts/${pea.id}/positions/statements/2026-10-31/preview`]:
        { ...preview, unchanged: true },
    })
    const { text } = await call('sync_security_positions', {
      ...args,
      confirm: true,
    })
    expect(text).toContain('Rien à modifier')
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('refuses a wrong ISIN, a duplicate, a future day and another account type', async () => {
    const { call, calls } = await connect(routes())
    const bad = await call('sync_security_positions', {
      ...args,
      lines: [{ isin: 'ZZ00MSCIWD04', quantity: '1' }],
    })
    expect(bad.isError).toBe(true)
    expect(bad.text).toContain('ISIN « ZZ00MSCIWD04 » invalide')
    const twice = await call('sync_security_positions', {
      ...args,
      lines: [args.lines[1], args.lines[1]],
    })
    expect(twice.text).toContain('apparaît deux fois')
    const future = await call('sync_security_positions', {
      ...args,
      asOf: '2026-11-15',
    })
    expect(future.text).toContain('dans le futur')
    const negative = await call('sync_security_positions', {
      ...args,
      cash: '-5',
    })
    expect(negative.text).toContain('Liquidités « -5 » invalides')
    expect(calls.some((c) => c.method !== 'GET')).toBe(false)
  })

  it('asks for the name of a security the app does not know', async () => {
    const { call } = await connect({
      ...routes(),
      [`POST /api/accounts/${pea.id}/positions/statements/2026-10-31/preview`]:
        { ...preview, unknownWithoutName: ['ZZ00MSCIWD03'] },
    })
    const { text, isError } = await call('sync_security_positions', args)
    expect(isError).toBe(true)
    expect(text).toContain('Nom manquant pour ZZ00MSCIWD03')
  })

  it('parses prices exactly, at most 12 decimals', () => {
    expect(parseEurPrice('1 234,500')).toBe('1234.5')
    expect(parseEurPrice('0,0000000000001')).toBeNull()
    expect(parseEurPrice('1e3')).toBeNull()
  })
})
