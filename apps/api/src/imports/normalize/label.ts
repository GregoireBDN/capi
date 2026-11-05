import { MERCHANT_ALIASES } from './merchant-aliases'

/**
 * Normalization of CIC transaction labels (`Libellé` column).
 *
 * Pure functions only: no I/O, no Nest, no logging (labels are private data).
 * The raw label is never modified here; callers store it as-is in
 * `transactions.raw_label` and use the result only for the derived columns.
 */

export type OperationType =
  | 'card_payment'
  | 'direct_debit'
  | 'transfer_in'
  | 'transfer_out'
  | 'instant_transfer'
  | 'cash_withdrawal'
  | 'cheque'
  | 'cheque_deposit'
  | 'bank_fee'
  | 'interest'
  | 'other'

export interface NormalizedLabel {
  /**
   * Kind of operation. Plain `VIR` labels are split into `transfer_in` /
   * `transfer_out` using the amount sign. `VIR INST` labels are always
   * `instant_transfer`: their direction is the sign of the amount, which the
   * caller already has.
   */
  operationType: OperationType
  /** Human-friendly merchant or counterparty name (e.g. `Uber`, `Jean Dupont`). */
  merchant: string | null
  /** Stable uppercase ASCII key for matching and grouping (e.g. `UBER`). */
  merchantKey: string | null
  /** City of a card payment or cash withdrawal, title-cased (e.g. `Paris`). */
  city: string | null
  /** `DDMM` operation date from card labels, as written (the year is unknown here). */
  operationDate: string | null
}

/** Matches the `transactions.merchant` column (varchar 255). */
export const MAX_MERCHANT_LENGTH = 255

interface Merchant {
  merchant: string
  merchantKey: string
}

// --- Label patterns (tested on the uppercased, space-collapsed label) -------

const CARD_PAYMENT = /^PAIEMENT (?:CB|PSC)\b(?: (\d{4})\b)?(?: (.*))?$/
const CASH_WITHDRAWAL = /^RETRAIT\b(?: DAB\b)?(?: (\d{4})\b)?(?: (.*))?$/
const DIRECT_DEBIT = /^(?:PRLV|PRELEVEMENT)\b(?: SEPA\b)?(?: (.*))?$/
const INSTANT_TRANSFER = /^VIR(?:EMENT)? INST(?:ANTANE)?\b(?: (.*))?$/
const TRANSFER = /^VIR(?:EMENT)?\b(?: SEPA\b)?(?: (.*))?$/
const CHEQUE_DEPOSIT = /^REM(?:ISE)?\.? (?:DE )?(?:CHQ|CHEQUES?)\b/
const CHEQUE = /^(?:CHQ|CHEQUE)\b/
/** `F <description>` is how CIC prefixes its own fees. */
const BANK_FEE_F = /^F (.*)$/
const BANK_FEE = /^(?:FRAIS|COMMISSIONS?|COTISATIONS?|AGIOS)\b/
const INTEREST = /^(?:INTERETS?|INT\.? CREDITEURS?)\b/

/** Trailer of card labels: `CARTE <last 4 digits> <reference>`. */
const CARD_TRAILER = /(?:^| )CARTE \d{4}\b.*$/

// --- Token tables -----------------------------------------------------------

/** Card-processor prefixes put in front of the real merchant (`SUMUP *CAFE`). */
const PROCESSOR_PREFIXES = new Set(['SUMUP', 'SQ', 'ZETTLE', 'ZTL'])

const LEGAL_FORMS = new Set([
  'SA',
  'SAS',
  'SASU',
  'SARL',
  'EURL',
  'SNC',
  'SCA',
  'SELARL',
])

/** First tokens of multi-word city names (`LE MANS`, `ST ETIENNE`). */
const CITY_PREFIXES = new Set([
  'LE',
  'LA',
  'LES',
  'ST',
  'STE',
  'SAINT',
  'SAINTE',
])

