import type { CryptoMovementKind } from '#/database/schema/domain-enums'
import type { CryptoParseResult, ParsedMovement } from '../crypto-import.types'
import { formatQuantity, parseMoneyCents, parseQuantity } from '../quantity'
import {
  cell,
  cleanOperation,
  cleanRef,
  findHeader,
  type HeaderMatch,
  kindOf,
  parseTicker,
  parseUtcTimestamp,
  readRecords,
  requiredWidth,
} from './common'

/**
 * Coinbase "Transactions" export (one file per year). It starts with a
 * preamble (a title, then a line with the account holder's name and user
 * id): every line before the header row is skipped unread, so neither is
 * ever stored or logged. Timestamps are UTC (`2025-03-15 10:00:00 UTC`),
 * quantities signed, money columns `€1234.56…` with long decimals. Notes and
 * addresses are never read.
 */

const ALIASES = {
  id: ['id'],
  time: ['timestamp'],
  type: ['transaction type'],
  asset: ['asset'],
  quantity: ['quantity transacted'],
  currency: ['price currency', 'spot price currency'],
  subtotal: ['subtotal'],
  total: ['total (inclusive of fees and/or spread)', 'total'],
} as const

const REQUIRED = ['time', 'type', 'asset', 'quantity'] as const

/** Transaction types, by `headerKey` form. */
const KINDS: Readonly<Record<string, CryptoMovementKind>> = {
  buy: 'buy',
  'advanced trade buy': 'buy',
  'advance trade buy': 'buy',
  sell: 'sell',
  'advanced trade sell': 'sell',
  'advance trade sell': 'sell',
  convert: 'convert',
  send: 'withdrawal',
  withdrawal: 'withdrawal',
  receive: 'deposit',
  deposit: 'deposit',
  'staking income': 'income',
  'rewards income': 'income',
  'reward income': 'income',
  'learning reward': 'income',
  'coinbase earn': 'income',
  'inflation reward': 'income',
  'incentives rewards payout': 'income',
  'retail simple price improvement': 'income',
  'subscription rebate': 'income',
  'retail staking transfer': 'transfer_internal',
  'retail unstaking transfer': 'transfer_internal',
  'retail eth2 deprecation': 'transfer_internal',
}

/** Kinds whose quantity always has this sign (older exports are unsigned). */
const SIGN: Partial<Record<CryptoMovementKind, 1 | -1>> = {
  buy: 1,
  deposit: 1,
  income: 1,
  sell: -1,
  withdrawal: -1,
}

export function findCoinbaseHeader(
  records: Parameters<typeof findHeader>[0],
): HeaderMatch | null {
  return findHeader(records, ALIASES, REQUIRED)
}

export function parseCoinbaseCsv(text: string): CryptoParseResult {
  const { records, issues } = readRecords(text)
  const header = findCoinbaseHeader(records)
  if (!header) throw new Error('Not a Coinbase transactions export')

  const movements: ParsedMovement[] = []
  for (const record of records.slice(header.index + 1)) {
    const { lineNumber, fields } = record
    const issue = (message: string) => issues.push({ lineNumber, message })
    if (fields.length < requiredWidth(header)) {
      issue('Ligne incomplète')
      continue
    }
    const occurredAt = parseUtcTimestamp(cell(fields, header.columns, 'time'))
    if (!occurredAt) {
      issue('Date illisible')
      continue
    }
    const operation = cleanOperation(cell(fields, header.columns, 'type'))
    if (operation === '') {
      issue('Opération manquante')
      continue
    }
    const asset = parseTicker(cell(fields, header.columns, 'asset'))
    if (!asset) {
      issue('Actif illisible')
      continue
    }
    const parsed = parseQuantity(cell(fields, header.columns, 'quantity'))
    if (parsed === null) {
      issue('Quantité illisible')
      continue
    }
    const { kind, known } = kindOf(KINDS, operation)
    const sign = SIGN[kind]
    const quantity =
      sign === undefined || (parsed < 0n ? -1 : 1) === sign ? parsed : -parsed

    const currency = cell(fields, header.columns, 'currency').toUpperCase()
    const total = cell(fields, header.columns, 'total')
    const moneyText =
      total !== '' ? total : cell(fields, header.columns, 'subtotal')
    const money = parseMoneyCents(moneyText)
    const inEur =
      currency === 'EUR' || (currency === '' && moneyText.includes('€'))
    const eurCents = money !== null && inEur ? Math.abs(money) : null
    const ref = cleanRef(cell(fields, header.columns, 'id'))

    movements.push({
      lineNumber,
      occurredAt,
      wallet: null,
      operation,
      kind,
      known,
      asset,
      quantity: formatQuantity(quantity),
      eurCents,
      sourceRef: ref === '' ? null : ref,
    })
  }
  issues.sort((a, b) => a.lineNumber - b.lineNumber)
  return { format: 'coinbase_csv', movements, issues }
}
