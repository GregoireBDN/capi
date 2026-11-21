import { createHash } from 'node:crypto'
import * as bcrypt from 'bcryptjs'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { BCRYPT_SALT_ROUNDS } from '#/auth/auth.constants'
import { categorize } from '#/categories/rules/categorize'
import { seedDefaultCategories } from '#/categories/seed-default-categories'
import {
  dayRange,
  exchangeLinesByDay,
  parisDayEnd,
  valueDay,
} from '#/crypto/daily-close/daily-values'
import type * as schema from '#/database/schema'
import {
  accountsTable,
  appSettingsTable,
  balanceSnapshotsTable,
  budgetsTable,
  categoriesTable,
  categorizationRulesTable,
  contactsTable,
  cryptoHoldingsTable,
  cryptoImportsTable,
  cryptoMovementsTable,
  cryptoPriceHistoryTable,
  cryptoPricesTable,
  importsTable,
  positionLinesTable,
  positionStatementsTable,
  receivablesTable,
  recurringItemsTable,
  savingsGoalAccountsTable,
  savingsGoalsTable,
  securitiesTable,
  securityPricesTable,
  type SelectCategorizationRule,
  type SelectCategory,
  transactionSplitsTable,
  transactionsTable,
  usersTable,
} from '#/database/schema'
import type { TransactionKind } from '#/database/schema/domain-enums'
import {
  CryptoCostBasisService,
  cryptoInvestedOn,
} from '#/crypto/cost-basis.service'
import { knownAsset } from '#/imports/crypto/assets'
import { computeHoldings } from '#/imports/crypto/holdings'
import { formatQuantity, parseQuantity } from '#/imports/crypto/quantity'
import { computeDedupeHashes } from '#/imports/dedupe/dedupe'
import { normalizeLabel } from '#/imports/normalize/label'
import {
  addDays,
  addMonths,
  daysInMonth,
  todayInParis,
} from '#/recurring/dates'
import { OwedService } from '#/owed/owed.service'
import { RecurringService } from '#/recurring/recurring.service'
import { TransactionsService } from '#/transactions/transactions.service'
import { MEAL_VOUCHER_DAILY_CAP_CENTS } from '#/transactions/manual-transactions.service'
import { MONTHLY_TARGET_KEY } from '#/savings/savings.service'
import { linkMatchingTransfers } from '#/transactions/transfer-links/link-transfers'
import { revalue } from '#/positions/positions.repository'

/**
 * Synthetic data for local manual testing (`pnpm db:demo`, #219): a verified
 * owner account and about 14 months of a fictional household's finances.
 * Every label, amount and name is made up; nothing comes from `data/`.
 *
 * The data goes through the app's own helpers so it behaves like imported
 * data: labels in the CIC format, merchants from `normalizeLabel`, categories
 * from the ordered rules (`categorize`), dedupe hashes from
 * `computeDedupeHashes`, running balances that pass the continuity check,
 * one committed `cic_csv` import per account and month (so `coverage/` sees
 * them), recurring items from `RecurringService.detect`.
 *
 * Deterministic: a seeded PRNG drives every choice, so the same `today`
 * gives the same data. Bank data stops `DATA_LAG_DAYS` before `today`
 * (Europe/Paris): the current month is partial and the previous one complete.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** A Drizzle database or transaction. */
export type DemoDb = Db | Tx

export const DEMO_EMAIL = 'usertest@finances.test'
export const DEMO_PASSWORD = 'usertest'
export const DEMO_NAME = 'Compte démo'

/** Months of history before the current one. */
export const DEMO_MONTHS = 14
/** Days between the last bank row and today. */
export const DATA_LAG_DAYS = 10

/** Checking balance before the first demo row. */
export const CHECKING_OPENING_CENTS = 700_000

const PRNG_SEED = 0x5eed_2026
/** Own sequence for the meal-voucher card, so the bank data stays the same. */
const MEAL_VOUCHER_SEED = 0x7e57_0298
/** Face value of one titre-restaurant (one per working day). */
const MEAL_VOUCHER_FACE_CENTS = 900
const MEAL_VOUCHER_CREDIT_LABEL = 'Crédit titres-restaurant'
const MEAL_VOUCHER_SHOPS = [
  {
    label: 'Brasserie du Marché',
    slug: 'restaurants_cafes',
    min: 1_100,
    max: 2_400,
  },
  {
    label: 'Boulangerie Démo',
    slug: 'restaurants_cafes',
    min: 650,
    max: 1_200,
  },
  { label: 'Sushi Démo', slug: 'restaurants_cafes', min: 1_400, max: 2_200 },
  { label: 'Supérette Démo', slug: 'groceries', min: 900, max: 2_500 },
] as const
const CARD = 'CARTE 4242'

export interface DemoOptions {
  /** `YYYY-MM-DD` in Europe/Paris; defaults to now. */
  today?: string
  /** bcrypt cost of the password hash (lower in specs). */
  bcryptRounds?: number
}

export interface DemoCounts {
  accounts: number
  transactions: number
  manualTransactions: number
  reviewQueue: number
  splits: number
  /** Transfers between two cash accounts linked on both sides (#296). */
  linkedTransferPairs: number
  imports: number
  snapshots: number
  rules: number
  budgets: number
  savingsGoals: number
  cryptoHoldings: number
  /** A PEA's position statements (#413). */
  positionStatements: number
  recurringItems: number
  /** Money owed (#359). */
  contacts: number
  receivables: number
}

export interface DemoResult {
  dataUntil: string
  counts: DemoCounts
}

/** True when the database already holds an account or a user. */
export async function hasExistingData(db: DemoDb): Promise<boolean> {
  const [row] = await db.execute<{ found: boolean }>(
    sql`select exists (select 1 from users) or exists (select 1 from accounts) as found`,
  )
  return Boolean(row?.found)
}

/**
 * Empties every table of the `public` schema (migrations live in the
 * `drizzle` schema and are kept). Only ever called on a database that
 * `assertDemoTarget` accepted.
 */
export async function wipeAllData(db: DemoDb): Promise<number> {
  const tables = await db.execute<{ name: string }>(
    sql`select tablename as name from pg_tables where schemaname = 'public' order by tablename`,
  )
  const names = tables.map((t) => t.name)
  if (names.length === 0) return 0
  await db.execute(
    sql.raw(
      `truncate table ${names.map((n) => `"public"."${n.replaceAll('"', '""')}"`).join(', ')} restart identity cascade`,
    ),
  )
  return names.length
}

// --- PRNG -------------------------------------------------------------------

/** mulberry32: small, fast, good enough for fake data. */
function createRandom(seed: number) {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    /** Integer in [min, max]. */
    int: (min: number, max: number) =>
      min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p,
  }
}
type Random = ReturnType<typeof createRandom>

/** Sent each month from the checking account to the exchange (#296). */
const CRYPTO_MONTHLY_CENTS = 30_000

// --- Calendar helpers -------------------------------------------------------

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

function dayIn(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = Math.min(day, daysInMonth(y, m))
  return `${month.slice(0, 7)}-${String(d).padStart(2, '0')}`
}

function lastDayOf(month: string): string {
  return dayIn(month, 31)
}

/** Monday to Friday days of a month (one titre-restaurant each). */
function workingDays(month: string): number {
  const [y, m] = month.split('-').map(Number)
  let count = 0
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const weekDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    if (weekDay !== 0 && weekDay !== 6) count++
  }
  return count
}

/**
 * The meal-voucher card (#298), entered by hand: the employer's credit on
 * the 2nd of each month (income), payments at restaurants and food shops
 * (expenses in their own categories) up to yesterday, never below zero nor
 * over the daily cap.
 */
