import { describe, expect, it } from 'vitest'
import type {
  CryptoMovementKind,
  CryptoMovementResolution,
} from '#/database/schema/domain-enums'
import {
  type CostAccount,
  type CostLink,
  type CostMovement,
  replayCosts,
  stepBefore,
  toUnits,
  withinFee,
} from './cost-basis'

/** Synthetic accounts and movements only. */

const COINBASE: CostAccount = { id: 'coinbase', source: 'exchange' }
const BINANCE: CostAccount = { id: 'binance', source: 'exchange' }
const LEDGER: CostAccount = {
  id: 'ledger',
  source: 'wallet',
  observedAt: Date.parse('2026-01-01T00:00:00Z'),
}

let sequence = 0
function movement(
  accountId: string,
  at: string,
  kind: CryptoMovementKind,
  asset: string,
  quantity: string,
  extra: Partial<CostMovement> = {},
): CostMovement {
  const observed = kind === 'observed_in' || kind === 'observed_out'
  return {
    id: `m${++sequence}`,
    accountId,
    at: Date.parse(at),
    kind,
    asset,
    assetId: asset === 'BTC' ? 'bitcoin' : asset === 'ETH' ? 'ethereum' : null,
    quantity: toUnits(quantity),
    eurCents: null,
    observedSince: observed ? Date.parse('2026-01-01T00:00:00Z') : null,
    counterpartAccountId: null,
    resolution: null,
    costCents: null,
    ...extra,
  }
}

function invested(
  basis: ReturnType<typeof replayCosts>,
  accountId: string,
  at = '2100-01-01T00:00:00Z',
) {
  return stepBefore(basis, accountId, Date.parse(at))
}

function answered(
  base: CostMovement,
  resolution: CryptoMovementResolution,
  costCents: number | null,
): CostMovement {
  return { ...base, resolution, costCents }
}

