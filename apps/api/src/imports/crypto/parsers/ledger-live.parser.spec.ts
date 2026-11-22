import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { computeMovementHashes } from '../dedupe'
import {
  fakeHash,
  LEDGER_LIVE_HEADER,
  LEDGER_LIVE_LINES,
  LEDGER_XPUB_PLACEHOLDER,
  ledgerLiveCsv,
} from '../testing/crypto-fixtures'
import { parseCryptoExport } from './detect'
import { parseLedgerLiveCsv, txHashDigest } from './ledger-live.parser'

const digestOf = (hash: string) =>
  createHash('sha256').update(`txhash:v1|${hash}`).digest('hex')

describe('parseLedgerLiveCsv', () => {
  const result = parseLedgerLiveCsv(ledgerLiveCsv(LEDGER_LIVE_LINES))

  it('reads each operation with its sign, kind and hash digest', () => {
    expect(result.format).toBe('ledger_live_csv')
    expect(result.issues).toEqual([])
    expect(result.movements[0]).toEqual({
      lineNumber: 2,
      occurredAt: '2025-03-01T10:00:00Z',
      wallet: 'Bitcoin 1',
      operation: 'IN',
      kind: 'deposit',
      known: true,
      asset: 'BTC',
      quantity: '0.01',
      eurCents: null,
      sourceRef: null,
      txHashDigest: digestOf(fakeHash(1)),
    })
    // An OUT amount includes its fee: it all leaves.
    expect(result.movements[1]).toMatchObject({
      kind: 'withdrawal',
      quantity: '-0.002',
    })
  })

  it('makes a move between two accounts of the export internal', () => {
    const move = result.movements.filter(
      (movement) => movement.txHashDigest === digestOf(fakeHash(3)),
    )
    expect(move.map((m) => [m.kind, m.quantity])).toEqual([
      ['transfer_internal', '-0.003'],
      ['transfer_internal', '0.00299'],
    ])
  })

  it('keeps a token in its ticker, a fee line, the fee of a failed one', () => {
    const eth = result.movements.filter((m) => m.wallet === 'Ethereum 1')
    expect(eth.map((m) => [m.asset, m.operation, m.kind, m.quantity])).toEqual([
      ['ETH', 'IN', 'deposit', '0.5'],
      ['USDT', 'IN', 'deposit', '25'],
      ['ETH', 'FEES', 'fee', '-0.0002'],
      ['ETH', 'OUT (Failed)', 'fee', '-0.0001'],
      // NFT lines move no coin; an unknown type is kept, flagged.
      ['ETH', 'MYSTERY_OP', 'other', '0.001'],
    ])
    expect(eth.at(-1)!.known).toBe(false)
  })

  it('never keeps the xpub column, the hash or the countervalues', () => {
    const text = JSON.stringify(result)
    expect(text).not.toContain(LEDGER_XPUB_PLACEHOLDER)
    expect(text).not.toContain(fakeHash(1))
    expect(text).not.toContain('123.45')
  })

  it('reports unreadable lines and goes on', () => {
    const parsed = parseLedgerLiveCsv(
      [
        LEDGER_LIVE_HEADER,
        'not a date,Confirmed,BTC,IN,1,0,abc,Bitcoin 1,x,EUR,1,1',
        '2025-03-01T10:00:00.000Z,Confirmed,BTC,IN,abc,0,abc,Bitcoin 1,x,EUR,1,1',
        '2025-03-01T10:00:00.000Z,Confirmed',
        `2025-03-02T10:00:00.000Z,Confirmed,BTC,IN,1,0,${fakeHash(1)},Bitcoin 1,x,EUR,1,1`,
      ].join('\r\n'),
    )
    expect(parsed.issues).toEqual([
      { lineNumber: 2, message: 'Date illisible' },
      { lineNumber: 3, message: 'Montant illisible' },
      { lineNumber: 4, message: 'Ligne incomplète' },
    ])
    expect(parsed.movements).toHaveLength(1)
  })

  it('is detected from its header', () => {
    expect(
      parseCryptoExport(Buffer.from(ledgerLiveCsv(LEDGER_LIVE_LINES))).format,
    ).toBe('ledger_live_csv')
  })

  it('gives the same hashes to a re-exported file, apart to equal lines', () => {
    const again = parseLedgerLiveCsv(
      ledgerLiveCsv(
        LEDGER_LIVE_LINES.map((line) => {
          const copy = [...line] as typeof line
          copy[7] = 'Renamed' // an account renamed in Ledger Live
          return copy
        }),
      ),
    )
    expect(computeMovementHashes('ledger_live_csv', again.movements)).toEqual(
      computeMovementHashes('ledger_live_csv', result.movements),
    )
    const twice = parseLedgerLiveCsv(
      ledgerLiveCsv([LEDGER_LIVE_LINES[0], LEDGER_LIVE_LINES[0]]),
    )
    const hashes = computeMovementHashes('ledger_live_csv', twice.movements)
    expect(new Set(hashes).size).toBe(2)
  })
})

describe('txHashDigest', () => {
  it('is the same with or without 0x, in any case', () => {
    const hash = fakeHash(42)
    expect(txHashDigest(`0x${hash.toUpperCase()}`)).toBe(txHashDigest(hash))
    expect(txHashDigest(hash)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is null for what is not a hash', () => {
    expect(txHashDigest('')).toBeNull()
    expect(txHashDigest('abc')).toBeNull()
    expect(txHashDigest('not a hash at all, really')).toBeNull()
  })
})
