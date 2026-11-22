/**
 * Synthetic data of the « Mouvements » prototypes (#410): October 2026 (a
 * complete month) and November 2026 (partial, data until the 12th, compared
 * with 1–12 Oct.). Fake categories, accounts and amounts, integer cents.
 * Not app code: the folder goes once the owner has chosen.
 */

export type Kind = 'expense' | 'income' | 'savings'

export type MonthKey = 'octobre' | 'novembre'

/** One row of a ranking: a category (expenses, income) or an account (savings). */
export interface Item {
  id: string
  name: string
  /** A `CategoryIcon` name. */
  icon: string | null
  /** A CSS colour, or null for « Sans catégorie ». */
  color: string | null
  cents: number
  /** The previous month (like for like when the month is partial). */
  previousCents: number
  /** The average of the last months (like for like too). */
  averageCents: number
  /** The budget's target (expenses) or planned amount (income). */
  targetCents?: number
  /** Still expected this month (recurring costs, the salary). */
  expectedCents?: number
  /** Savings only: what went in and what came out of the account. */
  inCents?: number
  outCents?: number
  /** Savings only: the group shown by the dot. */
  group?: 'Livrets' | 'Placements'
}

export interface MonthData {
  key: MonthKey
  /** `2026-10` */
  month: string
  label: string
  /** Short name of the month compared with: « septembre », « 1–12 oct. ». */
  previousName: string
  partial: null | { throughDay: number; through: string }
  /** Excluded from the figures unless « Exceptionnelles » is on. */
  oneOffCents: number
  expense: Item[]
  income: Item[]
  savings: Item[]
}

const cat = (
  id: string,
  name: string,
  icon: string | null,
  color: string | null,
  cents: number,
  previousCents: number,
  averageCents: number,
  extra: Partial<Item> = {},
): Item => ({
  id,
  name,
  icon,
  color,
  cents,
  previousCents,
  averageCents,
  ...extra,
})

const C = (n: number) => `var(--chart-${n})`

/** The Épargne page's colours (#407): Livrets emerald, Placements violet. */
export const SAVINGS_COLORS = {
  Livrets: 'oklch(69.6% 0.17 162.48)',
  Placements: 'oklch(60.6% 0.25 292.717)',
} as const

const account = (
  id: string,
  name: string,
  icon: string,
  group: 'Livrets' | 'Placements',
  inCents: number,
  outCents: number,
  previousCents: number,
  averageCents: number,
): Item => ({
  id,
  name,
  icon,
  color: SAVINGS_COLORS[group],
  group,
  inCents,
  outCents,
  cents: inCents - outCents,
  previousCents,
  averageCents,
})

