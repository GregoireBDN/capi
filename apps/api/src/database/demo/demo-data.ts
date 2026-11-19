import { createHash } from 'node:crypto'
import * as bcrypt from 'bcryptjs'
import { eq, inArray, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { BCRYPT_SALT_ROUNDS } from '#/auth/auth.constants'
import { categorize } from '#/categories/rules/categorize'
import { seedDefaultCategories } from '#/categories/seed-default-categories'
import { valueInCents } from '#/crypto/decimal'
import type * as schema from '#/database/schema'
import {
  accountsTable,
  appSettingsTable,
  balanceSnapshotsTable,
  budgetsTable,
  categoriesTable,
  categorizationRulesTable,
  cryptoHoldingsTable,
  cryptoPricesTable,
  importsTable,
  recurringItemsTable,
  savingsGoalAccountsTable,
  savingsGoalsTable,
  type SelectCategorizationRule,
  type SelectCategory,
  transactionSplitsTable,
  transactionsTable,
  usersTable,
} from '#/database/schema'
import type { TransactionKind } from '#/database/schema/domain-enums'
import { computeDedupeHashes } from '#/imports/dedupe/dedupe'
import { normalizeLabel } from '#/imports/normalize/label'
import {
  addDays,
  addMonths,
  daysInMonth,
  todayInParis,
} from '#/recurring/dates'
import { RecurringService } from '#/recurring/recurring.service'
import { MONTHLY_TARGET_KEY } from '#/savings/savings.service'

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
export const CHECKING_OPENING_CENTS = 245_000

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
  imports: number
  snapshots: number
  rules: number
  budgets: number
  savingsGoals: number
  cryptoHoldings: number
  recurringItems: number
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
 * (expenses in their own categories) up to yesterday, never below zero.
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
    const payments = random.int(11, 13)
    const days = Array.from({ length: payments }, () => random.int(3, 28))
      .map((day) => dayIn(month, day))
      .filter((day) => day <= yesterday)
      .sort()
    for (const day of days) {
      const shop = random.pick(MEAL_VOUCHER_SHOPS)
      const cents = random.int(shop.min, shop.max)
      if (cents > balance) continue
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
  kind?: TransactionKind
  merchant?: string
}

/** Ordered: `UBER EATS` before `UBER`, as an owner would set them up. */
const RULES: readonly RuleSpec[] = [
  { pattern: 'UBER EATS', slug: 'restaurants_cafes' },
  { pattern: 'UBER', slug: 'transport' },
  { pattern: 'CARREFOUR', slug: 'groceries' },
  { pattern: 'MONOPRIX', slug: 'groceries' },
  { pattern: 'PICARD', slug: 'groceries' },
  { pattern: 'NETFLIX', slug: 'subscriptions' },
  { pattern: 'SPOTIFY', slug: 'subscriptions' },
  { pattern: 'VIDEOPASS', slug: 'subscriptions' },
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
  { pattern: 'VERS LIVRET A', slug: 'savings_transfer', kind: 'transfer' },
  { pattern: 'DEPUIS LIVRET A', slug: 'internal_transfer', kind: 'transfer' },
  { pattern: 'VERS PEA', slug: 'investment_transfer', kind: 'transfer' },
  {
    pattern: 'DEPUIS COMPTE COURANT',
    slug: 'savings_transfer',
    kind: 'transfer',
  },
  {
    pattern: 'VERS COMPTE COURANT',
    slug: 'internal_transfer',
    kind: 'transfer',
  },
  { pattern: 'COTIS EUROCOMPTE', slug: 'bank_fees' },
  { pattern: 'RETRAIT DAB', slug: 'cash_withdrawal' },
  { pattern: 'CPAM', slug: 'refunds', merchant: 'CPAM' },
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
  ] = accountRows

  // Rules, in order.
  const rules: SelectCategorizationRule[] = await db
    .insert(categorizationRulesTable)
    .values(
      RULES.map((rule, i) => ({
        position: i,
        matchType: 'contains' as const,
        labelPattern: rule.pattern,
        categoryId: category(rule.slug).id,
        kind: rule.kind ?? null,
        merchant: rule.merchant ?? null,
      })),
    )
    .returning()

  // Bank rows, imports and running balances.
  const reviewFrom = addDays(dataUntil, -REVIEW_WINDOW_DAYS)
  let transactionCount = 0
  let reviewCount = 0
  let splitCount = 0
  let importCount = 0
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
        kind = 'expense'
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
        dedupeHash: hashes[i],
      }
    })
    const inserted = await db
      .insert(transactionsTable)
      .values(values)
      .returning({ id: transactionsTable.id })
    transactionCount += inserted.length

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
    {
      account: crypto,
      value: 420_000,
      contributions: 430_000,
      monthly: 0,
      drift: [-0.12, 0.15],
    },
  ] as const
  for (const investment of investments) {
    let value: number = investment.value
    let contributions: number = investment.contributions
    const snapshots = []
    for (const month of monthList) {
      const date = lastDayOf(month)
      if (date > dataUntil) break
      const [low, high] = investment.drift
      value =
        Math.round(value * (1 + low + (high - low) * random.next())) +
        investment.monthly
      contributions += investment.monthly
      snapshots.push({
        accountId: investment.account.id,
        date,
        valueCents: value,
        contributionsCents: contributions,
      })
    }
    await db.insert(balanceSnapshotsTable).values(snapshots)
    snapshotCount += snapshots.length
  }

  // Crypto: manual holdings and prices (no price API), valued today.
  const holdings = [
    {
      assetId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      quantity: '0.0425',
      investedCents: 250_000,
    },
    {
      assetId: 'ethereum',
      symbol: 'ETH',
      name: 'Ethereum',
      quantity: '0.85',
      investedCents: 180_000,
    },
  ]
  const prices: Record<string, string> = {
    bitcoin: '82500.00',
    ethereum: '2950.00',
  }
  await db.insert(cryptoHoldingsTable).values(
    holdings.map((h) => ({
      ...h,
      accountId: crypto.id,
      location: 'Ledger Nano',
      origin: 'manual' as const,
    })),
  )
  await db
    .insert(cryptoPricesTable)
    .values(
      Object.entries(prices).map(([assetId, priceEur]) => ({
        assetId,
        priceEur,
        source: 'manual' as const,
        fetchedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: cryptoPricesTable.assetId,
      set: {
        priceEur: sql`excluded.price_eur`,
        source: 'manual',
        fetchedAt: new Date(),
      },
    })
  const cryptoValue = holdings.reduce(
    (sum, h) => sum + Number(valueInCents(h.quantity, prices[h.assetId])),
    0,
  )
  await db
    .insert(balanceSnapshotsTable)
    .values({
      accountId: crypto.id,
      date: today,
      valueCents: cryptoValue,
      contributionsCents: 430_000,
    })
    .onConflictDoNothing()
  snapshotCount++

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
      imports: importCount,
      snapshots: snapshotCount,
      rules: rules.length,
      budgets: budgetValues.length,
      savingsGoals: goals.length,
      cryptoHoldings: holdings.length,
      recurringItems,
    },
  }
}
