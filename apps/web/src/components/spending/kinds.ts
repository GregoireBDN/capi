import type { SpendingKind } from '#/api/types.gen'

/**
 * The three parts of Mouvements (#410, the owner's « B. Le mois en tête »):
 * Dépenses and Revenus per category, Épargne (« Mis de côté », the moves to
 * the savings accounts and investments, never income or expense) per
 * account. `?vue=` names the part shown; Dépenses is the default (absent).
 */
export const KINDS = [
  'income',
  'expense',
  'savings',
] as const satisfies readonly SpendingKind[]

/** `?vue=` values. */
export const VIEWS = ['revenus', 'epargne'] as const
export type View = (typeof VIEWS)[number]

export function kindOf(view: View | undefined): SpendingKind {
  return view === 'revenus'
    ? 'income'
    : view === 'epargne'
      ? 'savings'
      : 'expense'
}

export function viewOf(kind: SpendingKind): View | undefined {
  return kind === 'income'
    ? 'revenus'
    : kind === 'savings'
      ? 'epargne'
      : undefined
}

/** The part's name: the tiles, the heading. */
export const KIND_LABEL: Record<SpendingKind, string> = {
  expense: 'Dépenses',
  income: 'Revenus',
  savings: 'Épargne',
}

/** The month's figure: the donut's centre, the trend's total. */
export const FIGURE_LABEL: Record<SpendingKind, string> = {
  expense: 'Dépensé',
  income: 'Reçu',
  savings: 'Mis de côté',
}

/** A rise is good news for income and savings, bad for expenses. */
export const INCREASE_IS_GOOD: Record<SpendingKind, boolean> = {
  expense: false,
  income: true,
  savings: true,
}

/** Money out, in, set aside (`--chart-*` tokens). */
export const KIND_COLOR: Record<SpendingKind, string> = {
  expense: 'var(--chart-expense)',
  income: 'var(--chart-income)',
  savings: 'var(--chart-savings)',
}

/** « dépense », « revenu », « mouvement »: rows without any. */
export const ROW_NOUN: Record<SpendingKind, string> = {
  expense: 'les catégories sans dépense',
  income: 'les catégories sans revenu',
  savings: 'les comptes sans mouvement',
}

/** The ranking's list name and card title. */
export const RANKING_TITLE: Record<SpendingKind, string> = {
  expense: 'Par catégorie',
  income: 'Par catégorie',
  savings: 'Par compte',
}

/** « Aucune dépense », « Aucun revenu », « Rien mis de côté ». */
export const NOTHING: Record<SpendingKind, string> = {
  expense: 'Aucune dépense',
  income: 'Aucun revenu',
  savings: 'Rien mis de côté',
}