export const MONTHS: Record<MonthKey, MonthData> = {
  octobre: {
    key: 'octobre',
    month: '2026-10',
    label: 'Octobre 2026',
    previousName: 'septembre',
    partial: null,
    oneOffCents: 48000,
    expense: [
      cat('logement', 'Logement', 'house', C(1), 95000, 95000, 95000, {
        targetCents: 95000,
      }),
      cat('courses', 'Courses', 'shopping-cart', C(2), 41230, 38650, 40100, {
        targetCents: 45000,
      }),
      cat('restos', 'Restaurants', 'utensils', C(3), 18640, 12210, 14500, {
        targetCents: 15000,
      }),
      cat('shopping', 'Shopping', 'shopping-bag', C(4), 14500, 9800, 11000),
      cat('transports', 'Transports', 'train-front', C(5), 12400, 12400, 12900),
      cat('loisirs', 'Loisirs', 'ticket', C(6), 9250, 11500, 9800),
      cat('abonnements', 'Abonnements', 'repeat', C(7), 6497, 6497, 6497),
      cat('sante', 'Santé', 'pill', C(8), 3800, 5500, 4200),
      cat('none', 'Sans catégorie', null, null, 2390, 1800, 1500),
      cat('cadeaux', 'Cadeaux', 'gift', C(5), 0, 3500, 2100),
    ],
    income: [
      cat('salaire', 'Salaire', 'briefcase', C(2), 285000, 285000, 285000, {
        targetCents: 285000,
      }),
      cat('aides', 'Aides', 'hand-heart', C(6), 12000, 12000, 12000),
      cat('ventes', 'Ventes d’occasion', 'tag', C(4), 6500, 0, 2200),
      cat('frais', 'Notes de frais', 'banknote', C(7), 4500, 3200, 3800),
    ],
    savings: [
      account(
        'pea',
        'PEA',
        'trending-up',
        'Placements',
        20000,
        0,
        20000,
        20000,
      ),
      account(
        'livret-a',
        'Livret A',
        'piggy-bank',
        'Livrets',
        30000,
        15000,
        30000,
        25000,
      ),
      account('av', 'Assurance vie', 'shield', 'Placements', 10000, 0, 0, 5000),
      account('crypto', 'Crypto', 'coins', 'Placements', 5000, 0, 5000, 5000),
      account('ldds', 'LDDS', 'piggy-bank', 'Livrets', 0, 0, 0, 0),
    ],
  },
  novembre: {
    key: 'novembre',
    month: '2026-11',
    label: 'Novembre 2026',
    previousName: '1–12 oct.',
    partial: { throughDay: 12, through: '12 nov.' },
    oneOffCents: 0,
    expense: [
      cat('logement', 'Logement', 'house', C(1), 95000, 95000, 95000, {
        targetCents: 95000,
      }),
      cat('courses', 'Courses', 'shopping-cart', C(2), 14820, 16200, 15100, {
        targetCents: 45000,
      }),
      cat('transports', 'Transports', 'train-front', C(5), 7500, 7500, 7500),
      cat('restos', 'Restaurants', 'utensils', C(3), 6230, 7400, 5600, {
        targetCents: 15000,
      }),
      cat('loisirs', 'Loisirs', 'ticket', C(6), 3200, 1500, 2600),
      cat('abonnements', 'Abonnements', 'repeat', C(7), 2499, 3998, 3998, {
        expectedCents: 3998,
      }),
      cat('shopping', 'Shopping', 'shopping-bag', C(4), 0, 4500, 3100),
      cat('sante', 'Santé', 'pill', C(8), 0, 1200, 1400),
    ],
    income: [
      cat('salaire', 'Salaire', 'briefcase', C(2), 0, 0, 0, {
        targetCents: 285000,
        expectedCents: 285000,
      }),
      cat('aides', 'Aides', 'hand-heart', C(6), 12000, 12000, 12000),
      cat('ventes', 'Ventes d’occasion', 'tag', C(4), 4000, 0, 800),
      cat('frais', 'Notes de frais', 'banknote', C(7), 0, 0, 1100),
    ],
    savings: [
      account(
        'livret-a',
        'Livret A',
        'piggy-bank',
        'Livrets',
        30000,
        0,
        30000,
        30000,
      ),
      account(
        'pea',
        'PEA',
        'trending-up',
        'Placements',
        20000,
        0,
        20000,
        20000,
      ),
      account('crypto', 'Crypto', 'coins', 'Placements', 5000, 0, 5000, 5000),
      account('av', 'Assurance vie', 'shield', 'Placements', 0, 0, 0, 2500),
      account('ldds', 'LDDS', 'piggy-bank', 'Livrets', 0, 0, 0, 0),
    ],
  },
}

/** Nov. 2025 → Nov. 2026, whole euros, per kind (Nov. 2026 partial). */
const TREND_MONTHS = [
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
]

const TREND_EUROS: Record<Kind, number[]> = {
  expense: [
    2140, 2650, 1980, 2050, 2120, 1890, 1960, 2010, 1950, 2077, 1969, 2037,
    1292,
  ],
  income: [
    2980, 3820, 2990, 2970, 3010, 3010, 3040, 3100, 2990, 3040, 3002, 3080, 160,
  ],
  savings: [400, 900, 450, 500, 500, 600, 550, 500, 600, 500, 550, 500, 550],
}

/** The 12 months ending with `month`, in cents. */
export function trend(kind: Kind, month: string) {
  const end = TREND_MONTHS.indexOf(month) + 1
  const start = end - 12
  return TREND_MONTHS.slice(start, end).map((m, i) => ({
    month: m,
    cents: TREND_EUROS[kind][start + i] * 100,
  }))
}

export function total(items: readonly Item[]): number {
  return items.reduce((sum, item) => sum + item.cents, 0)
}

export function totalOf(
  items: readonly Item[],
  key: 'previousCents' | 'averageCents' | 'expectedCents' | 'outCents',
): number {
  return items.reduce((sum, item) => sum + (item[key] ?? 0), 0)
}

export const KIND_LABEL: Record<Kind, string> = {
  expense: 'Dépenses',
  income: 'Revenus',
  savings: 'Épargne',
}

/** The month's figure for each kind. */
export const FIGURE_LABEL: Record<Kind, string> = {
  expense: 'Dépensé',
  income: 'Reçu',
  savings: 'Mis de côté',
}

/** Whether a rise is good news. */
export const RISE_IS_GOOD: Record<Kind, boolean> = {
  expense: false,
  income: true,
  savings: true,
}

export const KIND_COLOR: Record<Kind, string> = {
  expense: 'var(--chart-expense)',
  income: 'var(--chart-income)',
  savings: 'var(--chart-savings)',
}