function mealVoucherRows(
  months: readonly string[],
  yesterday: string,
): {
  bookingDate: string
  amountCents: number
  label: string
  slug: string
}[] {
  const random = createRandom(MEAL_VOUCHER_SEED)
  const rows: ReturnType<typeof mealVoucherRows> = []
  let balance = 0
  for (const month of months) {
    const creditDay = dayIn(month, 2)
    if (creditDay > yesterday) break
    const creditCents = workingDays(month) * MEAL_VOUCHER_FACE_CENTS
    rows.push({
      bookingDate: creditDay,
      amountCents: creditCents,
      label: MEAL_VOUCHER_CREDIT_LABEL,
      slug: 'meal_vouchers',
    })
    balance += creditCents
    const payments = random.int(14, 17)
    const days = Array.from({ length: payments }, () => random.int(3, 28))
      .map((day) => dayIn(month, day))
      .filter((day) => day <= yesterday)
      .sort()
    const paidByDay = new Map<string, number>()
    for (const day of days) {
      const shop = random.pick(MEAL_VOUCHER_SHOPS)
      const cents = random.int(shop.min, shop.max)
      const paid = paidByDay.get(day) ?? 0
      if (cents > balance || paid + cents > MEAL_VOUCHER_DAILY_CAP_CENTS)
        continue
      paidByDay.set(day, paid + cents)
      balance -= cents
      rows.push({
        bookingDate: day,
        amountCents: -cents,
        label: shop.label,
        slug: shop.slug,
      })
    }
  }
  return rows
}

/** `DDMM` of a card label. */
function ddmm(date: string): string {
  return `${date.slice(8, 10)}${date.slice(5, 7)}`
}

// --- Fictional catalogue ----------------------------------------------------

interface RuleSpec {
  pattern: string
  slug: string
  merchant?: string
  /** Destination account of the transfers it files (#296). */
  counterpart?: 'pea' | 'exchange'
}

/**
 * Created in this order; evaluated most specific first (#299), so `UBER EATS`
 * wins over `UBER` either way.
 */
const RULES: readonly RuleSpec[] = [
  { pattern: 'UBER EATS', slug: 'restaurants_cafes' },
  { pattern: 'UBER', slug: 'transport' },
  { pattern: 'CARREFOUR', slug: 'groceries' },
  { pattern: 'MONOPRIX', slug: 'groceries' },
  { pattern: 'PICARD', slug: 'groceries' },
  { pattern: 'NETFLIX', slug: 'subscriptions' },
  { pattern: 'SPOTIFY', slug: 'subscriptions' },
  { pattern: 'VIDEOPASS', slug: 'subscriptions' },
  { pattern: 'NUAGEHOST', slug: 'subscriptions', merchant: 'NuageHost VPS' },
  { pattern: 'SECURIX', slug: 'subscriptions', merchant: 'Securix Antivirus' },
  { pattern: 'BASIC FIT', slug: 'leisure' },
  { pattern: 'FONCIA', slug: 'rent', merchant: 'Foncia' },
  { pattern: 'EDF', slug: 'energy' },
  { pattern: 'FREE MOBILE', slug: 'telecom' },
  { pattern: 'BOUYGUES TELECOM', slug: 'telecom' },
  { pattern: 'MAIF', slug: 'insurance', merchant: 'MAIF' },
  { pattern: 'DGFIP', slug: 'taxes', merchant: 'DGFiP' },
  { pattern: 'NAVIGO', slug: 'transport', merchant: 'Navigo' },
  { pattern: 'SNCF', slug: 'transport' },
  { pattern: 'SALAIRE ACME', slug: 'salary', merchant: 'Acme' },
  { pattern: 'PRIME ACME', slug: 'salary', merchant: 'Acme' },
  { pattern: 'VERS LIVRET A', slug: 'savings_transfer' },
  { pattern: 'DEPUIS LIVRET A', slug: 'internal_transfer' },
  {
    pattern: 'VERS PEA',
    slug: 'investment_transfer',
    counterpart: 'pea',
  },
  {
    pattern: 'VERS BINANCE',
    slug: 'investment_transfer',
    counterpart: 'exchange',
  },
  {
    pattern: 'DEPUIS COMPTE COURANT',
    slug: 'savings_transfer',
  },
  {
    pattern: 'VERS COMPTE COURANT',
    slug: 'internal_transfer',
  },
  { pattern: 'COTIS EUROCOMPTE', slug: 'bank_fees' },
  { pattern: 'RETRAIT DAB', slug: 'cash_withdrawal' },
  { pattern: 'CPAM', slug: 'refunds', merchant: 'CPAM' },
  { pattern: 'CAMILLE MARTIN', slug: 'refunds', merchant: 'Camille' },
  { pattern: 'ALEX DUPONT', slug: 'refunds', merchant: 'Alex' },
  { pattern: 'PIZZERIA', slug: 'restaurants_cafes' },
  { pattern: 'PHARMACIE', slug: 'health' },
  { pattern: 'FNAC', slug: 'shopping' },
  { pattern: 'DECATHLON', slug: 'shopping' },
  { pattern: 'AMAZON', slug: 'shopping' },
  { pattern: 'UGC', slug: 'leisure' },
]

/**
 * Category of merchants no rule knows: filed by hand in older months, left
 * in the review queue when booked in the last `REVIEW_WINDOW_DAYS`.
 */
const HAND_FILED: Readonly<Record<string, string>> = {
  BIOCOOP: 'groceries',
  'LE PETIT BISTROT': 'restaurants_cafes',
  'CAFE DES ARTS': 'restaurants_cafes',
  'SUSHI KYO': 'restaurants_cafes',
  'KIOSQUE 42': 'leisure',
  DARTY: 'shopping',
  'AIR FRANCE': 'travel',
  'DR MARTIN': 'health',
  'M DUPONT': 'shared_expenses',
  INTERETS: 'other_income',
}
const REVIEW_WINDOW_DAYS = 21

const CITIES = ['PARIS', 'PARIS', 'PARIS', 'LYON', 'NANTES'] as const

// --- Rows -------------------------------------------------------------------

interface DraftRow {
  bookingDate: string
  amountCents: number
  rawLabel: string
  /** Key of `HAND_FILED` when no rule is expected to match. */
  handKey?: string
  isOneOff?: boolean
  note?: string
  /** Signed parts, by category slug. */
  split?: { slug: string; amountCents: number }[]
}

function card(
  date: string,
  merchant: string,
  amountCents: number,
  random: Random,
  extra: Partial<DraftRow> = {},
): DraftRow {
  const city = random.chance(0.6) ? `${random.pick(CITIES)} ` : ''
  return {
    bookingDate: date,
    amountCents,
    rawLabel: `PAIEMENT CB ${ddmm(date)} ${city}${merchant} ${CARD}`,
    ...extra,
  }
}

