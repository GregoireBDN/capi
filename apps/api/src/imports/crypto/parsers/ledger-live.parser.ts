import { createHash } from 'node:crypto'
import type { CryptoMovementKind } from '#/database/schema/domain-enums'
import type { CryptoParseResult, ParsedMovement } from '../crypto-import.types'
import { formatQuantity, parseQuantity } from '../quantity'
import {
  cell,
  cleanOperation,
  cleanWallet,
  findHeader,
  type HeaderMatch,
  parseTicker,
  parseUtcTimestamp,
  readRecords,
  requiredWidth,
} from './common'

/**
 * Ledger Live operations history (#426: « Exporter l'historique des
 * opérations »), one line per operation of every exported account, comma
 * separated, never quoted (Ledger Live strips commas from the cells):
 *
 *     Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,
 *     Operation Fees,Operation Hash,Account Name,Account xpub,
 *     Countervalue Ticker,Countervalue at Operation Date,
 *     Countervalue at CSV Export
 *
 * Dates are UTC ISO instants (`2025-03-15T10:00:00.000Z`); amounts and fees
 * are unsigned, in the account's currency (a token account's line in its
 * token, with no fee: the network fee is a `FEES` line of its parent
 * account). An `OUT` amount includes its fee. The `Account xpub` column (a
 * public key or an address) and the countervalues are **never read**; the
 * transaction hash is read only to keep its SHA-256 (`txHashDigest`), which
 * matches the two sides of a transfer. Columns follow Ledger Live's
 * `csvExport.ts`: to confirm on a real export.
 */

const ALIASES = {
  time: ['operation date'],
  status: ['status'],
  ticker: ['currency ticker'],
  type: ['operation type'],
  amount: ['operation amount'],
  fees: ['operation fees'],
  hash: ['operation hash'],
  account: ['account name'],
} as const

const REQUIRED = ['time', 'ticker', 'type', 'amount', 'hash'] as const

/** Operation types whose amount comes in, by kind. */
const INCOMING: Readonly<Record<string, CryptoMovementKind>> = {
  IN: 'deposit',
  REWARD: 'income',
  REWARD_PAYOUT: 'income',
  WITHDRAW: 'income',
}

/** Operation types whose amount leaves, by kind. */
const OUTGOING: Readonly<Record<string, CryptoMovementKind>> = {
  OUT: 'withdrawal',
  FEES: 'fee',
}

/**
 * Operation types of Ledger Live's "stake" family: only their fee leaves
 * the account (their amount is what was staked, still held).
 */
const STAKING = new Set([
  'FREEZE',
  'UNFREEZE',
  'UNDELEGATE_RESOURCE',
  'WITHDRAW_EXPIRE_UNFREEZE',
  'LEGACY_UNFREEZE',
  'VOTE',
  'BOND',
  'UNBOND',
  'WITHDRAW_UNBONDED',
  'SET_CONTROLLER',
  'NOMINATE',
  'CHILL',
  'REVOKE',
  'APPROVE',
  'ACTIVATE',
  'UNLOCK',
  'STAKE',
  'UNSTAKE',
  'WITHDRAW_UNSTAKED',
])

/**
 * Other operation types whose amount leaves (Ledger Live's "out" family):
 * kept as `other`, their quantity counted.
 */
const OTHER_OUTGOING = new Set([
  'REVEAL',
  'CREATE',
  'DELEGATE',
  'REDELEGATE',
  'UNDELEGATE',
  'OPT_IN',
  'OPT_OUT',
  'OPT_EDIT',
  'SLASH',
  'LOCK',
  'BURN',
  'ASSOCIATE_TOKEN',
  'CONTRACT_CALL',
  'UPDATE_ACCOUNT',
  'STAKE_NEURON',
  'TOP_UP_NEURON',
])

/** Operation types that move no coin of the account (NFTs). */
const IGNORED = new Set(['NONE', 'NFT_IN', 'NFT_OUT'])

const HASH_PATTERN = /^(?:0x)?[0-9a-z]{16,128}$/i

/**
 * SHA-256 of a transaction hash, the same whichever export it comes from:
 * lower case, without a `0x` prefix. Null when it is not a hash.
 */
