/**
 * Synthetic exchange exports: the structure of the real Binance and Coinbase
 * "Transactions" CSVs, with made-up user ids, references, quantities and
 * amounts. Never paste a real export here.
 */

const BOM = '﻿'

/** Fake Binance user id (the column is never read). */
const UID = '100000001'

export const BINANCE_FR_HEADER =
  'Identifiant utilisateur,Durée,Compte,Opération,Jeton,Change,Remarque'
export const BINANCE_EN_HEADER =
  'User_ID,UTC_Time,Account,Operation,Coin,Change,Remark'

/** Binance ledger lines without the user id: time, account, op, coin, change, remark. */
export type BinanceLine = [string, string, string, string, string, string?]

export function binanceCsv(
  lines: BinanceLine[],
  { header = BINANCE_FR_HEADER, bom = true } = {},
): string {
  const body = lines.map(
    ([time, account, operation, coin, change, remark = '']) =>
      // Trailing spaces, as in the real exports.
      [UID, time, `${account} `, `${operation} `, coin, change, remark].join(
        ',',
      ),
  )
  return `${bom ? BOM : ''}${[header, ...body].join('\r\n')}\r\n`
}

/** January and February: every operation type of the issue. */
export const BINANCE_EARLY: BinanceLine[] = [
  ['2025-01-10 09:00:00', 'Spot', 'Deposit', 'EUR', '500.00000000'],
  ['2025-01-10 09:05:00', 'Spot', 'Transaction Spend', 'EUR', '-200.00000000'],
  ['2025-01-10 09:05:00', 'Spot', 'Transaction Buy', 'BTC', '0.00400000'],
  ['2025-01-10 09:05:00', 'Spot', 'Transaction Fee', 'BTC', '-0.00000400'],
  // Same second, same fee: a second, legitimate line.
  ['2025-01-10 09:05:00', 'Spot', 'Transaction Fee', 'BTC', '-0.00000400'],
  ['2025-01-12 12:00:00', 'Spot', 'Binance Convert', 'BTC', '-0.00100000'],
  ['2025-01-12 12:00:00', 'Spot', 'Binance Convert', 'ETH', '0.02000000'],
  ['2025-02-01 08:00:00', 'Funding', 'Crypto Box', 'USDT', '1.5'],
  ['2025-02-02 08:00:00', 'Funding', 'Transfer Funds to Spot', 'USDT', '-1.5'],
  ['2025-02-02 08:00:00', 'Spot', 'Transfer Funds to Spot', 'USDT', '1.5'],
  ['2025-02-03 10:00:00', 'Spot', 'Transaction Sold', 'ETH', '-0.01000000'],
  ['2025-02-03 10:00:00', 'Spot', 'Transaction Revenue', 'EUR', '30.00000000'],
  ['2025-02-03 10:00:00', 'Spot', 'Transaction Fee', 'EUR', '-0.03000000'],
  [
    '2025-02-05 14:00:00',
    'Spot',
    'Withdraw',
    'BTC',
    '-0.00100000',
    '"Withdraw fee is included, see note"',
  ],
  ['2025-02-06 14:00:00', 'Spot', 'Deposit', 'RNDR', '10'],
  ['2025-02-07 14:00:00', 'Spot', 'Mystery Bonus', 'BNB', '1E-8'],
]

/** Overlaps the end of `BINANCE_EARLY` (from 3 February) and adds March. */
export const BINANCE_LATE: BinanceLine[] = [
  ...BINANCE_EARLY.slice(10),
  ['2025-03-01 09:00:00', 'Spot', 'Buy Crypto With Fiat', 'SOL', '2.5'],
  ['2025-03-02 09:00:00', 'Spot', 'Transaction Spend', 'EUR', '-100'],
  ['2025-03-02 09:00:00', 'Spot', 'Transaction Buy', 'ETH', '0.04'],
  ['2025-03-02 09:00:00', 'Spot', 'Transaction Fee', 'EUR', '-0.1'],
]

/** Balances an exchange would show after `BINANCE_EARLY` (EUR left out). */
export const BINANCE_EARLY_BALANCES = {
  bitcoin: '0.001992',
  ethereum: '0.01',
  tether: '1.5',
  'render-token': '10',
  binancecoin: '0.00000001',
}

/** Fake Coinbase account holder (preamble): must never be stored or logged. */
export const COINBASE_HOLDER = 'Camille Exemple'
export const COINBASE_USER_ID = '00000000-aaaa-4bbb-8ccc-000000000001'

export const COINBASE_HEADER =
  'ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes,Sender Address,Recipient Address'

/** id, time, type, asset, quantity, subtotal, total (EUR, `€…`). */
export type CoinbaseLine = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
]

export function coinbaseCsv(lines: CoinbaseLine[]): string {
  const preamble = [
    'Transactions',
    `User,${COINBASE_HOLDER},${COINBASE_USER_ID}`,
  ]
  const body = lines.map(([id, time, type, asset, quantity, subtotal, total]) =>
    [
      id,
      time,
      type,
      asset,
      quantity,
      'EUR',
      '€1.00',
      subtotal,
      total,
      '€0.00',
      `"${type} ${asset}, synthetic note"`,
      '',
      '',
    ].join(','),
  )
  return `${[...preamble, COINBASE_HEADER, ...body].join('\n')}\n`
}