/** Checking-account rows of one month, in booking order within each day. */
function checkingMonth(
  month: string,
  index: number,
  months: number,
  random: Random,
): DraftRow[] {
  const rows: DraftRow[] = []
  const monthNumber = Number(month.slice(5, 7))
  const winter = [11, 12, 1, 2, 3].includes(monthNumber)
  const fromEnd = months - 1 - index

  // Fixed costs and income.
  rows.push({
    bookingDate: dayIn(month, 1),
    amountCents: -95_000,
    rawLabel: 'PRLV SEPA FONCIA LOYER',
  })
  // Money owed (#359), without random draws so the rest stays the same:
  // Camille pays half the rent back on the 5th of the last four months, and
  // last month's dinner with Alex and Sam, of which Alex paid his share.
  if (fromEnd <= 3) {
    rows.push({
      bookingDate: dayIn(month, 5),
      amountCents: 47_500,
      rawLabel: 'VIR SEPA CAMILLE MARTIN LOYER',
    })
  }
  if (fromEnd === 1) {
    rows.push({
      bookingDate: dayIn(month, 14),
      amountCents: -9_000,
      rawLabel: `PAIEMENT CB ${ddmm(dayIn(month, 14))} PIZZERIA NAPOLI ${CARD}`,
    })
    rows.push({
      bookingDate: dayIn(month, 18),
      amountCents: 3_000,
      rawLabel: 'VIR SEPA ALEX DUPONT RESTO',
    })
  }
  rows.push({
    bookingDate: dayIn(month, 3),
    amountCents: -(winter
      ? random.int(8_200, 9_800)
      : random.int(4_800, 6_200)),
    rawLabel: 'PRLV SEPA EDF CLIENTS PARTICULIERS',
  })
  rows.push({
    bookingDate: dayIn(month, 4),
    amountCents: -890,
    rawLabel: 'F COTIS EUROCOMPTE',
  })
  rows.push({
    bookingDate: dayIn(month, 5),
    amountCents: -1_999,
    rawLabel: 'PRLV SEPA FREE MOBILE',
  })
  rows.push({
    bookingDate: dayIn(month, 6),
    amountCents: -2_799,
    rawLabel: 'PRLV SEPA BOUYGUES TELECOM',
  })
  const netflixDate = dayIn(month, 7)
  rows.push({
    bookingDate: netflixDate,
    // Price rise four months before the end, for the price-change views.
    amountCents: fromEnd >= 4 ? -1_349 : -1_499,
    rawLabel: `PAIEMENT CB ${ddmm(netflixDate)} NETFLIX.COM ${CARD}`,
  })
  rows.push({
    bookingDate: dayIn(month, 10),
    amountCents: -3_850,
    rawLabel: 'PRLV SEPA MAIF ASSURANCE HABITATION',
  })
  const spotifyDate = dayIn(month, 12)
  rows.push({
    bookingDate: spotifyDate,
    amountCents: -1_199,
    rawLabel: `PAIEMENT CB ${ddmm(spotifyDate)} SPOTIFY ${CARD}`,
  })
  // Cancelled (« Résilier ») after last month's charge: none this month.
  if (fromEnd >= 1) {
    const videoDate = dayIn(month, 13)
    rows.push({
      bookingDate: videoDate,
      amountCents: -999,
      rawLabel: `PAIEMENT CB ${ddmm(videoDate)} PARIS VIDEOPASS ${CARD}`,
    })
  }
  // Prepaid subscriptions (#314), declared after the detection: a VPS paid
  // for 24 months, and an antivirus paid for 12 whose renewal is due at the
  // end of this month (its reminder shows).
  if (fromEnd === 10) {
    const vpsDate = dayIn(month, 8)
    rows.push({
      bookingDate: vpsDate,
      amountCents: -18_000,
      rawLabel: `PAIEMENT CB ${ddmm(vpsDate)} NUAGEHOST VPS ${CARD}`,
    })
  }
  if (fromEnd === 12) {
    const antivirusDate = dayIn(month, 28)
    rows.push({
      bookingDate: antivirusDate,
      amountCents: -5_999,
      rawLabel: `PAIEMENT CB ${ddmm(antivirusDate)} SECURIX ANTIVIRUS ${CARD}`,
    })
  }
  rows.push({
    bookingDate: dayIn(month, 15),
    amountCents: -18_500,
    rawLabel: 'PRLV SEPA DGFIP IMPOT PRELEVEMENT A LA SOURCE',
  })
  rows.push({
    bookingDate: dayIn(month, 16),
    amountCents: -2_999,
    rawLabel: 'PRLV SEPA BASIC FIT',
  })
  rows.push({
    bookingDate: dayIn(month, 20),
    amountCents: -8_880,
    rawLabel: 'PRLV SEPA NAVIGO ANNUEL',
  })
  rows.push({
    bookingDate: dayIn(month, 27),
    amountCents: 298_500,
    rawLabel: 'VIR SEPA SALAIRE ACME',
  })
  if (monthNumber === 12) {
    rows.push({
      bookingDate: dayIn(month, 27),
      amountCents: 150_000,
      rawLabel: 'VIR SEPA PRIME ACME',
      isOneOff: true,
      note: 'Prime de fin d’année',
    })
  }
  rows.push({
    bookingDate: dayIn(month, 28),
    amountCents: -40_000,
    rawLabel: 'VIR SEPA VERS LIVRET A',
  })
  rows.push({
    bookingDate: dayIn(month, 28),
    amountCents: -20_000,
    rawLabel: 'VIR SEPA VERS PEA',
  })
  // Crypto bought on the exchange (#296): 300 € sent each month.
  rows.push({
    bookingDate: dayIn(month, 4),
    amountCents: -CRYPTO_MONTHLY_CENTS,
    rawLabel: 'VIR SEPA VERS BINANCE',
  })

  // Everyday spending.
  const groceries = ['CARREFOUR MARKET', 'MONOPRIX', 'PICARD', 'BIOCOOP']
  for (let i = random.int(7, 10); i > 0; i--) {
    const merchant = random.pick(groceries)
    rows.push(
      card(
        dayIn(month, random.int(1, 28)),
        merchant,
        -random.int(1_500, 9_500),
        random,
        {
          handKey: merchant === 'BIOCOOP' ? 'BIOCOOP' : undefined,
        },
      ),
    )
  }
  const restaurants = ['LE PETIT BISTROT', 'CAFE DES ARTS', 'SUSHI KYO']
  for (let i = random.int(4, 7); i > 0; i--) {
    const date = dayIn(month, random.int(1, 28))
    if (random.chance(0.3)) {
      rows.push(card(date, 'UBER EATS', -random.int(1_800, 3_500), random))
    } else {
      const merchant = random.pick(restaurants)
      rows.push(
        card(date, merchant, -random.int(1_200, 4_500), random, {
          handKey: merchant,
        }),
      )
    }
  }
  for (let i = random.int(1, 3); i > 0; i--) {
    rows.push(
      card(
        dayIn(month, random.int(1, 28)),
        'UBER TRIP',
        -random.int(1_200, 2_800),
        random,
      ),
    )
  }
  if (index % 2 === 1) {
    rows.push(
      card(
        dayIn(month, random.int(1, 28)),
        'SNCF CONNECT',
        -random.int(4_500, 9_800),
        random,
      ),
    )
  }
  const shops = ['FNAC', 'DECATHLON', 'AMAZON.FR']
  for (let i = random.int(1, 3); i > 0; i--) {
    rows.push(
      card(
        dayIn(month, random.int(1, 28)),
        random.pick(shops),
        -random.int(1_500, 8_000),
        random,
      ),
    )
  }
  rows.push(
    card(dayIn(month, random.int(1, 28)), 'UGC CINE CITE', -1_150, random),
  )
  if (random.chance(0.6)) {
    rows.push(
      card(
        dayIn(month, random.int(1, 28)),
        'KIOSQUE 42',
        -random.int(400, 1_200),
        random,
        {
          handKey: 'KIOSQUE 42',
        },
      ),
    )
  }
  if (random.chance(0.5)) {
    rows.push(
      card(
        dayIn(month, random.int(1, 28)),
        'PHARMACIE DU CENTRE',
        -random.int(800, 2_500),
        random,
      ),
    )
  }
  if (index % 3 === 0) {
    const date = dayIn(month, random.int(1, 25))
    rows.push(
      card(date, 'DR MARTIN', -3_000, random, { handKey: 'DR MARTIN' }),
      {
        bookingDate: addDays(date, 3),
        amountCents: 2_100,
        rawLabel: 'VIR SEPA CPAM PARIS REMBOURSEMENT',
      },
    )
  }
  if (index % 2 === 0) {
    const date = dayIn(month, random.int(1, 28))
    rows.push({
      bookingDate: date,
      amountCents: -4_000,
      rawLabel: `RETRAIT DAB ${ddmm(date)} PARIS ${CARD}`,
    })
  }

  // One-offs, a withdrawal from the Livret A, a split, a shared refund.
  if (fromEnd === 7) {
    const date = dayIn(month, 9)
    rows.push(
      {
        bookingDate: date,
        amountCents: 100_000,
        rawLabel: 'VIR SEPA DEPUIS LIVRET A',
      },
      card(date, 'DARTY', -64_900, random, {
        handKey: 'DARTY',
        isOneOff: true,
        note: 'Lave-linge',
      }),
    )
  }
  if (fromEnd === 4) {
    rows.push(
      card(dayIn(month, 14), 'AIR FRANCE', -42_000, random, {
        handKey: 'AIR FRANCE',
        isOneOff: true,
        note: 'Billets pour l’été',
      }),
    )
  }
  if (fromEnd === 1) {
    rows.push(
      card(dayIn(month, 18), 'AMAZON.FR', -12_000, random, {
        split: [
          { slug: 'shopping', amountCents: -8_000 },
          { slug: 'gifts', amountCents: -4_000 },
        ],
        note: 'Dont un cadeau d’anniversaire',
      }),
    )
  }
  if (fromEnd === 0) {
    rows.push({
      bookingDate: dayIn(month, 2),
      amountCents: 2_500,
      rawLabel: 'VIR SEPA M DUPONT REMBOURSEMENT COURSES',
      handKey: 'M DUPONT',
    })
  }
  return rows
}