describe('replayCosts: the cost follows the coins (#373)', () => {
  const buy = movement('coinbase', '2026-02-01T10:00:00Z', 'buy', 'BTC', '1', {
    eurCents: 3_000_000,
  })

  it('carries the cost of 0,5 BTC from Coinbase to the Ledger, nothing typed', () => {
    const withdrawal = movement(
      'coinbase',
      '2026-02-02T10:00:00Z',
      'withdrawal',
      'BTC',
      '-0.5',
    )
    const arrival = movement(
      'ledger',
      '2026-02-03T08:00:00Z',
      'observed_in',
      'BTC',
      '0.5',
      { observedSince: Date.parse('2026-02-01T08:00:00Z') },
    )
    const basis = replayCosts(
      [COINBASE, LEDGER],
      [buy, withdrawal, arrival],
      [{ outId: withdrawal.id, inId: arrival.id }],
    )
    expect(invested(basis, 'coinbase')?.investedCents).toBe(1_500_000)
    expect(invested(basis, 'ledger')?.investedCents).toBe(1_500_000)
    expect(invested(basis, 'ledger')?.unknown).toEqual([])
  })

  it('a network fee paid in coins lowers the quantity, never the cost', () => {
    const withdrawal = movement(
      'coinbase',
      '2026-02-02T10:00:00Z',
      'withdrawal',
      'BTC',
      '-0.5',
    )
    const arrival = movement(
      'ledger',
      '2026-02-03T08:00:00Z',
      'observed_in',
      'BTC',
      '0.4999',
    )
    const basis = replayCosts(
      [COINBASE, LEDGER],
      [buy, withdrawal, arrival],
      [{ outId: withdrawal.id, inId: arrival.id }],
    )
    expect(invested(basis, 'ledger')?.investedCents).toBe(1_500_000)
    expect(basis.pools.get('ledger')).toEqual([
      {
        assetId: 'bitcoin',
        quantity: '0.4999',
        costCents: 1_500_000,
        unknownQuantity: '0',
      },
    ])
  })

  it('Ledger → Binance, sold for 8 000 €: Ledger 9 000 €, Binance 0 €, +2 000 € realised, 24 000 € in all', () => {
    const withdrawal = movement(
      'coinbase',
      '2026-02-02T10:00:00Z',
      'withdrawal',
      'BTC',
      '-0.5',
    )
    const arrival = movement(
      'ledger',
      '2026-02-03T08:00:00Z',
      'observed_in',
      'BTC',
      '0.5',
    )
    // The Ledger's next read sees 0,2 BTC gone; Binance got them earlier.
    const departure = movement(
      'ledger',
      '2026-03-10T08:00:00Z',
      'observed_out',
      'BTC',
      '-0.2',
      { observedSince: Date.parse('2026-03-01T08:00:00Z') },
    )
    const deposit = movement(
      'binance',
      '2026-03-05T12:00:00Z',
      'deposit',
      'BTC',
      '0.2',
    )
    const sold = movement(
      'binance',
      '2026-03-06T12:00:00Z',
      'sell',
      'BTC',
      '-0.2',
    )
    const revenue = movement(
      'binance',
      '2026-03-06T12:00:00Z',
      'sell',
      'EUR',
      '8000',
    )
    const basis = replayCosts(
      [COINBASE, BINANCE, LEDGER],
      [buy, withdrawal, arrival, departure, deposit, sold, revenue],
      [
        { outId: withdrawal.id, inId: arrival.id },
        { outId: departure.id, inId: deposit.id },
      ],
    )
    // The euros of the sale wait on Binance: value and cost alike.
    expect(invested(basis, 'binance', '2026-03-07T00:00:00Z')).toMatchObject({
      investedCents: 800_000,
      fiatCents: 800_000,
    })
    expect(basis.gains).toEqual([
      expect.objectContaining({
        accountId: 'binance',
        proceedsCents: 800_000,
        costCents: 600_000,
        gainCents: 200_000,
        unknownQuantity: '0',
      }),
    ])
    expect(invested(basis, 'ledger')?.investedCents).toBe(900_000)
    expect(invested(basis, 'coinbase')?.investedCents).toBe(1_500_000)

    // Once the euros are sent to the bank, Binance holds nothing.
    const toBank = movement(
      'binance',
      '2026-03-08T12:00:00Z',
      'withdrawal',
      'EUR',
      '-8000',
    )
    const after = replayCosts(
      [COINBASE, BINANCE, LEDGER],
      [buy, withdrawal, arrival, departure, deposit, sold, revenue, toBank],
      [
        { outId: withdrawal.id, inId: arrival.id },
        { outId: departure.id, inId: deposit.id },
      ],
    )
    const total = ['coinbase', 'binance', 'ledger'].reduce(
      (sum, id) => sum + invested(after, id)!.investedCents,
      0,
    )
    expect(invested(after, 'binance')?.investedCents).toBe(0)
    expect(total).toBe(2_400_000)
  })

  it('a transfer never creates invested money: the total moves with buys and sells only', () => {
    const withdrawal = movement(
      'coinbase',
      '2026-02-02T10:00:00Z',
      'withdrawal',
      'BTC',
      '-0.3',
    )
    const arrival = movement(
      'ledger',
      '2026-02-03T08:00:00Z',
      'observed_in',
      'BTC',
      '0.2999',
    )
    const basis = replayCosts(
      [COINBASE, LEDGER],
      [buy, withdrawal, arrival],
      [{ outId: withdrawal.id, inId: arrival.id }],
    )
    expect(
      invested(basis, 'coinbase')!.investedCents +
        invested(basis, 'ledger')!.investedCents,
    ).toBe(3_000_000)
  })

  it('0,1 BTC from an unknown wallet: « sans coût connu » until answered, then a gift costs 0', () => {
    const withdrawal = movement(
      'coinbase',
      '2026-02-02T10:00:00Z',
      'withdrawal',
      'BTC',
      '-0.5',
    )
    const arrival = movement(
      'ledger',
      '2026-02-03T08:00:00Z',
      'observed_in',
      'BTC',
      '0.5',
    )
    const unknown = movement(
      'ledger',
      '2026-02-10T08:00:00Z',
      'observed_in',
      'BTC',
      '0.1',
    )
    const links: CostLink[] = [{ outId: withdrawal.id, inId: arrival.id }]
    const pending = replayCosts(
      [COINBASE, LEDGER],
      [buy, withdrawal, arrival, unknown],
      links,
    )
    expect(invested(pending, 'ledger')).toMatchObject({
      investedCents: 1_500_000,
      unknown: [{ assetId: 'bitcoin', quantity: '0.1' }],
    })
    const gift = replayCosts(
      [COINBASE, LEDGER],
      [buy, withdrawal, arrival, answered(unknown, 'gift', 0)],
      links,
    )
    expect(invested(gift, 'ledger')).toMatchObject({
      investedCents: 1_500_000,
      unknown: [],
    })
    const bought = replayCosts(
      [COINBASE, LEDGER],
      [buy, withdrawal, arrival, answered(unknown, 'bought', 250_000)],
      links,
    )
    expect(invested(bought, 'ledger')?.investedCents).toBe(1_750_000)
  })

  it('coins of unknown cost leave in proportion, the known ones keep their average', () => {
    const known = movement(
      'ledger',
      '2026-02-03T08:00:00Z',
      'observed_in',
      'BTC',
      '0.4',
      { resolution: 'bought', costCents: 1_200_000 },
    )
    const unknown = movement(
      'ledger',
      '2026-02-04T08:00:00Z',
      'observed_in',
      'BTC',
      '0.1',
    )
    const out = movement(
      'ledger',
      '2026-02-05T08:00:00Z',
      'observed_out',
      'BTC',
      '-0.25',
    )
    const basis = replayCosts([LEDGER], [known, unknown, out], [])
    expect(basis.pools.get('ledger')).toEqual([
      {
        assetId: 'bitcoin',
        quantity: '0.25',
        costCents: 600_000,
        unknownQuantity: '0.05',
      },
    ])
  })

  it('an opening position is what was linked before at its cost, the rest of unknown cost or given', () => {
    const wallet: CostAccount = { id: 'ledger', source: 'wallet' }
    const withdrawal = movement(
      'coinbase',
      '2026-02-02T10:00:00Z',
      'withdrawal',
      'BTC',
      '-0.5',
      { counterpartAccountId: 'ledger' },
    )
    const opening = movement(
      'ledger',
      '2026-04-01T08:00:00Z',
      'observed_in',
      'BTC',
      '0.7',
      { observedSince: null },
    )
    const basis = replayCosts(
      [COINBASE, wallet],
      [buy, withdrawal, opening],
      [],
    )
    expect(invested(basis, 'ledger')).toMatchObject({
      investedCents: 1_500_000,
      unknown: [{ assetId: 'bitcoin', quantity: '0.2' }],
    })
    expect(basis.openingUnknown.get(opening.id)).toBe(toUnits('0.2'))
    const given = replayCosts(
      [COINBASE, wallet],
      [buy, withdrawal, answered(opening, 'bought', 400_000)],
      [],
    )
    expect(invested(given, 'ledger')).toMatchObject({
      investedCents: 1_900_000,
      unknown: [],
    })
    // Before the account's first read only: afterwards a link is needed.
    const late = movement(
      'coinbase',
      '2026-05-01T10:00:00Z',
      'withdrawal',
      'BTC',
      '-0.1',
      { counterpartAccountId: 'ledger' },
    )
    const after = replayCosts(
      [COINBASE, wallet],
      [buy, withdrawal, opening, late],
      [],
    )
    expect(invested(after, 'ledger')?.investedCents).toBe(1_500_000)
  })

  it('an opening below what was sent to it loses the fees, or what left before at average cost', () => {
    const wallet: CostAccount = { id: 'ledger', source: 'wallet' }
    const withdrawal = movement(
      'coinbase',
      '2026-02-02T10:00:00Z',
      'withdrawal',
      'BTC',
      '-0.5',
      { counterpartAccountId: 'ledger' },
    )
    const opening = (quantity: string) =>
      movement(
        'ledger',
        '2026-04-01T08:00:00Z',
        'observed_in',
        'BTC',
        quantity,
        {
          observedSince: null,
        },
      )
    const fees = replayCosts(
      [COINBASE, wallet],
      [buy, withdrawal, opening('0.4998')],
      [],
    )
    expect(invested(fees, 'ledger')?.investedCents).toBe(1_500_000)
    const spent = replayCosts(
      [COINBASE, wallet],
      [buy, withdrawal, opening('0.25')],
      [],
    )
    expect(invested(spent, 'ledger')?.investedCents).toBe(750_000)
  })

  it('a deposit from elsewhere makes only its own coins of unknown cost', () => {
    const deposit = movement(
      'coinbase',
      '2026-02-03T10:00:00Z',
      'deposit',
      'BTC',
      '0.5',
    )
    const basis = replayCosts([COINBASE], [buy, deposit], [])
    expect(basis.pools.get('coinbase')).toEqual([
      {
        assetId: 'bitcoin',
        quantity: '1.5',
        costCents: 3_000_000,
        unknownQuantity: '0.5',
      },
    ])
  })

  it('a sale of partly unknown coins realises the gain of the known part only', () => {
    const deposit = movement(
      'coinbase',
      '2026-02-03T10:00:00Z',
      'deposit',
      'BTC',
      '1',
    )
    const sale = movement(
      'coinbase',
      '2026-02-04T10:00:00Z',
      'sell',
      'BTC',
      '-1',
      {
        eurCents: 8_000_000,
      },
    )
    const basis = replayCosts([COINBASE], [buy, deposit, sale], [])
    // Half of the coins sold had a known cost: 15 000 € for 40 000 €.
    expect(basis.gains[0]).toMatchObject({
      proceedsCents: 8_000_000,
      costCents: 1_500_000,
      gainCents: 2_500_000,
      unknownQuantity: '0.5',
    })
  })

  it('sells everything: invested 0, the gain realised', () => {
    const sale = movement(
      'coinbase',
      '2026-03-01T10:00:00Z',
      'sell',
      'BTC',
      '-1',
      {
        eurCents: 3_600_000,
      },
    )
    const basis = replayCosts([COINBASE], [buy, sale], [])
    expect(basis.gains[0].gainCents).toBe(600_000)
    // Coinbase credits the sale to its euro balance.
    expect(invested(basis, 'coinbase')).toMatchObject({
      investedCents: 3_600_000,
      fiatCents: 3_600_000,
    })
  })

  it('a conversion carries the cost to the coin it brings in, without gain', () => {
    const out = movement(
      'binance',
      '2026-02-01T10:00:00Z',
      'convert',
      'BTC',
      '-1',
    )
    const into = movement(
      'binance',
      '2026-02-01T10:00:00Z',
      'convert',
      'ETH',
      '20',
    )
    const start = movement('binance', '2026-01-15T10:00:00Z', 'buy', 'BTC', '1')
    const spend = movement(
      'binance',
      '2026-01-15T10:00:00Z',
      'buy',
      'EUR',
      '-30000',
    )
    const basis = replayCosts([BINANCE], [start, spend, out, into], [])
    expect(basis.pools.get('binance')).toEqual([
      {
        assetId: 'ethereum',
        quantity: '20',
        costCents: 3_000_000,
        unknownQuantity: '0',
      },
    ])
    expect(basis.gains).toEqual([])
  })

  it('income comes at no cost', () => {
    const reward = movement(
      'coinbase',
      '2026-02-05T10:00:00Z',
      'income',
      'BTC',
      '0.01',
    )
    const basis = replayCosts([COINBASE], [buy, reward], [])
    expect(basis.pools.get('coinbase')![0]).toMatchObject({
      quantity: '1.01',
      costCents: 3_000_000,
      unknownQuantity: '0',
    })
  })

  it('1 000 € waiting on Coinbase count at face value; a buy paid from them spends them', () => {
    const deposit = movement(
      'coinbase',
      '2026-01-10T10:00:00Z',
      'deposit',
      'EUR',
      '1000',
    )
    const waiting = replayCosts([COINBASE], [deposit], [])
    expect(invested(waiting, 'coinbase')).toMatchObject({
      investedCents: 100_000,
      fiatCents: 100_000,
    })
    const small = movement(
      'coinbase',
      '2026-01-11T10:00:00Z',
      'buy',
      'BTC',
      '0.01',
      {
        eurCents: 30_000,
      },
    )
    const spent = replayCosts([COINBASE], [deposit, small], [])
    expect(invested(spent, 'coinbase')).toMatchObject({
      investedCents: 100_000,
      fiatCents: 70_000,
    })
    // A buy beyond the balance was paid by card: never below 0.
    const card = replayCosts([COINBASE], [buy], [])
    expect(invested(card, 'coinbase')?.fiatCents).toBe(0)
  })

  it('dates each step: the invested amount before a movement is the one before it', () => {
    const basis = replayCosts([COINBASE], [buy], [])
    expect(invested(basis, 'coinbase', '2026-02-01T10:00:00Z')).toBeNull()
    expect(
      invested(basis, 'coinbase', '2026-02-01T10:00:00.001Z')?.investedCents,
    ).toBe(3_000_000)
  })
})

describe('withinFee', () => {
  it('accepts an arrival up to 5 % smaller than what was sent', () => {
    expect(withinFee(toUnits('0.5'), toUnits('0.4999'))).toBe(true)
    expect(withinFee(toUnits('0.5'), toUnits('0.475'))).toBe(true)
    expect(withinFee(toUnits('0.5'), toUnits('0.47'))).toBe(false)
    expect(withinFee(toUnits('0.5'), toUnits('0.51'))).toBe(false)
  })
})