/** Words kept lowercase in title case, unless they start the name. */
const LOWERCASE_WORDS = new Set([
  'A',
  'AU',
  'AUX',
  'D',
  'DE',
  'DES',
  'DU',
  'EN',
  'ET',
  'L',
  'LA',
  'LE',
  'LES',
  'SUR',
  'AND',
  'OF',
  'THE',
])

/** Acronyms that contain vowels, so the no-vowel heuristic misses them. */
const ACRONYMS = new Set(['CAF', 'EDF', 'RATP', 'CPAM', 'URSSAF', 'CIC', 'LCL'])

/** Vowel-less short words that are abbreviations, not acronyms. */
const NOT_ACRONYMS = new Set(['ST', 'STE', 'MR', 'MM', 'DR', 'SR'])

/** Civilities CIC puts in front of transfer counterparties, longest first. */
const CIVILITIES: readonly string[][] = [
  ['MONSIEUR', 'OU', 'MADAME'],
  ['MONSIEUR', 'ET', 'MADAME'],
  ['M', 'OU', 'MME'],
  ['M', 'ET', 'MME'],
  ['MR', 'OU', 'MME'],
  ['MR', 'ET', 'MME'],
  ['MME', 'OU', 'M'],
  ['MME', 'ET', 'M'],
  ['MONSIEUR'],
  ['MADAME'],
  ['MLLE'],
  ['MME'],
  ['MR'],
  ['M'],
]

/** Words after which a transfer label holds free text, not the counterparty. */
const TRANSFER_MOTIF_MARKERS = new Set([
  'VIREMENT',
  'VIR',
  'MOTIF',
  'REF',
  'REFERENCE',
  'LIBELLE',
])

const DOMAIN =
  /^(?:WWW\.)?([A-Z0-9-]+)\.(?:COM|FR|NET|ORG|EU|IO|CO|DE|BE|ES|IT)$/
const URL_NOISE = new Set(['WWW', 'HTTP', 'HTTPS'])

// --- Entry point ------------------------------------------------------------

/**
 * Extracts the operation type, merchant, city and card date from a CIC label.
 * Never throws: unknown formats return `other` with the cleaned label as
 * merchant, and an empty label returns `other` with only nulls.
 */
export function normalizeLabel(
  rawLabel: string,
  amountCents: number,
): NormalizedLabel {
  const label = collapseSpaces(
    typeof rawLabel === 'string' ? rawLabel : '',
  ).toUpperCase()
  if (!label) return result('other', null)

  let m: RegExpExecArray | null

  if ((m = CARD_PAYMENT.exec(label))) {
    return located('card_payment', m[1] ?? null, m[2] ?? '')
  }
  if ((m = CASH_WITHDRAWAL.exec(label))) {
    return located('cash_withdrawal', m[1] ?? null, m[2] ?? '')
  }
  if ((m = DIRECT_DEBIT.exec(label))) {
    return result('direct_debit', cleanCreditor(m[1] ?? ''))
  }
  if ((m = INSTANT_TRANSFER.exec(label))) {
    return result('instant_transfer', cleanCounterparty(m[1] ?? ''))
  }
  if ((m = TRANSFER.exec(label))) {
    const type = amountCents < 0 ? 'transfer_out' : 'transfer_in'
    return result(type, cleanCounterparty(m[1] ?? ''))
  }
  if (CHEQUE_DEPOSIT.test(label)) return result('cheque_deposit', null)
  if (CHEQUE.test(label)) return result('cheque', null)
  if ((m = BANK_FEE_F.exec(label))) {
    return result('bank_fee', cleanFee(m[1] ?? ''))
  }
  if (BANK_FEE.test(label)) return result('bank_fee', cleanFee(label))
  if (INTEREST.test(label)) return result('interest', null)

  return result('other', cleanMerchant(label))
}

function result(
  operationType: OperationType,
  merchant: Merchant | null,
  city: string | null = null,
  operationDate: string | null = null,
): NormalizedLabel {
  return {
    operationType,
    merchant: merchant?.merchant ?? null,
    merchantKey: merchant?.merchantKey ?? null,
    city,
    operationDate,
  }
}