/** Livret A rows of one month: the checking side's transfers, mirrored. */
function savingsMonth(
  month: string,
  index: number,
  months: number,
): DraftRow[] {
  const rows: DraftRow[] = [
    {
      bookingDate: dayIn(month, 28),
      amountCents: 40_000,
      rawLabel: 'VIR SEPA DEPUIS COMPTE COURANT',
    },
  ]
  if (months - 1 - index === 7) {
    rows.push({
      bookingDate: dayIn(month, 9),
      amountCents: -100_000,
      rawLabel: 'VIR SEPA VERS COMPTE COURANT',
    })
  }
  if (month.slice(5, 7) === '12') {
    rows.push({
      bookingDate: dayIn(month, 31),
      amountCents: 21_850,
      rawLabel: `INTERETS ${month.slice(0, 4)}`,
      handKey: 'INTERETS',
    })
  }
  return rows
}

// --- Generator --------------------------------------------------------------

/**
 * Creates the demo account and data. Expects a migrated database without
 * accounts or users (see `wipeAllData`); seeds the default categories first.
 */
export async function generateDemoData(
  db: DemoDb,
  options: DemoOptions = {},
): Promise<DemoResult> {
  const today = options.today ?? todayInParis()
  const dataUntil = addDays(today, -DATA_LAG_DAYS)
  const firstMonth = addMonths(monthStart(dataUntil), -DEMO_MONTHS)
  const monthList: string[] = []
  for (let m = firstMonth; m <= dataUntil; m = addMonths(m, 1))
    monthList.push(m)
  const random = createRandom(PRNG_SEED)

  await seedDefaultCategories(db)

  // Owner account, verified, password set directly (sign-up rules don't apply).
  await db.insert(usersTable).values({
    email: DEMO_EMAIL,
    name: DEMO_NAME,
    passwordHash: await bcrypt.hash(
      DEMO_PASSWORD,
      options.bcryptRounds ?? BCRYPT_SALT_ROUNDS,
    ),
    emailVerifiedAt: new Date(),
  })

  const categories = await db.select().from(categoriesTable)
  const bySlug = new Map(categories.map((c) => [c.slug, c]))
  const categoriesById = new Map<string, SelectCategory>(
    categories.map((c) => [c.id, c]),
  )
  const category = (slug: string): SelectCategory => {
    const found = bySlug.get(slug)
    if (!found) throw new Error(`Missing default category ${slug}`)
    return found
  }

  // Accounts.
  const accountRows = await db
    .insert(accountsTable)
    .values([
      {
        name: 'Compte courant',
        type: 'checking',
        institution: 'CIC',
        position: 0,
      },
      { name: 'Livret A', type: 'savings', institution: 'CIC', position: 1 },
      {
        name: 'PEA',
        type: 'brokerage',
        institution: 'Courtier Démo',
        position: 2,
        // Its 5 years fall within the next year or so (#413).
        openedOn: `${Number(today.slice(0, 4)) - 4}-03-12`,
      },
      {
        name: 'Assurance vie',
        type: 'life_insurance',
        institution: 'Assureur Démo',
        position: 3,
      },
      {
        name: 'PEE Acme',
        type: 'employee_savings',
        institution: 'Épargne Démo',
        position: 4,
      },
      {
        name: 'Ledger',
        type: 'crypto',
        cryptoSource: 'manual',
        position: 5,
      },
      {
        name: 'Titres-restaurant',
        type: 'meal_voucher',
        institution: 'Carte Démo',
        position: 6,
      },
      {
        name: 'Binance',
        type: 'crypto',
        cryptoSource: 'exchange',
        cryptoProvider: 'binance',
        position: 7,
      },
    ])
    .returning()
  const [
    checking,
    livret,
    pea,
    lifeInsurance,
    employeeSavings,
    crypto,
    mealVoucher,
    exchange,
  ] = accountRows

  // Rules, in creation order (evaluated most specific first, #299).
  const rules: SelectCategorizationRule[] = await db
    .insert(categorizationRulesTable)
    .values(
      RULES.map((rule, i) => ({
        position: i,
        matchType: 'contains' as const,
        labelPattern: rule.pattern,
        categoryId: category(rule.slug).id,
        merchant: rule.merchant ?? null,
        counterpartAccountId:
          rule.counterpart === 'pea'
            ? pea.id
            : rule.counterpart === 'exchange'
              ? exchange.id
              : null,
      })),
    )
    .returning()

  // Bank rows, imports and running balances.
  const reviewFrom = addDays(dataUntil, -REVIEW_WINDOW_DAYS)
  let transactionCount = 0
  let reviewCount = 0
  let splitCount = 0
  let importCount = 0
  const bankRowIds: string[] = []
  const feeds = [
    {
      account: checking,
      slug: 'compte-courant',
      openingCents: CHECKING_OPENING_CENTS,
      rows: monthList.map((m, i) =>
        checkingMonth(m, i, monthList.length, random),
      ),
    },
    {
      account: livret,
      slug: 'livret-a',
      openingCents: 600_000,
      rows: monthList.map((m, i) => savingsMonth(m, i, monthList.length)),
    },
  ]
  for (const feed of feeds) {
    const all = feed.rows
      .flatMap((rows, monthIndex) => rows.map((row) => ({ row, monthIndex })))
      .filter(
        ({ row }) =>
          row.bookingDate >= firstMonth && row.bookingDate <= dataUntil,
      )
      // Stable: same-day rows keep their order.
      .sort((a, b) =>
        a.row.bookingDate < b.row.bookingDate
          ? -1
          : a.row.bookingDate > b.row.bookingDate
            ? 1
            : 0,
      )
    const hashes = computeDedupeHashes(all.map(({ row }) => row))

    const importIds = new Map<number, string>()
    for (const [monthIndex, month] of monthList.entries()) {
      const count = all.filter((r) => r.monthIndex === monthIndex).length
      const periodEnd =
        month === monthStart(dataUntil) ? dataUntil : lastDayOf(month)
      const fileName = `demo-${feed.slug}-${month.slice(0, 7)}.csv`
      const [created] = await db
        .insert(importsTable)
        .values({
          accountId: feed.account.id,
          source: 'cic_csv',
          fileName,
          fileHash: createHash('sha256').update(fileName).digest('hex'),
          periodStart: month,
          periodEnd,
          rowCount: count,
          newCount: count,
          insertedCount: count,
          committedAt: new Date(`${addDays(periodEnd, 1)}T09:00:00Z`),
        })
        .returning({ id: importsTable.id })
      importIds.set(monthIndex, created.id)
      importCount++
    }

    let balance = feed.openingCents
    const values = all.map(({ row, monthIndex }, i) => {
      balance += row.amountCents
      const normalized = normalizeLabel(row.rawLabel, row.amountCents)
      const match = categorize(
        {
          accountId: feed.account.id,
          rawLabel: row.rawLabel,
          merchant: normalized.merchant,
          amountCents: row.amountCents,
        },
        rules,
        categoriesById,
      )
      let categoryId = match?.categoryId ?? null
      let kind: TransactionKind =
        match?.kind ?? (row.amountCents > 0 ? 'income' : 'expense')
      let needsReview = match === null
      if (!match && row.handKey && row.bookingDate < reviewFrom) {
        const filed = category(HAND_FILED[row.handKey])
        categoryId = filed.id
        kind = filed.kind
        needsReview = false
      }
      if (row.split) {
        const largest = [...row.split].sort(
          (a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents),
        )[0]
        categoryId = category(largest.slug).id
        kind = category(largest.slug).kind
        needsReview = false
      }
      if (needsReview) reviewCount++
      return {
        accountId: feed.account.id,
        importId: importIds.get(monthIndex)!,
        bookingDate: row.bookingDate,
        valueDate: row.bookingDate,
        amountCents: row.amountCents,
        balanceAfterCents: balance,
        rawLabel: row.rawLabel,
        merchant:
          (match?.merchant ?? normalized.merchant)?.slice(0, 255) ?? null,
        kind,
        categoryId,
        ruleId: match && !row.split ? match.ruleId : null,
        needsReview,
        isOneOff: row.isOneOff ?? false,
        note: row.note ?? null,
        counterpartAccountId: match?.counterpartAccountId ?? null,
        dedupeHash: hashes[i],
      }
    })
    const inserted = await db
      .insert(transactionsTable)
      .values(values)
      .returning({ id: transactionsTable.id })
    transactionCount += inserted.length
    bankRowIds.push(...inserted.map((row) => row.id))

    for (const [i, { row }] of all.entries()) {
      if (!row.split) continue
      await db.insert(transactionSplitsTable).values(
        row.split.map((part, position) => ({
          transactionId: inserted[i].id,
          categoryId: category(part.slug).id,
          amountCents: part.amountCents,
          position,
        })),
      )
      splitCount++
    }
  }

  // The two sides of the checking ↔ Livret A transfers, as an import links them.
  const linkedTransferPairs = await linkMatchingTransfers(db, bankRowIds)

  // A manual transaction noted after the last export.
  const manualDate = addDays(dataUntil, Math.min(4, DATA_LAG_DAYS))
  await db.insert(transactionsTable).values({
    accountId: checking.id,
    bookingDate: manualDate,
    valueDate: manualDate,
    amountCents: -2_340,
    rawLabel: 'Marché du dimanche',
    merchant: 'Marché du dimanche',
    kind: 'expense',
    categoryId: category('groceries').id,
    manual: true,
    dedupeHash: `manual:${createHash('sha256').update(`demo-manual-${manualDate}`).digest('hex').slice(0, 32)}`,
  })

  // The meal-voucher card, every row entered by hand (#298).
  const voucherRows = mealVoucherRows(monthList, addDays(today, -1))
  if (voucherRows.length > 0) {
    await db.insert(transactionsTable).values(
      voucherRows.map((row, i) => {
        const filed = category(row.slug)
        return {
          accountId: mealVoucher.id,
          bookingDate: row.bookingDate,
          valueDate: row.bookingDate,
          amountCents: row.amountCents,
          rawLabel: row.label,
          merchant: row.label,
          kind: filed.kind,
          categoryId: filed.id,
          manual: true,
          dedupeHash: `manual:${createHash('sha256').update(`demo-voucher-${i}-${row.bookingDate}`).digest('hex').slice(0, 32)}`,
        }
      }),
    )
  }

  // Investment values: one snapshot per month end, contributions alongside.
  let snapshotCount = 0
  const investments = [
    {
      account: pea,
      value: 1_200_000,
      contributions: 1_100_000,
      monthly: 20_000,
      drift: [-0.03, 0.04],
      // Fed by the linked « VIR SEPA VERS PEA » transfers (#296): the
      // contributions are typed once, on a statement before the first one.
      linked: true,
    },
    {
      account: lifeInsurance,
      value: 800_000,
      contributions: 750_000,
      monthly: 0,
      drift: [0.001, 0.003],
    },
    {
      account: employeeSavings,
      value: 350_000,
      contributions: 320_000,
      monthly: 10_000,
      drift: [-0.02, 0.03],
    },
  ] as const
  // The PEA's last months come from its lines (#413, ADR 0006): monthly
  // statements of three synthetic ETFs, its values computed from them.
  const statementDays = monthList
    .map(lastDayOf)
    .filter((day) => day <= dataUntil)
    .slice(-PEA_STATEMENT_MONTHS)
  let peaValueAtFirstStatement = 0
  for (const investment of investments) {
    let value: number = investment.value
    let contributions: number = investment.contributions
    const linked = 'linked' in investment && investment.linked
    const snapshots: (typeof balanceSnapshotsTable.$inferInsert)[] = []
    if (linked) {
      snapshots.push({
        accountId: investment.account.id,
        date: addDays(monthList[0], -1),
        valueCents: value,
        contributionsCents: contributions,
      })
    }
    for (const month of monthList) {
      const date = lastDayOf(month)
      if (date > dataUntil) break
      const [low, high] = investment.drift
      value =
        Math.round(value * (1 + low + (high - low) * random.next())) +
        investment.monthly
      contributions += investment.monthly
      if (investment.account.id === pea.id && date >= statementDays[0]) {
        if (date === statementDays[0]) peaValueAtFirstStatement = value
        continue
      }
      snapshots.push({
        accountId: investment.account.id,
        date,
        valueCents: value,
        contributionsCents: linked ? null : contributions,
      })
    }
    await db.insert(balanceSnapshotsTable).values(snapshots)
    snapshotCount += snapshots.length
  }
  const peaLines = await seedPeaPositions(db, {
    accountId: pea.id,
    days: statementDays,
    startValueCents: peaValueAtFirstStatement,
    monthlyCents: 20_000,
    today,
    random,
  })
  snapshotCount += peaLines.values

  // Crypto (#296, #373): the euros sent to Binance buy BTC and ETH there;
  // every fourth month the coins go to the Ledger (a manual account whose
  // lines record what arrived), each arrival linked to its withdrawal so
  // its cost follows. Last month the Ledger sent BTC back to Binance, sold
  // there (a realised gain, the euros waiting), and 0,01 BTC arrived on it
  // from elsewhere (« À préciser »). Prices are manual (no price API).
  const prices: Record<string, string> = {
    bitcoin: '82500.00',
    ethereum: '2950.00',
  }
  // The change over 24 hours the Crypto page shows per asset (#295).
  const changes: Record<string, string> = { bitcoin: '2.4', ethereum: '-1.8' }
  const btc = knownAsset('BTC')!
  const eth = knownAsset('ETH')!
  const [cryptoImport] = await db
    .insert(cryptoImportsTable)
    .values({
      accountId: exchange.id,
      format: 'binance_csv',
      fileName: 'demo-binance.csv',
      fileHash: createHash('sha256').update('demo-binance').digest('hex'),
      committedAt: new Date(`${dataUntil}T09:00:00Z`),
    })
    .returning({ id: cryptoImportsTable.id })
  const movementRows: (typeof cryptoMovementsTable.$inferInsert)[] = []
  // Quantities in units of 10^-4, written as exact decimal strings.
  const units = (n: number) =>
    `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 10_000)}.${String(Math.abs(n) % 10_000).padStart(4, '0')}`
  const move = (
    at: string,
    kind: (typeof cryptoMovementsTable.$inferInsert)['kind'],
    operation: string,
    asset: string,
    quantity: string,
  ) =>
    movementRows.push({
      accountId: exchange.id,
      importId: cryptoImport.id,
      occurredAt: new Date(at),
      wallet: 'Spot',
      operation,
      kind,
      asset,
      quantity,
      eurCents: null,
      dedupeHash: createHash('sha256')
        .update(`demo-binance-${movementRows.length}`)
        .digest('hex'),
    })
  let btcSince = 0
  let ethSince = 0
  const sent: { at: string; asset: string; quantity: number }[] = []
  for (const [index, month] of monthList.entries()) {
    const day = dayIn(month, 5)
    if (day > dataUntil) break
    move(`${day}T09:00:00Z`, 'deposit', 'Deposit', 'EUR', units(3_000_000))
    move(`${day}T09:05:00Z`, 'buy', 'Buy', 'EUR', units(-2_000_000))
    move(`${day}T09:05:00Z`, 'buy', 'Buy', 'BTC', units(28 + (index % 3)))
    move(`${day}T09:06:00Z`, 'buy', 'Buy', 'EUR', units(-1_000_000))
    move(`${day}T09:06:00Z`, 'buy', 'Buy', 'ETH', units(350 + 10 * (index % 4)))
    btcSince += 28 + (index % 3)
    ethSince += 350 + 10 * (index % 4)
    const withdrawal = dayIn(month, 20)
    if (index % 4 === 3 && withdrawal <= dataUntil) {
      move(
        `${withdrawal}T16:00:00Z`,
        'withdrawal',
        'Withdraw',
        'BTC',
        units(-btcSince),
      )
      move(
        `${withdrawal}T16:30:00Z`,
        'withdrawal',
        'Withdraw',
        'ETH',
        units(-ethSince),
      )
      sent.push({
        at: `${withdrawal}T16:00:00Z`,
        asset: 'BTC',
        quantity: btcSince,
      })
      sent.push({
        at: `${withdrawal}T16:30:00Z`,
        asset: 'ETH',
        quantity: ethSince,
      })
      btcSince = 0
      ethSince = 0
    }
  }
  // The Ledger sends 0,005 BTC back to Binance, sold there for euros.
  const backDay = addDays(dataUntil, -12)
  const ledgerBtc = sent
    .filter((s) => s.asset === 'BTC' && s.at < `${backDay}T00:00:00Z`)
    .reduce((sum, s) => sum + s.quantity, 0)
  const back = ledgerBtc >= 50 ? 50 : 0
  if (back > 0) {
    move(`${backDay}T11:00:00Z`, 'deposit', 'Deposit', 'BTC', units(back))
    move(
      `${addDays(backDay, 1)}T10:00:00Z`,
      'sell',
      'Transaction Sold',
      'BTC',
      units(-back),
    )
    move(
      `${addDays(backDay, 1)}T10:00:00Z`,
      'sell',
      'Transaction Revenue',
      'EUR',
      units(4_150_000),
    )
  }
  const movements = await db
    .insert(cryptoMovementsTable)
    .values(movementRows)
    .returning({
      id: cryptoMovementsTable.id,
      occurredAt: cryptoMovementsTable.occurredAt,
      kind: cryptoMovementsTable.kind,
      asset: cryptoMovementsTable.asset,
      quantity: cryptoMovementsTable.quantity,
      eurCents: cryptoMovementsTable.eurCents,
    })
  const exchangeHoldings = computeHoldings(
    movements.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
    })),
    knownAsset,
  )

  // The Ledger's arrivals, as its line edits record them (#373): first read
  // empty on the first day, then each withdrawal seen two hours later.
  let observedAt = new Date(`${dayIn(monthList[0], 1)}T08:00:00Z`)
  const ledgerRows: (typeof cryptoMovementsTable.$inferInsert)[] = []
  const observe = (at: Date, asset: string, quantity: number) => {
    const known = knownAsset(asset)!
    ledgerRows.push({
      accountId: crypto.id,
      occurredAt: at,
      observedSince: observedAt,
      operation: 'manual_edit',
      kind: quantity > 0 ? 'observed_in' : 'observed_out',
      asset: known.symbol,
      assetId: known.assetId,
      quantity: units(quantity),
      dedupeHash: `observed:demo-${ledgerRows.length}`,
    })
    observedAt = at
  }
  for (const s of sent) {
    observe(new Date(Date.parse(s.at) + 2 * 3_600_000), s.asset, s.quantity)
  }
  if (back > 0) observe(new Date(`${backDay}T12:00:00Z`), 'BTC', -back)
  // 0,01 BTC from a wallet the app does not follow: its cost to give.
  const giftAt = new Date(`${addDays(dataUntil, -5)}T18:00:00Z`)
  if (giftAt > observedAt) observe(giftAt, 'BTC', 100)
  const observed = await db
    .insert(cryptoMovementsTable)
    .values(ledgerRows)
    .returning({
      id: cryptoMovementsTable.id,
      occurredAt: cryptoMovementsTable.occurredAt,
      kind: cryptoMovementsTable.kind,
      asset: cryptoMovementsTable.asset,
    })
  await db
    .update(accountsTable)
    .set({ cryptoObservedAt: observedAt })
    .where(eq(accountsTable.id, crypto.id))
  // Each arrival is the coins of its withdrawal; the departure is the
  // deposit on Binance.
  const costBasis = new CryptoCostBasisService({ db } as never)
  const withdrawalRows = movements.filter((row) => row.kind === 'withdrawal')
  for (const [i, row] of withdrawalRows.entries()) {
    await costBasis.writeLink(db, row.id, observed[i].id, 'auto')
  }
  const departure = observed.find((row) => row.kind === 'observed_out')
  const deposit = movements.find(
    (row) => row.kind === 'deposit' && row.asset === 'BTC',
  )
  if (departure && deposit) {
    await costBasis.writeLink(db, departure.id, deposit.id, 'auto')
  }
  const ledger = new Map<string, bigint>()
  for (const row of ledgerRows) {
    ledger.set(
      row.assetId!,
      (ledger.get(row.assetId!) ?? 0n) + parseQuantity(row.quantity as string)!,
    )
  }
  const holdings = [btc, eth]
    .filter((asset) => (ledger.get(asset.assetId) ?? 0n) > 0n)
    .map((asset) => ({
      assetId: asset.assetId,
      symbol: asset.symbol,
      name: asset.name,
      quantity: formatQuantity(ledger.get(asset.assetId)!),
    }))
  await db.insert(cryptoHoldingsTable).values([
    ...holdings.map((h) => ({
      ...h,
      accountId: crypto.id,
      location: 'Ledger Nano',
      origin: 'manual' as const,
    })),
    ...exchangeHoldings
      .filter((h) => h.status === 'ok')
      .map((h) => ({
        accountId: exchange.id,
        assetId: h.assetId!,
        symbol: h.symbol,
        name: h.name ?? h.symbol,
        quantity: h.quantity,
        location: '',
        investedCents: h.investedCents,
        origin: 'import' as const,
      })),
  ])
  await db
    .insert(cryptoPricesTable)
    .values(
      Object.entries(prices).map(([assetId, priceEur]) => ({
        assetId,
        priceEur,
        change24hPercent: changes[assetId] ?? null,
        source: 'manual' as const,
        fetchedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: cryptoPricesTable.assetId,
      set: {
        priceEur: sql`excluded.price_eur`,
        change24hPercent: sql`excluded.change_24h_percent`,
        source: 'manual',
        fetchedAt: new Date(),
      },
    })
  // Crypto values (#366): computed, one per day, from seeded daily prices
  // (a random walk ending at the manual prices: no price API call) and what
  // each account held at the end of the day (the euros waiting on Binance
  // included), as the daily close writes them; today's value is live,
  // never stored. Their invested amount is computed on read (#370).
  const yesterday = addDays(today, -1)
  const firstCryptoDay = dayIn(monthList[0], 5)
  const priceDays = dayRange(firstCryptoDay, yesterday)
  const dayPrices = new Map<string, Map<string, string>>()
  const priceRows: (typeof cryptoPriceHistoryTable.$inferInsert)[] = []
  for (const [assetId, target] of Object.entries(prices)) {
    const byDay = new Map<string, string>()
    let cents = Math.round(Number(target) * 100)
    for (const day of [...priceDays].reverse()) {
      const price = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
      byDay.set(day, price)
      priceRows.push({ assetId, day, priceEur: price, source: 'manual' })
      cents = Math.max(100, Math.round(cents / (0.97 + 0.06 * random.next())))
    }
    dayPrices.set(assetId, byDay)
  }
  for (let i = 0; i < priceRows.length; i += 500) {
    await db.insert(cryptoPriceHistoryTable).values(priceRows.slice(i, i + 500))
  }
  const pricesOn = (day: string) =>
    new Map(
      [...dayPrices].map(([assetId, byDay]) => [assetId, byDay.get(day)!]),
    )
  const basis = await costBasis.load(db)
  const cryptoPoints: (typeof balanceSnapshotsTable.$inferInsert)[] = []
  // The exchange: its movements, day by day.
  const exchangeLines = exchangeLinesByDay(
    movements.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
    })),
    knownAsset,
    priceDays,
  )
  const started = { exchange: false, ledger: false }
  for (const day of priceDays) {
    const exchangeValue = valueDay(exchangeLines.get(day) ?? [], pricesOn(day))
    const fiat = cryptoInvestedOn(basis, exchange.id, day)?.fiatCents ?? 0
    if (
      exchangeValue &&
      (started.exchange || exchangeValue.valueCents + fiat > 0)
    ) {
      started.exchange = true
      cryptoPoints.push({
        accountId: exchange.id,
        date: day,
        valueCents: exchangeValue.valueCents + fiat,
        source: 'computed',
      })
    }
    const end = parisDayEnd(day).getTime()
    const held = new Map<string, bigint>()
    for (const row of ledgerRows) {
      if ((row.occurredAt as Date).getTime() >= end) continue
      held.set(
        row.assetId!,
        (held.get(row.assetId!) ?? 0n) + parseQuantity(row.quantity as string)!,
      )
    }
    if (held.size === 0) continue
    const ledgerValue = valueDay(
      [...held].map(([assetId, quantity]) => ({
        assetId,
        quantity: formatQuantity(quantity),
        investedCents: null,
      })),
      pricesOn(day),
    )
    if (!ledgerValue || (!started.ledger && ledgerValue.valueCents === 0)) {
      continue
    }
    started.ledger = true
    cryptoPoints.push({
      accountId: crypto.id,
      date: day,
      valueCents: ledgerValue.valueCents,
      source: 'computed',
    })
  }
  for (let i = 0; i < cryptoPoints.length; i += 500) {
    await db
      .insert(balanceSnapshotsTable)
      .values(cryptoPoints.slice(i, i + 500))
  }
  snapshotCount += cryptoPoints.length

  // Budgets from the first month, some tracked; groceries raised later.
  const budgetSpecs: [string, number, boolean, string | null][] = [
    ['rent', 95_000, false, null],
    ['groceries', 45_000, true, null],
    ['restaurants_cafes', 18_000, true, 'Deux restaurants par semaine max'],
    ['transport', 15_000, true, null],
    ['shopping', 15_000, false, null],
    ['leisure', 8_000, false, null],
    ['subscriptions', 4_500, false, null],
    ['energy', 8_000, false, null],
    ['telecom', 5_000, false, null],
    ['health', 4_000, false, null],
  ]
  const budgetValues: (typeof budgetsTable.$inferInsert)[] = budgetSpecs.map(
    ([slug, monthlyTargetCents, tracked, note]) => ({
      categoryId: category(slug).id,
      effectiveFrom: firstMonth,
      monthlyTargetCents,
      tracked,
      note,
    }),
  )
  budgetValues.push({
    categoryId: category('groceries').id,
    effectiveFrom: addMonths(monthStart(dataUntil), -3),
    monthlyTargetCents: 50_000,
    tracked: true,
  })
  // Planned income (#315): the salary and the meal-voucher credit; benefits
  // and interest stay outside the plan.
  budgetValues.push(
    {
      categoryId: category('salary').id,
      effectiveFrom: firstMonth,
      monthlyTargetCents: 298_500,
      note: 'Estimation, à corriger avec la fiche de paie',
    },
    {
      categoryId: category('meal_vouchers').id,
      effectiveFrom: firstMonth,
      monthlyTargetCents: 19_000,
      note: 'Selon les jours travaillés',
    },
  )
  await db.insert(budgetsTable).values(budgetValues)

  // Savings target and goals.
  await db
    .insert(appSettingsTable)
    .values({ key: MONTHLY_TARGET_KEY, value: 60_000 })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: 60_000 },
    })
  const goals = await db
    .insert(savingsGoalsTable)
    .values([
      {
        name: 'Épargne de précaution',
        targetCents: 1_000_000,
        source: 'accounts',
        color: '#0284c7',
      },
      {
        name: 'Voyage au Japon',
        targetCents: 400_000,
        targetDate: addMonths(monthStart(today), 8),
        source: 'manual',
        manualAmountCents: 120_000,
        color: '#db2777',
      },
      {
        name: 'Apport immobilier',
        targetCents: 5_000_000,
        targetDate: addMonths(monthStart(today), 60),
        source: 'accounts',
        color: '#15803d',
      },
    ])
    .returning()
  await db.insert(savingsGoalAccountsTable).values([
    { goalId: goals[0].id, accountId: livret.id },
    { goalId: goals[2].id, accountId: pea.id },
    { goalId: goals[2].id, accountId: lifeInsurance.id },
  ])

  // Recurring items, as the app detects them; the usual ones confirmed.
  await new RecurringService({ db } as never).detect(today)
  const confirmSlugs = [
    'rent',
    'subscriptions',
    'telecom',
    'insurance',
    'salary',
    'energy',
    'meal_vouchers',
  ]
  await db
    .update(recurringItemsTable)
    .set({ status: 'confirmed' })
    .where(
      inArray(
        recurringItemsTable.categoryId,
        confirmSlugs.map((slug) => category(slug).id),
      ),
    )
  // Two cancellations (#270): one already over (the day after its last
  // charge), one from after next month's charge (Spotify, the 12th).
  const subscriptionItems = await db
    .select({
      id: recurringItemsTable.id,
      merchantKey: recurringItemsTable.merchantKey,
      lastSeenDate: recurringItemsTable.lastSeenDate,
    })
    .from(recurringItemsTable)
    .where(
      inArray(recurringItemsTable.categoryId, [category('subscriptions').id]),
    )
  for (const item of subscriptionItems) {
    const endedOn = item.merchantKey.includes('VIDEOPASS')
      ? addDays(item.lastSeenDate, 1)
      : item.merchantKey.includes('SPOTIFY')
        ? dayIn(addMonths(monthStart(today), 1), 13)
        : null
    if (endedOn === null) continue
    await db
      .update(recurringItemsTable)
      .set({ endedOn })
      .where(eq(recurringItemsTable.id, item.id))
  }
  // The prepaid plans (#314), declared from their payment as in the app.
  const recurring = new RecurringService({ db } as never)
  for (const [pattern, termMonths] of [
    ['NUAGEHOST', 24],
    ['SECURIX', 12],
  ] as const) {
    const [payment] = await db
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(sql`${transactionsTable.rawLabel} like ${`%${pattern}%`}`)
      .limit(1)
    if (payment) {
      await recurring.declarePrepaid(
        { transactionId: payment.id, termMonths },
        today,
      )
    }
  }
  const owedCounts = await seedMoneyOwed(db, recurring, {
    rentCategoryId: category('rent').id,
    leisureCategoryId: category('leisure').id,
    dataUntil,
  })
  const [{ count: recurringItems }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recurringItemsTable)
  return {
    dataUntil,
    counts: {
      accounts: accountRows.length,
      transactions: transactionCount + 1 + voucherRows.length,
      manualTransactions: 1 + voucherRows.length,
      reviewQueue: reviewCount,
      splits: splitCount,
      linkedTransferPairs,
      imports: importCount,
      snapshots: snapshotCount,
      rules: rules.length,
      budgets: budgetValues.length,
      savingsGoals: goals.length,
      cryptoHoldings: holdings.length,
      positionStatements: peaLines.statements,
      recurringItems,
      ...owedCounts,
    },
  }
}

