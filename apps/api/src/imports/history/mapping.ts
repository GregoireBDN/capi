import { z } from 'zod'
import { defaultKind } from '#/categories/rules/categorize'
import {
  ACCOUNT_TYPES,
  type AccountType,
  type TransactionKind,
} from '#/database/schema/domain-enums'
import { normalizeHeader, toSheetSlug } from './history-csv.parser'

/**
 * Mappings from the spreadsheet history to the app's data: sheet category
 * slugs to seeded category slugs, and sheet account codes to accounts.
 * Pure: no I/O.
 */

// --- Categories -------------------------------------------------------------

/** Where a sheet category goes. `review` flags a best-effort guess. */
export interface CategoryTarget {
  /** Seeded category slug, or null for no category. */
  slug: string | null
  review: boolean
}

export interface SheetCategoryMapping {
  /** Used when `byGroup` has no entry for the row's `Groupe`. */
  default: CategoryTarget
  /** Target depending on the row's `Groupe` (kind). */
  byGroup?: Partial<Record<TransactionKind, CategoryTarget>>
}

const exact = (slug: string): CategoryTarget => ({ slug, review: false })
const guess = (slug: string | null): CategoryTarget => ({ slug, review: true })
const to = (slug: string): SheetCategoryMapping => ({ default: exact(slug) })

/**
 * Sheet category slug (French snake_case) → seeded category. Sheet slugs not
 * listed here are unmapped: no category, flagged for review.
 */
export const DEFAULT_SHEET_CATEGORIES: Readonly<
  Record<string, SheetCategoryMapping>
> = {
  // Expenses
  abonnements: to('subscriptions'),
  assurances: to('insurance'),
  autres_depenses: to('other_expenses'),
  cadeaux: to('gifts'),
  courses: to('groceries'),
  depenses_partagees: to('shared_expenses'),
  energie: to('energy'),
  especes: to('cash_withdrawal'),
  frais_bancaires: to('bank_fees'),
  impots: to('taxes'),
  loisirs: to('leisure'),
  loyer: to('rent'),
  restaurants_cafes: to('restaurants_cafes'),
  sante: to('health'),
  shopping: to('shopping'),
  telecom: to('telecom'),
  transport: to('transport'),
  voyages: to('travel'),
  // A PayPal payment can be anything: leave it for review.
  paypal: { default: guess(null) },
  // Income
  aides: to('benefits'),
  allocations: to('benefits'),
  apl: to('benefits'),
  caf: to('benefits'),
  famille: to('family_support'),
  salaire: to('salary'),
  remboursement: to('refunds'),
  remboursements: to('refunds'),
  autres_revenus: to('other_income'),
  // Transfers
  epargne: to('savings_transfer'),
  investissement: to('investment_transfer'),
  virement_interne: to('internal_transfer'),
  // Plain transfers are only known to be internal when `Groupe` says so.
  virement_emis: {
    default: guess(null),
    byGroup: { transfer: exact('internal_transfer') },
  },
  virement_recu: {
    default: guess(null),
    byGroup: {
      transfer: exact('internal_transfer'),
      income: guess('other_income'),
    },
  },
}

/** Why a row is flagged for review. */
export type ReviewReason =
  | 'missing_category'
  | 'unmapped_category'
  | 'ambiguous_category'
  | 'missing_target_category'
  | 'unknown_group'
  | 'transfer_kind_mismatch'

export interface MappedCategory {
  /** Seeded category slug, or null. */
  categorySlug: string | null
  kind: TransactionKind
  needsReview: boolean
  /** First reason the row needs review; null when it does not. */
  reviewReason: ReviewReason | null
}

export interface CategoryRowInput {
  categorySlug: string | null
  group: TransactionKind | null
  unknownGroup: string | null
  amountCents: number
}

/** Category used for a transfer whose sheet category gives none. */
const FALLBACK_TRANSFER_CATEGORY = 'internal_transfer'

/**
 * Maps one sheet row to a category and a kind.
 *
 * - A categorized row has its category's kind (#368). Without a category,
 *   the kind comes from `Groupe` (`Mouvement` → transfer, `Revenu` →
 *   income, `Dépense` → expense), else from the amount sign.
 * - Unknown, missing or ambiguous categories keep a best-effort category (or
 *   none) and are flagged for review. A transfer without a category falls
 *   back to `internal_transfer`, so it never counts as income or expense.
 * - A disagreement between `Groupe` and the category's kind where one side is
 *   a transfer (it decides whether the row counts in stats at all) is filed
 *   without a category, with `Groupe`'s kind, in review. An income row in an
 *   expense category is a refund of it, and an expense row in an income
 *   category lowers that income: both keep their category and its kind.
 *
 * @param categoryKinds kinds of the categories that exist, by slug.
 */
