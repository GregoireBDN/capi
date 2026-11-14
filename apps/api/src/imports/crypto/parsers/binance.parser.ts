import type { CryptoMovementKind } from '#/database/schema/domain-enums'
import type { ParseIssue } from '#/imports/parsers/parsed-row'
import type { CryptoParseResult, ParsedMovement } from '../crypto-import.types'
import { formatQuantity, parseQuantity } from '../quantity'
import {
  cell,
  cleanOperation,
  cleanWallet,
  findHeader,
  type HeaderMatch,
  kindOf,
  parseTicker,
  parseUtcTimestamp,
  readRecords,
  requiredWidth,
} from './common'

/**
 * Binance "Transactions" export (the complete ledger): `,`-separated, UTF-8
 * with BOM, French or English headers. `Change` is a signed quantity with a
 * dot decimal (sometimes in scientific notation, `1E-8`); `Durée` / `UTC_Time`
 * is a UTC timestamp. The user id and remark columns are never read.
 */

const ALIASES = {
  time: ['duree', 'utc time', 'date(utc)', 'time', 'date'],
  account: ['compte', 'account'],
  operation: ['operation'],
  coin: ['jeton', 'coin', 'piece', 'crypto'],
  change: ['change', 'variation'],
} as const

const REQUIRED = ['time', 'operation', 'coin', 'change'] as const

/** Operation types seen in the exports, by `headerKey` form. */
const KINDS: Readonly<Record<string, CryptoMovementKind>> = {
  'buy crypto with fiat': 'buy',
  'transaction buy': 'buy',
  'transaction spend': 'buy',
  buy: 'buy',
  'auto-invest transaction': 'buy',
  'transaction sold': 'sell',
  'transaction revenue': 'sell',
  sell: 'sell',
  'transaction fee': 'fee',
  fee: 'fee',
  'binance convert': 'convert',
  'small assets exchange bnb': 'convert',
  'token swap - redenomination/rebranding': 'convert',
  deposit: 'deposit',
  'fiat deposit': 'deposit',
  withdraw: 'withdrawal',
  withdrawal: 'withdrawal',
  'fiat withdraw': 'withdrawal',
  'crypto box': 'income',
  distribution: 'income',
  'airdrop assets': 'income',
  'simple earn flexible interest': 'income',
  'simple earn locked rewards': 'income',
  'staking rewards': 'income',
  'referral commission': 'income',
  'commission rebate': 'income',
  'cashback voucher': 'income',
  'card cashback': 'income',
  'transfer funds to spot': 'transfer_internal',
  'transfer funds to funding wallet': 'transfer_internal',
  'transfer between main and funding wallet': 'transfer_internal',
  'simple earn flexible subscription': 'transfer_internal',
  'simple earn flexible redemption': 'transfer_internal',
  'simple earn locked subscription': 'transfer_internal',
  'simple earn locked redemption': 'transfer_internal',
  'staking purchase': 'transfer_internal',
  'staking redemption': 'transfer_internal',
}

export function findBinanceHeader(
  records: Parameters<typeof findHeader>[0],
): HeaderMatch | null {
  return findHeader(records, ALIASES, REQUIRED)
}

export function parseBinanceCsv(text: string): CryptoParseResult {
  const { records, issues } = readRecords(text)
  const header = findBinanceHeader(records)
  if (!header) throw new Error('Not a Binance transactions export')

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
    const operation = cleanOperation(cell(fields, header.columns, 'operation'))
    if (operation === '') {
      issue('Opération manquante')
      continue
    }
    const asset = parseTicker(cell(fields, header.columns, 'coin'))
    if (!asset) {
      issue('Actif illisible')
      continue
    }
    const quantity = parseQuantity(cell(fields, header.columns, 'change'))
    if (quantity === null) {
      issue('Quantité illisible')
      continue
    }
    const wallet = cleanWallet(cell(fields, header.columns, 'account'))
    movements.push({
      lineNumber,
      occurredAt,
      wallet: wallet === '' ? null : wallet,
      operation,
      ...kindOf(KINDS, operation),
      asset,
      quantity: formatQuantity(quantity),
      eurCents: null,
      sourceRef: null,
    })
  }
  issues.sort((a: ParseIssue, b: ParseIssue) => a.lineNumber - b.lineNumber)
  return { format: 'binance_csv', movements, issues }
}