/**
 * Money owed (#359), through the app's own service: the rent shared 50/50
 * with Camille for the last four months (her transfers linked, the latest
 * left for the review queue's suggestion), last month's dinner with Alex and
 * Sam (Alex paid, Sam's share let go), and a concert Sam paid for the owner
 * (his part still owed). Synthetic names only.
 */
async function seedMoneyOwed(
  db: DemoDb,
  recurring: RecurringService,
  ids: { rentCategoryId: string; leisureCategoryId: string; dataUntil: string },
): Promise<{ contacts: number; receivables: number }> {
  const owed = new OwedService(
    { db } as never,
    new TransactionsService({ db } as never),
    recurring,
  )
  const byLabel = async (pattern: string) =>
    db
      .select({
        id: transactionsTable.id,
        bookingDate: transactionsTable.bookingDate,
        amountCents: transactionsTable.amountCents,
      })
      .from(transactionsTable)
      .where(sql`${transactionsTable.rawLabel} like ${`%${pattern}%`}`)
      .orderBy(asc(transactionsTable.bookingDate))

  const [rent] = await db
    .select({ id: recurringItemsTable.id })
    .from(recurringItemsTable)
    .where(
      and(
        eq(recurringItemsTable.categoryId, ids.rentCategoryId),
        eq(recurringItemsTable.status, 'confirmed'),
      ),
    )
  const camilleTransfers = await byLabel('CAMILLE MARTIN')
  if (rent && camilleTransfers.length > 0) {
    const share = await owed.setRecurringShare(rent.id, {
      contactName: 'Camille',
      bps: 5_000,
      from: monthStart(camilleTransfers[0].bookingDate),
    })
    await owed.updateContact(share.contactId, {
      matchLabels: ['CAMILLE MARTIN'],
      repaymentDay: 5,
    })
    for (const transfer of camilleTransfers.slice(0, -1)) {
      const options = await owed.repaymentOptions(transfer.id, share.contactId)
      if (options.suggestion.length === 0) continue
      await owed.linkRepayment({
        transactionId: transfer.id,
        items: options.suggestion,
      })
    }
  }

  const [dinner] = await byLabel('PIZZERIA NAPOLI')
  const [fromAlex] = await byLabel('ALEX DUPONT')
  if (dinner) {
    const shared = await owed.createShares({
      transactionId: dinner.id,
      shares: [
        { contactName: 'Alex', amountCents: 3_000 },
        { contactName: 'Sam', amountCents: 3_000 },
      ],
    })
    const alex = shared.shares.find((s) => s.contactName === 'Alex')!
    const sam = shared.shares.find((s) => s.contactName === 'Sam')!
    await owed.updateContact(alex.contactId, { matchLabels: ['ALEX DUPONT'] })
    if (fromAlex) {
      await owed.linkRepayment({
        transactionId: fromAlex.id,
        items: [{ receivableId: alex.id, amountCents: 3_000 }],
      })
    }
    await owed.forgive(sam.id, { note: 'Pour son anniversaire' })
  }

  // « Payé pour moi »: Sam paid a concert for three.
  await owed.createDebt({
    contactName: 'Sam',
    billCents: 9_000,
    partCents: 3_000,
    categoryId: ids.leisureCategoryId,
    bookingDate: addDays(ids.dataUntil, -3),
    label: 'Concert',
    note: 'Billets pris par Sam',
  })

  const [{ contacts }] = await db
    .select({ contacts: sql<number>`count(*)::int` })
    .from(contactsTable)
  const [{ receivables }] = await db
    .select({ receivables: sql<number>`count(*)::int` })
    .from(receivablesTable)
  return { contacts, receivables }
}