export function mapCategory(
  row: CategoryRowInput,
  mappings: Readonly<Record<string, SheetCategoryMapping>>,
  categoryKinds: ReadonlyMap<string, TransactionKind>,
): MappedCategory {
  const reasons: ReviewReason[] = []
  if (row.unknownGroup !== null) reasons.push('unknown_group')

  let target: CategoryTarget
  if (row.categorySlug === null) {
    reasons.push('missing_category')
    target = guess(null)
  } else {
    const mapping = mappings[row.categorySlug]
    if (!mapping) {
      reasons.push('unmapped_category')
      target = guess(null)
    } else {
      target = (row.group && mapping.byGroup?.[row.group]) || mapping.default
      if (target.review) reasons.push('ambiguous_category')
    }
  }

  let slug = target.slug
  if (slug !== null && !categoryKinds.has(slug)) {
    reasons.push('missing_target_category')
    slug = null
  }
  let categoryKind = slug === null ? null : categoryKinds.get(slug)!
  if (
    categoryKind !== null &&
    row.group !== null &&
    categoryKind !== row.group &&
    (categoryKind === 'transfer' || row.group === 'transfer')
  ) {
    reasons.push('transfer_kind_mismatch')
    slug = null
    categoryKind = null
  }
  const kind = categoryKind ?? row.group ?? defaultKind(row.amountCents)
  if (
    slug === null &&
    kind === 'transfer' &&
    !reasons.includes('transfer_kind_mismatch') &&
    categoryKinds.get(FALLBACK_TRANSFER_CATEGORY) === 'transfer'
  ) {
    slug = FALLBACK_TRANSFER_CATEGORY
  }

  return {
    categorySlug: slug,
    kind,
    needsReview: reasons.length > 0,
    reviewReason: reasons[0] ?? null,
  }
}

const categoryOverridesSchema = z.record(z.string(), z.string().nullable())

/**
 * Category overrides file (`--categories`): `{ "sheet_slug": "our_slug" }`,
 * or `null` to leave a sheet category uncategorized (flagged for review),
 * merged over `defaults`. An override applies whatever the `Groupe` and
 * replaces the default entry of that slug.
 *
 * @throws {Error} on invalid JSON or shape. The message names no file content.
 */
export function parseCategoryOverrides(
  json: string,
  defaults: Readonly<
    Record<string, SheetCategoryMapping>
  > = DEFAULT_SHEET_CATEGORIES,
): Record<string, SheetCategoryMapping> {
  const parsed = categoryOverridesSchema.safeParse(parseJson(json))
  if (!parsed.success) {
    throw new Error(
      'Invalid category mapping: expected an object of "sheet_slug": "category_slug" | null',
    )
  }
  const merged: Record<string, SheetCategoryMapping> = { ...defaults }
  for (const [sheetSlug, slug] of Object.entries(parsed.data)) {
    merged[toSheetSlug(sheetSlug)] = {
      default: slug === null ? guess(null) : exact(slug),
    }
  }
  return merged
}

// --- Accounts ---------------------------------------------------------------

export interface AccountSpec {
  /** Sheet `Compte` code, uppercase (`CC`). */
  code: string
  /** Account name, found (case-insensitively) or created. */
  name: string
  type: AccountType
  institution: string | null
  /** `Soldes` column holding its month-end balance; defaults to `name`. */
  balanceColumn: string | null
}

export const DEFAULT_ACCOUNT_SPECS: readonly AccountSpec[] = [
  {
    code: 'CC',
    name: 'Compte courant',
    type: 'checking',
    institution: 'CIC',
    balanceColumn: 'Compte courant',
  },
  {
    code: 'LA',
    name: 'Livret A',
    type: 'savings',
    institution: 'CIC',
    balanceColumn: 'Livret A',
  },
  {
    code: 'LJ',
    name: 'Livret Jeune',
    type: 'savings',
    institution: 'CIC',
    balanceColumn: 'Livret Jeune',
  },
]

const accountMappingSchema = z.record(
  z.string().min(1),
  z.object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(ACCOUNT_TYPES),
    institution: z.string().trim().max(100).nullable().optional(),
    balanceColumn: z.string().trim().min(1).nullable().optional(),
  }),
)

/**
 * Account mapping file (`--accounts`), merged over the defaults by code:
 *
 *     { "CC": { "name": "Compte courant", "type": "checking",
 *               "institution": "CIC", "balanceColumn": "Compte courant" } }
 *
 * `institution` defaults to `CIC` and `balanceColumn` to the name.
 *
 * @throws {Error} on invalid JSON or shape. The message names no file content.
 */
export function parseAccountMapping(
  json: string,
  defaults: readonly AccountSpec[] = DEFAULT_ACCOUNT_SPECS,
): AccountSpec[] {
  const parsed = accountMappingSchema.safeParse(parseJson(json))
  if (!parsed.success) {
    throw new Error(
      `Invalid account mapping: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`,
    )
  }
  const byCode = new Map(defaults.map((spec) => [spec.code, spec]))
  for (const [rawCode, entry] of Object.entries(parsed.data)) {
    const code = rawCode.trim().toUpperCase()
    byCode.set(code, {
      code,
      name: entry.name,
      type: entry.type,
      institution:
        entry.institution === undefined ? 'CIC' : entry.institution || null,
      balanceColumn: entry.balanceColumn ?? entry.name,
    })
  }
  return [...byCode.values()]
}

/** The account spec whose balance column is `column`, if any. */
export function accountForBalanceColumn(
  specs: readonly AccountSpec[],
  column: string,
): AccountSpec | undefined {
  const wanted = normalizeHeader(column)
  return specs.find(
    (spec) => normalizeHeader(spec.balanceColumn ?? spec.name) === wanted,
  )
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    throw new Error('Invalid mapping file: not valid JSON')
  }
}