/**
 * Card payments and withdrawals: `<DDMM> <CITY> <MERCHANT> CARTE <4 digits> <ref>`.
 * The city (first token, two for `LE MANS` / `ST ETIENNE`) is only split off
 * when the date is present, i.e. when the label has the expected structure;
 * a lone token after the date is taken as the city.
 */
function located(
  type: OperationType,
  operationDate: string | null,
  rest: string,
): NormalizedLabel {
  const text = rest.replace(CARD_TRAILER, '').trim()
  if (!operationDate) return result(type, cleanMerchant(text))

  const { city, merchantText } = splitCity(text)
  return result(type, cleanMerchant(merchantText), city, operationDate)
}

function splitCity(text: string): {
  city: string | null
  merchantText: string
} {
  const tokens = splitTokens(text)
  // A well-known merchant with no city in front of it (`AMZN MKTP FR`).
  if (findAlias(text)) return { city: null, merchantText: text }
  const cityLength = CITY_PREFIXES.has(tokens[0]) && tokens.length >= 3 ? 2 : 1
  const cityTokens = tokens.slice(0, cityLength).map(cleanToken).filter(Boolean)
  return {
    city: cityTokens.length > 0 ? titleCase(cityTokens) : null,
    merchantText: tokens.slice(cityLength).join(' '),
  }
}

/**
 * `PRLV SEPA <creditor> <free text / mandate refs>`: keeps the creditor, cut
 * at the first ` -` or ` / ` separator or reference, and drops a truncated
 * one-letter last word (`MUTUELLE EXEMPLE P -PRELEV ...`).
 */
function cleanCreditor(text: string): Merchant | null {
  const head = text.split(/ [-/]|\/ /)[0].trim() || text
  const tokens = cutAtNoise(splitTokens(head))
  while (tokens.length > 1 && tokens[tokens.length - 1].length === 1) {
    tokens.pop()
  }
  return cleanMerchant(tokens.join(' '))
}

/**
 * `VIR [INST] [civility] <counterparty> [motif] <ref>`: best effort, the motif
 * is only recognized when it starts with a marker word (`VIREMENT`, `MOTIF`).
 */
function cleanCounterparty(text: string): Merchant | null {
  let tokens = cutAtNoise(splitTokens(text))

  const civility = CIVILITIES.find(
    (c) => tokens.length > c.length && c.every((word, i) => tokens[i] === word),
  )
  if (civility) tokens = tokens.slice(civility.length)

  const marker = tokens.findIndex((t) => TRANSFER_MOTIF_MARKERS.has(t))
  if (marker > 0) tokens = tokens.slice(0, marker)

  return cleanMerchant(tokens.join(' '))
}

/**
 * Bank fee description, without the variable part (dates, amounts, period):
 * `VIR. INSTANTANES EMIS DU MOI - 1 VIR, MOIS JUIN 23` → `Vir Instantanes Emis du Moi`.
 */
function cleanFee(text: string): Merchant | null {
  const head = text.split(/ - |,/)[0].trim()
  const tokens = splitTokens(head)
  const firstNumber = tokens.findIndex((t) => /\d/.test(t))
  return cleanMerchant(
    (firstNumber > 0 ? tokens.slice(0, firstNumber) : tokens).join(' '),
  )
}

/**
 * Generic merchant cleanup: aliases, processor prefixes, references, domains,
 * legal forms, then title case. Returns null when nothing meaningful is left.
 */
function cleanMerchant(text: string): Merchant | null {
  const spaced = collapseSpaces(text.replace(/[*_/\\|]/g, ' '))
  if (!spaced) return null

  const alias = findAlias(spaced)
  if (alias) return toMerchant(alias)

  let tokens = splitTokens(spaced)
  if (tokens.length > 1 && PROCESSOR_PREFIXES.has(tokens[0])) {
    tokens = tokens.slice(1)
  }
  tokens = cutAtNoise(tokens).map(cleanToken).filter(Boolean)
  if (tokens.length > 1) {
    const withoutLegalForms = tokens.filter(
      (t) => !LEGAL_FORMS.has(t.replace(/\./g, '')),
    )
    if (withoutLegalForms.length > 0) tokens = withoutLegalForms
  }
  if (tokens.length === 0) return null

  const cleanedAlias = findAlias(tokens.join(' '))
  return toMerchant(cleanedAlias ?? titleCase(tokens))
}