export function txHashDigest(text: string): string | null {
  const hash = text.trim()
  if (!HASH_PATTERN.test(hash)) return null
  const normalized = hash.toLowerCase().replace(/^0x/, '')
  return createHash('sha256').update(`txhash:v1|${normalized}`).digest('hex')
}

export function findLedgerLiveHeader(
  records: Parameters<typeof findHeader>[0],
): HeaderMatch | null {
  return findHeader(records, ALIASES, REQUIRED)
}

interface Classified {
  kind: CryptoMovementKind
  known: boolean
  /** Signed units of 10^-18; null when the line moves nothing. */
  quantity: bigint | null
}

function classify(
  type: string,
  amount: bigint,
  fee: bigint | null,
  failed: boolean,
): Classified {
  // A failed transaction still paid its network fee.
  if (failed) {
    return { kind: 'fee', known: true, quantity: fee ? -fee : null }
  }
  if (IGNORED.has(type)) return { kind: 'other', known: true, quantity: null }
  if (INCOMING[type])
    return { kind: INCOMING[type], known: true, quantity: amount }
  if (OUTGOING[type]) {
    return { kind: OUTGOING[type], known: true, quantity: -amount }
  }
  if (STAKING.has(type)) {
    return { kind: 'fee', known: true, quantity: fee ? -fee : null }
  }
  if (OTHER_OUTGOING.has(type)) {
    return { kind: 'other', known: true, quantity: -amount }
  }
  return { kind: 'other', known: false, quantity: amount }
}

/**
 * Parses a Ledger Live operations history. Pure: no I/O, no logging. A
 * transfer between two accounts of the same export (the same transaction
 * hash going out of one and into another, same ticker) is a move inside
 * the wallet: both lines become `transfer_internal`, so neither is asked
 * about nor matched; the fee they differ by is still counted in the
 * quantities.
 */
export function parseLedgerLiveCsv(text: string): CryptoParseResult {
  const { records, issues } = readRecords(text)
  const header = findLedgerLiveHeader(records)
  if (!header) throw new Error('Not a Ledger Live operations export')

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
    const type = cleanOperation(cell(fields, header.columns, 'type'))
    if (type === '') {
      issue('Opération manquante')
      continue
    }
    const asset = parseTicker(cell(fields, header.columns, 'ticker'))
    if (!asset) {
      issue('Actif illisible')
      continue
    }
    const amount = parseQuantity(cell(fields, header.columns, 'amount'))
    if (amount === null) {
      issue('Montant illisible')
      continue
    }
    const feesText = cell(fields, header.columns, 'fees')
    const fee = feesText === '' ? null : parseQuantity(feesText)
    if (feesText !== '' && fee === null) {
      issue('Frais illisibles')
      continue
    }
    const failed =
      cell(fields, header.columns, 'status').toLowerCase() === 'failed'
    const { kind, known, quantity } = classify(
      type.toUpperCase(),
      amount < 0n ? -amount : amount,
      fee === null ? null : fee < 0n ? -fee : fee,
      failed,
    )
    if (quantity === null || quantity === 0n) continue
    const account = cleanWallet(cell(fields, header.columns, 'account'))
    movements.push({
      lineNumber,
      occurredAt,
      wallet: account === '' ? null : account,
      operation: failed ? `${type} (Failed)` : type,
      kind,
      known,
      asset,
      quantity: formatQuantity(quantity),
      eurCents: null,
      sourceRef: null,
      txHashDigest: txHashDigest(cell(fields, header.columns, 'hash')),
    })
  }

  // Moves between two accounts of the export.
  const sides = new Map<string, { outs: number[]; ins: number[] }>()
  movements.forEach((movement, i) => {
    if (!movement.txHashDigest) return
    if (movement.kind !== 'withdrawal' && movement.kind !== 'deposit') return
    const key = `${movement.txHashDigest}|${movement.asset}`
    const entry = sides.get(key) ?? { outs: [], ins: [] }
    ;(movement.kind === 'withdrawal' ? entry.outs : entry.ins).push(i)
    sides.set(key, entry)
  })
  for (const { outs, ins } of sides.values()) {
    if (outs.length === 0 || ins.length === 0) continue
    for (const i of [...outs, ...ins]) movements[i].kind = 'transfer_internal'
  }

  issues.sort((a, b) => a.lineNumber - b.lineNumber)
  return { format: 'ledger_live_csv', movements, issues }
}