export const COINBASE_2025: CoinbaseLine[] = [
  [
    'cb0001',
    '2025-03-01 10:00:00 UTC',
    'Deposit',
    'EUR',
    '100',
    '€100.00',
    '€100.00',
  ],
  [
    'cb0002',
    '2025-03-01 10:05:00 UTC',
    'Buy',
    'BTC',
    '0.001',
    '€49.50',
    '€50.99000000000001',
  ],
  [
    'cb0003',
    '2025-03-02 09:00:00 UTC',
    'Convert',
    'BTC',
    '-0.0005',
    '€25.00',
    '€25.00',
  ],
  [
    'cb0004',
    '2025-03-02 09:00:00 UTC',
    'Convert',
    'ETH',
    '0.01',
    '€24.90',
    '€24.90',
  ],
  [
    'cb0005',
    '2025-03-03 09:00:00 UTC',
    'Retail Simple Price Improvement',
    'BTC',
    '0.000001',
    '€0.05',
    '€0.05',
  ],
  [
    'cb0006',
    '2025-03-04 09:00:00 UTC',
    'Staking Income',
    'ETH',
    '0.0001',
    '€0.25',
    '€0.25',
  ],
  [
    'cb0007',
    '2025-03-05 09:00:00 UTC',
    'Send',
    'ETH',
    '-0.005',
    '€12.00',
    '€12.00',
  ],
  [
    'cb0008',
    '2025-03-06 09:00:00 UTC',
    'Sell',
    'BTC',
    '-0.0002',
    '€10.00',
    '€9.80',
  ],
  [
    'cb0009',
    '2025-03-07 09:00:00 UTC',
    'Receive',
    'SOL',
    '2',
    '€300.00',
    '€300.00',
  ],
  [
    'cb0010',
    '2025-03-08 09:00:00 UTC',
    'Mystery Airdrop',
    'XYZ',
    '5',
    '€0.00',
    '€0.00',
  ],
]

/** Balances after `COINBASE_2025` (EUR left out). */
export const COINBASE_2025_BALANCES = {
  bitcoin: '0.000301',
  ethereum: '0.0051',
  solana: '2',
}

/**
 * Ledger Live operations history (#426): the columns of Ledger Live's
 * `csvExport.ts`, comma separated, never quoted, CRLF. Transaction hashes
 * are made up (`fakeHash`), the xpub column holds a placeholder that the
 * parser never reads.
 */
export const LEDGER_LIVE_HEADER =
  'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date,Countervalue at CSV Export'

/** A fake transaction hash, 64 hex characters, from a seed. */
export function fakeHash(seed: number): string {
  return seed.toString(16).padStart(8, '0').repeat(8)
}

/** A placeholder for the xpub column (never read nor stored). */
export const LEDGER_XPUB_PLACEHOLDER = 'xpubPLACEHOLDERNEVERREAD'

/** date, status, ticker, type, amount, fees, hash, account name. */
export type LedgerLiveLine = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
]

export function ledgerLiveCsv(lines: LedgerLiveLine[]): string {
  const body = lines.map(
    ([date, status, ticker, type, amount, fees, hash, account]) =>
      [
        date,
        status,
        ticker,
        type,
        amount,
        fees,
        hash,
        account,
        LEDGER_XPUB_PLACEHOLDER,
        'EUR',
        '123.45',
        '678.90',
      ].join(','),
  )
  // Ledger Live writes no trailing newline.
  return [LEDGER_LIVE_HEADER, ...body].join('\r\n')
}

/**
 * A Bitcoin account fed from an exchange, a payment out, a move to a second
 * Bitcoin account of the same export, and an Ethereum account with a token.
 */
export const LEDGER_LIVE_LINES: LedgerLiveLine[] = [
  [
    '2025-03-01T10:00:00.000Z',
    'Confirmed',
    'BTC',
    'IN',
    '0.01',
    '0.00002',
    fakeHash(1),
    'Bitcoin 1',
  ],
  [
    '2025-03-10T08:30:00.000Z',
    'Confirmed',
    'BTC',
    'OUT',
    '0.002',
    '0.00001',
    fakeHash(2),
    'Bitcoin 1',
  ],
  // From Bitcoin 1 to Bitcoin 2: one transaction, two lines.
  [
    '2025-03-12T12:00:00.000Z',
    'Confirmed',
    'BTC',
    'OUT',
    '0.003',
    '0.00001',
    fakeHash(3),
    'Bitcoin 1',
  ],
  [
    '2025-03-12T12:00:00.000Z',
    'Confirmed',
    'BTC',
    'IN',
    '0.00299',
    '0.00001',
    fakeHash(3),
    'Bitcoin 2',
  ],
  [
    '2025-03-15T09:00:00.000Z',
    'Confirmed',
    'ETH',
    'IN',
    '0.5',
    '0.0001',
    fakeHash(4),
    'Ethereum 1',
  ],
  [
    '2025-03-16T09:00:00.000Z',
    'Confirmed',
    'USDT',
    'IN',
    '25',
    '',
    fakeHash(5),
    'Ethereum 1',
  ],
  [
    '2025-03-16T09:05:00.000Z',
    'Confirmed',
    'ETH',
    'FEES',
    '0.0002',
    '0.0002',
    fakeHash(6),
    'Ethereum 1',
  ],
  [
    '2025-03-20T09:00:00.000Z',
    'Failed',
    'ETH',
    'OUT',
    '0.0001',
    '0.0001',
    fakeHash(7),
    'Ethereum 1',
  ],
  [
    '2025-03-21T09:00:00.000Z',
    'Confirmed',
    'ETH',
    'NFT_IN',
    '0',
    '0',
    fakeHash(8),
    'Ethereum 1',
  ],
  [
    '2025-03-22T09:00:00.000Z',
    'Confirmed',
    'ETH',
    'MYSTERY_OP',
    '0.001',
    '0',
    fakeHash(9),
    'Ethereum 1',
  ],
]