/** Months of the demo PEA given by its lines (#413). */
const PEA_STATEMENT_MONTHS = 6

/** Synthetic ETFs: `ZZ…` ISINs (valid check digits, never a real one). */
const DEMO_SECURITIES = [
  {
    isin: 'ZZ00MSCIWD03',
    name: 'ETF Monde (démo)',
    ticker: 'MOND',
    share: 0.7,
    priceCents: 49_832,
    costRatio: 0.83,
    drift: [-0.03, 0.045],
  },
  {
    isin: 'ZZ00EMMKT008',
    name: 'ETF Émergents (démo)',
    ticker: 'EMER',
    share: 0.18,
    priceCents: 2_607,
    costRatio: 0.93,
    drift: [-0.05, 0.05],
  },
  {
    isin: 'ZZ00STOXX608',
    name: 'ETF Europe 600 (démo)',
    ticker: 'EURO',
    share: 0.11,
    priceCents: 11_246,
    costRatio: 1.06,
    drift: [-0.04, 0.035],
  },
] as const

/** Integer cents as an exact euro decimal string (`49832` → `"498.32"`). */
function centsText(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

/**
 * The demo PEA's lines (#413): one statement per month end, its ETFs at that
 * day's price, the monthly transfer buying more of the first one, the PRU as
 * a weighted average; then its values computed from them (`revalue`).
 */
async function seedPeaPositions(
  db: DemoDb,
  options: {
    accountId: string
    days: readonly string[]
    startValueCents: number
    monthlyCents: number
    today: string
    random: { next(): number }
  },
): Promise<{ statements: number; values: number }> {
  if (options.days.length === 0) return { statements: 0, values: 0 }
  await db
    .insert(securitiesTable)
    .values(
      DEMO_SECURITIES.map(({ isin, name, ticker }) => ({ isin, name, ticker })),
    )
    .onConflictDoNothing({ target: securitiesTable.isin })
  const securities = await db
    .select({ id: securitiesTable.id, isin: securitiesTable.isin })
    .from(securitiesTable)
    .where(
      inArray(
        securitiesTable.isin,
        DEMO_SECURITIES.map((security) => security.isin),
      ),
    )
  const idOf = new Map(securities.map((row) => [row.isin, row.id]))
  const held = DEMO_SECURITIES.map((security) => {
    const budget = Math.round(options.startValueCents * security.share)
    const quantity = Math.max(1, Math.floor(budget / security.priceCents))
    return {
      isin: security.isin,
      drift: security.drift,
      price: security.priceCents as number,
      quantity,
      costCents: Math.round(
        quantity * security.priceCents * security.costRatio,
      ),
    }
  })
  let cash = Math.max(
    0,
    options.startValueCents -
      held.reduce((sum, line) => sum + line.quantity * line.price, 0),
  )
  for (const [i, day] of options.days.entries()) {
    if (i > 0) {
      for (const line of held) {
        const [low, high] = line.drift
        line.price = Math.max(
          100,
          Math.round(
            line.price * (1 + low + (high - low) * options.random.next()),
          ),
        )
      }
      // The month's transfer buys whole units of the first ETF.
      cash += options.monthlyCents
      const first = held[0]
      const bought = Math.floor(cash / first.price)
      first.quantity += bought
      first.costCents += bought * first.price
      cash -= bought * first.price
    }
    const [statement] = await db
      .insert(positionStatementsTable)
      .values({
        accountId: options.accountId,
        asOf: day,
        cashCents: cash,
        source: i === options.days.length - 1 ? 'mcp' : 'typed',
      })
      .returning({ id: positionStatementsTable.id })
    await db.insert(positionLinesTable).values(
      held.map((line) => ({
        statementId: statement.id,
        securityId: idOf.get(line.isin)!,
        quantity: String(line.quantity),
        // PRU to the 1/10 000 of a euro, as statements print it.
        unitCostEur: (() => {
          const tenThousandths = Math.round(
            (line.costCents * 100) / line.quantity,
          )
          return `${Math.floor(tenThousandths / 10_000)}.${String(tenThousandths % 10_000).padStart(4, '0')}`
        })(),
      })),
    )
    await db.insert(securityPricesTable).values(
      held.map((line) => ({
        securityId: idOf.get(line.isin)!,
        day,
        priceEur: centsText(line.price),
        source: 'statement' as const,
      })),
    )
  }
  const values = await revalue(
    db,
    options.accountId,
    options.days[0],
    options.today,
  )
  return { statements: options.days.length, values }
}
