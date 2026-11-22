import type {
  AccountType,
  BudgetStatus,
  RecurringCadence,
  TransactionKind,
} from '../api/types.js'

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'compte courant',
  savings: 'épargne',
  brokerage: 'PEA',
  securities: 'compte-titres',
  life_insurance: 'assurance vie',
  employee_savings: 'épargne salariale',
  crypto: 'crypto',
  meal_voucher: 'titres-restaurant',
}

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: 'dépense',
  income: 'revenu',
  transfer: 'virement interne',
}

/**
 * A categorized transaction has its category's kind (#368): a `kind` given
 * with a category of another kind is refused before anything is sent.
 */
export function kindOfCategoryError(
  kind: TransactionKind,
  category: { name: string; kind: TransactionKind },
): string {
  return `Une opération classée prend le type de sa catégorie : « ${category.name} » est une catégorie de ${KIND_LABELS[category.kind]}, pas de ${KIND_LABELS[kind]}. Choisissez une catégorie de ce type (list_categories), ou "uncategorized" pour la laisser sans catégorie avec ce type. Rien n'a été modifié.`
}

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  ok: 'ok',
  warning: 'proche de la cible',
  over: 'dépassé',
}

export const CADENCE_LABELS: Record<RecurringCadence, string> = {
  weekly: 'hebdomadaire',
  monthly: 'mensuel',
  quarterly: 'trimestriel',
  yearly: 'annuel',
}
