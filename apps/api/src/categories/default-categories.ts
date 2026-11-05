import type { TransactionKind } from '#/database/schema/domain-enums'

export interface DefaultCategory {
  /** Stable English snake_case identifier, referenced by rules and imports. */
  slug: string
  /** French display name (the UI is in French); the user may rename it. */
  name: string
  /** Category group. */
  kind: TransactionKind
  /** Lowercase `#rrggbb` hex; the user may change it. */
  color: string
}

/**
 * Starting taxonomy inserted by `pnpm db:seed` (see `seedDefaultCategories`).
 *
 * Palette: expenses use distinct warm/cool hues so they stay readable side by
 * side in charts, income uses greens, transfers use slate/sky blues.
 *
 * Changing a `slug` here does not rename existing rows: the seed only inserts
 * missing slugs, so a renamed slug would be seeded as a new category.
 */
export const DEFAULT_CATEGORIES = [
  // Expenses
  { slug: 'rent', name: 'Loyer', kind: 'expense', color: '#dc2626' },
  { slug: 'energy', name: 'Énergie', kind: 'expense', color: '#ea580c' },
  { slug: 'groceries', name: 'Courses', kind: 'expense', color: '#d97706' },
  {
    slug: 'restaurants_cafes',
    name: 'Restaurants & cafés',
    kind: 'expense',
    color: '#ca8a04',
  },
  { slug: 'transport', name: 'Transport', kind: 'expense', color: '#0891b2' },
  {
    slug: 'subscriptions',
    name: 'Abonnements',
    kind: 'expense',
    color: '#7c3aed',
  },
  { slug: 'insurance', name: 'Assurances', kind: 'expense', color: '#4f46e5' },
  { slug: 'telecom', name: 'Télécom', kind: 'expense', color: '#2563eb' },
  { slug: 'health', name: 'Santé', kind: 'expense', color: '#e11d48' },
  { slug: 'shopping', name: 'Shopping', kind: 'expense', color: '#db2777' },
  { slug: 'leisure', name: 'Loisirs', kind: 'expense', color: '#c026d3' },
  { slug: 'travel', name: 'Voyages', kind: 'expense', color: '#0d9488' },
  {
    slug: 'bank_fees',
    name: 'Frais bancaires',
    kind: 'expense',
    color: '#57534e',
  },
  {
    slug: 'cash_withdrawal',
    name: "Retraits d'espèces",
    kind: 'expense',
    color: '#78716c',
  },
  { slug: 'taxes', name: 'Impôts', kind: 'expense', color: '#9f1239' },
  { slug: 'gifts', name: 'Cadeaux', kind: 'expense', color: '#be185d' },
  /**
   * Money exchanged with a partner to split household costs (paying back
   * their share, or receiving ours). Filed as `expense`, not `transfer`:
   * - `transfer` is reserved for moves between the user's *own* accounts; a
   *   partner's account is not one of them.
   * - Netting these flows against expenses gives the user's real share of
   *   shared costs. As a `transfer`, a partner paying back half the rent would
   *   be ignored and the full rent would count as spending; as `income` it
   *   would inflate income instead.
   */
  {
    slug: 'shared_expenses',
    name: 'Dépenses partagées',
    kind: 'expense',
    color: '#a16207',
  },
  {
    slug: 'other_expenses',
    name: 'Autres dépenses',
    kind: 'expense',
    color: '#6b7280',
  },

  // Income
  { slug: 'salary', name: 'Salaire', kind: 'income', color: '#15803d' },
  {
    slug: 'family_support',
    name: 'Aide familiale',
    kind: 'income',
    color: '#16a34a',
  },
  /** Public benefits, e.g. housing benefit (APL). */
  {
    slug: 'benefits',
    name: 'Aides & allocations',
    kind: 'income',
    color: '#65a30d',
  },
  { slug: 'refunds', name: 'Remboursements', kind: 'income', color: '#059669' },
  {
    slug: 'other_income',
    name: 'Autres revenus',
    kind: 'income',
    color: '#4d7c0f',
  },

  // Transfers between the user's own accounts (never counted in stats)
  {
    slug: 'internal_transfer',
    name: 'Virement interne',
    kind: 'transfer',
    color: '#64748b',
  },
  {
    slug: 'savings_transfer',
    name: 'Épargne',
    kind: 'transfer',
    color: '#0284c7',
  },
  {
    slug: 'investment_transfer',
    name: 'Investissement',
    kind: 'transfer',
    color: '#0369a1',
  },
] as const satisfies readonly DefaultCategory[]

export type DefaultCategorySlug = (typeof DEFAULT_CATEGORIES)[number]['slug']
