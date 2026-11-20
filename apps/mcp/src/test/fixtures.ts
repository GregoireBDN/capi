// Synthetic data only: invented names, labels and amounts.
import type {
  AccountDto,
  CategoryDto,
  MonthFlowDto,
  MonthPeriodDto,
  TransactionDto,
} from '../api/types.js'

const stamp = '2026-01-01T00:00:00.000Z'

export const checking: AccountDto = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Compte courant',
  type: 'checking',
  institution: 'Banque Test',
  position: 0,
  archivedAt: null,
  balanceCents: 123456,
  balanceDate: '2026-11-10',
  cryptoSource: null,
  cryptoProvider: null,
  cryptoSyncedAt: null,
  investedBaseCents: null,
  investedBaseOn: null,
  createdAt: stamp,
  updatedAt: stamp,
}

export const livret: AccountDto = {
  ...checking,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Livret A',
  type: 'savings',
  position: 1,
}

export const pea: AccountDto = {
  ...checking,
  id: '00000000-0000-4000-8000-000000000003',
  name: 'PEA',
  type: 'brokerage',
  position: 2,
}

export const mealVoucher: AccountDto = {
  ...checking,
  id: '00000000-0000-4000-8000-000000000004',
  name: 'Titres-restaurant',
  type: 'meal_voucher',
  institution: null,
  position: 3,
}

export const groceries: CategoryDto = {
  id: '00000000-0000-4000-8000-0000000000c1',
  slug: 'groceries',
  name: 'Courses',
  kind: 'expense',
  color: null,
  icon: null,
  archivedAt: null,
  createdAt: stamp,
  updatedAt: stamp,
}

export const restaurants: CategoryDto = {
  ...groceries,
  id: '00000000-0000-4000-8000-0000000000c2',
  slug: 'restaurants',
  name: 'Restaurants',
}

export const salary: CategoryDto = {
  ...groceries,
  id: '00000000-0000-4000-8000-0000000000c3',
  slug: 'salary',
  name: 'Salaire',
  kind: 'income',
}

export const transaction: TransactionDto = {
  id: '00000000-0000-4000-8000-0000000000t1',
  accountId: checking.id,
  accountName: checking.name,
  paidByContactId: null,
  paidByContactName: null,
  importId: null,
  bookingDate: '2026-11-03',
  valueDate: null,
  amountCents: -4520,
  rawLabel: 'CB EPICERIE TEST',
  merchant: 'EPICERIE TEST',
  kind: 'expense',
  categoryId: groceries.id,
  category: {
    id: groceries.id,
    slug: groceries.slug,
    name: groceries.name,
    color: null,
    icon: null,
    kind: 'expense',
  },
  ruleId: null,
  needsReview: false,
  isOneOff: false,
  note: null,
  manual: false,
  prepaidItemId: null,
  prepaidTermMonths: null,
  originalAmountCents: null,
  originalBookingDate: null,
  counterpartAccountId: null,
  counterpartAccountName: null,
  splits: [],
  shares: [],
  repayments: [],
  createdAt: stamp,
  updatedAt: stamp,
}

export function period(
  overrides: Partial<MonthPeriodDto> = {},
): MonthPeriodDto {
  return {
    month: '2026-11',
    dataUntil: '2026-11-10',
    status: 'partial',
    throughDay: 10,
    previousMonth: '2026-10',
    previousUntil: '2026-10-10',
    defaultMonth: '2026-11',
    ...overrides,
  }
}

export function flow(overrides: Partial<MonthFlowDto> = {}): MonthFlowDto {
  return {
    month: '2026-10',
    until: '2026-10-31',
    incomeCents: 250000,
    expenseCents: -180000,
    netCents: 70000,
    oneOffIncomeCents: 0,
    oneOffExpenseCents: 0,
    savingsRate: 0.28,
    ...overrides,
  }
}