function toMerchant(name: string): Merchant | null {
  let merchant = name
  if (merchant.length > MAX_MERCHANT_LENGTH) {
    // Cut at the last whole word that fits.
    const cut = merchant.lastIndexOf(' ', MAX_MERCHANT_LENGTH)
    merchant = merchant.slice(0, cut > 0 ? cut : MAX_MERCHANT_LENGTH)
  }
  merchant = merchant.trim()
  const merchantKey = toMerchantKey(merchant)
  return merchantKey ? { merchant, merchantKey } : null
}

function findAlias(text: string): string | null {
  const folded = foldAccents(text).toUpperCase()
  return MERCHANT_ALIASES.find((a) => a.pattern.test(folded))?.name ?? null
}

/**
 * Truncates at the first reference or amount token (`KYVKWY8CX6NE`,
 * `1026136035454875`, `12,50`); when the label starts with one, only those
 * tokens are dropped.
 */
function cutAtNoise(tokens: string[]): string[] {
  const isNoise = (t: string) => isReference(t) || /^\d+[,.]\d+$/.test(t)
  const first = tokens.findIndex(isNoise)
  if (first > 0) return tokens.slice(0, first)
  if (first === 0) return tokens.filter((t) => !isNoise(t))
  return tokens
}

/**
 * Reference-like token (ignoring `-./`): 5+ digits, or 8+ alphanumerics with
 * at least 2 digits.
 * Short codes (`4G`, `2024`) and names with a digit (`3SUISSES`) are kept.
 */
function isReference(token: string): boolean {
  const compact = token.replace(/[-./]/g, '')
  if (/^\d{5,}$/.test(compact)) return true
  if (!/^[A-Z0-9]{8,}$/.test(compact)) return false
  return (compact.match(/\d/g)?.length ?? 0) >= 2
}

/** Strips domains to their name and surrounding punctuation from a token. */
function cleanToken(token: string): string {
  if (URL_NOISE.has(token)) return ''
  const domain = DOMAIN.exec(token)
  const core = domain ? domain[1] : token
  if (core === '&') return core
  return core.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

function titleCase(tokens: string[]): string {
  return tokens
    .map((token, index) => {
      const upper = token.toUpperCase()
      const folded = foldAccents(upper)
      if (/\d/.test(upper) || isAcronym(folded)) return upper
      if (index > 0 && LOWERCASE_WORDS.has(folded)) return upper.toLowerCase()
      return upper
        .split(/(['’-])/)
        .map((part, i, parts) => {
          // Elided articles stay lowercase: `CAFE D'ICI` → `Café d'Ici`.
          const elided =
            index > 0 && i === 0 && parts[1] !== '-' && /^[DL]$/.test(part)
          if (elided) return part.toLowerCase()
          return part.charAt(0) + part.slice(1).toLowerCase()
        })
        .join('')
    })
    .join(' ')
}

/** `SNCF`, `SFR`, `BNP` (no vowel) and a few known acronyms with vowels. */
function isAcronym(word: string): boolean {
  if (ACRONYMS.has(word)) return true
  if (NOT_ACRONYMS.has(word)) return false
  return /^[B-DF-HJ-NP-TV-XZ]{2,5}$/.test(word)
}

/** Uppercase ASCII letters and digits separated by single spaces. */
function toMerchantKey(name: string): string {
  return foldAccents(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function foldAccents(text: string): string {
  return text
    .replace(/Œ/g, 'OE')
    .replace(/œ/g, 'oe')
    .replace(/Æ/g, 'AE')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function collapseSpaces(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim()
}

function splitTokens(text: string): string[] {
  return text.split(' ').filter(Boolean)
}
