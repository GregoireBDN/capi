import type { AccountType } from '#/api/types.gen'

/** French names of the account types. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Compte courant',
  savings: 'Livret d’épargne',
  brokerage: 'PEA / compte-titres',
  life_insurance: 'Assurance vie',
  employee_savings: 'Épargne salariale',
  crypto: 'Crypto',
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
