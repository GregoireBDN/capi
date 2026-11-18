import type { TransactionKind } from '#/database/schema/domain-enums'
import type { CategoryIcon } from './category-icons'

export interface DefaultCategory {
  /** Stable English snake_case identifier, referenced by rules and imports. */
  slug: string
  /** French display name (the UI is in French); the user may rename it. */
  name: string
  /** Category group. */
  kind: TransactionKind
  /** Lowercase `#rrggbb` hex; the user may change it. */
  color: string
  /** Icon of the category's rows (#266); the user may change it. */
  icon: CategoryIcon
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
  {
    slug: 'rent',
    name: 'Loyer',
    kind: 'expense',
    color: '#dc2626',
    icon: 'house',
  },
  {
    slug: 'energy',
    name: 'Énergie',
    kind: 'expense',
    color: '#ea580c',
    icon: 'zap',
  },
  {
    slug: 'groceries',
    name: 'Courses',
    kind: 'expense',
    color: '#d97706',
    icon: 'shopping-cart',
  },
  {
    slug: 'restaurants_cafes',
    name: 'Restaurants & cafés',
    kind: 'expense',
    color: '#ca8a04',
    icon: 'utensils',
  },
  {
    slug: 'transport',
    name: 'Transport',
    kind: 'expense',
    color: '#0891b2',
    icon: 'train-front',
  },
  {
    slug: 'subscriptions',
    name: 'Abonnements',
    kind: 'expense',
    color: '#7c3aed',
    icon: 'repeat',
  },
  {
    slug: 'insurance',
    name: 'Assurances',
    kind: 'expense',
    color: '#4f46e5',
    icon: 'shield',
  },
  {
    slug: 'telecom',
    name: 'Télécom',
    kind: 'expense',
    color: '#2563eb',
    icon: 'smartphone',
  },
  {
    slug: 'health',
    name: 'Santé',
    kind: 'expense',
    color: '#e11d48',
    icon: 'heart-pulse',
  },
  {
    slug: 'shopping',
    name: 'Shopping',
    kind: 'expense',
    color: '#db2777',
    icon: 'shopping-bag',
  },
  {
    slug: 'leisure',
    name: 'Loisirs',
    kind: 'expense',
    color: '#c026d3',
    icon: 'ticket',
  },
  {
    slug: 'travel',
    name: 'Voyages',
    kind: 'expense',
    color: '#0d9488',
    icon: 'plane',
  },
  {
    slug: 'bank_fees',
    name: 'Frais bancaires',
    kind: 'expense',
    color: '#57534e',
    icon: 'landmark',
  },
  {
    slug: 'cash_withdrawal',
    name: "Retraits d'espèces",
    kind: 'expense',
    color: '#78716c',
    icon: 'banknote',
  },
  {
    slug: 'taxes',
    name: 'Impôts',
    kind: 'expense',
    color: '#9f1239',
    icon: 'receipt',
  },
  {
    slug: 'gifts',
    name: 'Cadeaux',
    kind: 'expense',
    color: '#be185d',
    icon: 'gift',
  },
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
    icon: 'users',
  },
  {
    slug: 'other_expenses',
    name: 'Autres dépenses',
    kind: 'expense',
    color: '#6b7280',
    icon: 'tag',
  },

  // Income
  {
    slug: 'salary',
    name: 'Salaire',
    kind: 'income',
    color: '#15803d',
    icon: 'briefcase',
  },
  {
    slug: 'family_support',
    name: 'Aide familiale',
    kind: 'income',
    color: '#16a34a',
    icon: 'hand-heart',
  },
  /** Public benefits, e.g. housing benefit (APL). */
  {
    slug: 'benefits',
    name: 'Aides & allocations',
    kind: 'income',
    color: '#65a30d',
    icon: 'hand-coins',
  },
  {
    slug: 'refunds',
    name: 'Remboursements',
    kind: 'income',
    color: '#059669',
    icon: 'undo-2',
  },
  {
    slug: 'other_income',
    name: 'Autres revenus',
    kind: 'income',
    color: '#4d7c0f',
    icon: 'coins',
  },

  // Transfers between the user's own accounts (never counted in stats)
  {
    slug: 'internal_transfer',
    name: 'Virement interne',
    kind: 'transfer',
    color: '#64748b',
    icon: 'arrow-left-right',
  },
  {
    slug: 'savings_transfer',
    name: 'Épargne',
    kind: 'transfer',
    color: '#0284c7',
    icon: 'piggy-bank',
  },
  {
    slug: 'investment_transfer',
    name: 'Investissement',
    kind: 'transfer',
    color: '#0369a1',
    icon: 'trending-up',
  },
] as const satisfies readonly DefaultCategory[]

export type DefaultCategorySlug = (typeof DEFAULT_CATEGORIES)[number]['slug']
