import type { AccountType, MonthFlowDto, MonthPeriodDto } from '#/api/types.gen'

/** French names of the account types. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Compte courant',
  savings: 'Livret d’épargne',
  brokerage: 'PEA / compte-titres',
  life_insurance: 'Assurance vie',
  employee_savings: 'Épargne salariale',
  crypto: 'Crypto',
  meal_voucher: 'Titres-restaurant',
}

const percentPoints = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

/** Difference of two ratios in percentage points: `0.023` → `+2,3 pts`. */
export function formatPoints(ratioDelta: number): string {
  const points = Math.round(ratioDelta * 1000) / 10
  return `${percentPoints.format(points)} pt${Math.abs(points) >= 2 ? 's' : ''}`
}

/**
 * Why the savings rate is a dash (null when there is no positive income to
 * divide by), or null when it has a value.
 */
export function savingsRateNote(
  flow: Pick<MonthFlowDto, 'incomeCents' | 'savingsRate'>,
  period: Pick<MonthPeriodDto, 'status'>,
): string | null {
  if (flow.savingsRate !== null) return null
  if (flow.incomeCents < 0) return 'Revenus négatifs ce mois-ci'
  return period.status === 'complete'
    ? 'Aucun revenu ce mois-là'
    : 'Pas encore de revenus ce mois-ci'
}
