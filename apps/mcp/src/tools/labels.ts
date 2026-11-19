import type {
  AccountType,
  BudgetStatus,
  RecurringCadence,
  TransactionKind,
} from '../api/types.js'

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'compte courant',
  savings: 'épargne',
  brokerage: 'PEA / compte-titres',
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
