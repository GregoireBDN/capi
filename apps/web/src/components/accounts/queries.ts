import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  accountsControllerBalanceHistory,
  accountsControllerCreate,
  accountsControllerDeletionPreview,
  accountsControllerFindOne,
  accountsControllerList,
  accountsControllerMonthFlows,
  accountsControllerRemove,
  accountsControllerUpdate,
  accountSnapshotsControllerBulk,
  accountSnapshotsControllerPerformance,
  accountSnapshotsControllerRemove,
  accountSnapshotsControllerUpsert,
  investmentsControllerFlows,
  investmentsControllerSummary,
} from '#/api'
import type {
  BulkSnapshotRowDto,
  CreateAccountDto,
  UpdateAccountDto,
  UpsertSnapshotDto,
} from '#/api/types.gen'
import { dashboardKeys } from '#/components/dashboard/queries'
import { savingsKeys } from '#/components/savings/queries'
import { referenceKeys, unwrap } from '#/lib/queries'

export const accountKeys = {
  /** Same root as the accounts list, so one invalidation refreshes both. */
  all: referenceKeys.accounts,
  detail: (id: string) => [...referenceKeys.accounts, id] as const,
  performance: (id: string) =>
    [...referenceKeys.accounts, id, 'performance'] as const,
  investments: ['investments', 'summary'] as const,
  balanceHistory: (id: string) =>
    [...referenceKeys.accounts, id, 'balance-history'] as const,
  monthFlows: (id: string) =>
    [...referenceKeys.accounts, id, 'month-flows'] as const,
  flows: ['investments', 'flows'] as const,
}

export function accountQuery(id: string) {
  return queryOptions({
    queryKey: accountKeys.detail(id),
    queryFn: () =>
      unwrap(accountsControllerFindOne({ path: { id }, throwOnError: false })),
  })
}

export function performanceQuery(id: string) {
  return queryOptions({
    queryKey: accountKeys.performance(id),
    queryFn: () =>
      unwrap(
        accountSnapshotsControllerPerformance({
          path: { id },
          throwOnError: false,
        }),
      ),
    // "Days since" depends on today: refetch on mount.
    staleTime: 0,
  })
}

/** Daily balance of a cash account over 12 months, and its import status. */
export function balanceHistoryQuery(id: string) {
  return queryOptions({
    queryKey: accountKeys.balanceHistory(id),
    queryFn: () =>
      unwrap(
        accountsControllerBalanceHistory({ path: { id }, throwOnError: false }),
      ),
    // Imports and transactions change it from other pages: refetch on mount.
    staleTime: 0,
  })
}

/** Money in and out of a cash account over its default month. */
export function monthFlowsQuery(id: string) {
  return queryOptions({
    queryKey: accountKeys.monthFlows(id),
    queryFn: () =>
      unwrap(
        accountsControllerMonthFlows({ path: { id }, throwOnError: false }),
      ),
    staleTime: 0,
  })
}
/** Where the invested money went over the last 12 months (#296). */
export const investmentFlowsQuery = queryOptions({
  queryKey: accountKeys.flows,
  queryFn: () => unwrap(investmentsControllerFlows({ throwOnError: false })),
  staleTime: 0,
})

export const investmentsSummaryQuery = queryOptions({
  queryKey: accountKeys.investments,
  queryFn: () => unwrap(investmentsControllerSummary({ throwOnError: false })),
  staleTime: 0,
})

export function saveSnapshot(
  id: string,
  date: string,
  body: UpsertSnapshotDto,
) {
  return unwrap(
    accountSnapshotsControllerUpsert({
      path: { id, date },
      body,
      throwOnError: false,
    }),
  )
}

export function removeSnapshot(id: string, date: string) {
  return unwrap(
    accountSnapshotsControllerRemove({
      path: { id, date },
      throwOnError: false,
    }),
  )
}

export function saveSnapshotHistory(id: string, rows: BulkSnapshotRowDto[]) {
  return unwrap(
    accountSnapshotsControllerBulk({
      path: { id },
      body: { rows },
      throwOnError: false,
    }),
  )
}

/** Archived accounts (the list endpoint leaves them out by default). */
export const archivedAccountsQuery = queryOptions({
  queryKey: [...referenceKeys.accounts, 'archived'] as const,
  queryFn: async () =>
    (
      await unwrap(
        accountsControllerList({
          query: { includeArchived: true },
          throwOnError: false,
        }),
      )
    ).filter((account) => account.archivedAt !== null),
})

export function createAccount(body: CreateAccountDto) {
  return unwrap(accountsControllerCreate({ body, throwOnError: false }))
}

/** What deleting the account would remove (#297), counted afresh each time. */
export function deletionPreviewQuery(id: string) {
  return queryOptions({
    queryKey: [...accountKeys.detail(id), 'deletion-preview'] as const,
    queryFn: () =>
      unwrap(
        accountsControllerDeletionPreview({
          path: { id },
          throwOnError: false,
        }),
      ),
    staleTime: 0,
    gcTime: 0,
  })
}

/** Deletes the account and all its data; needs a fresh session (`needsReauth`). */
export function deleteAccount(id: string) {
  return unwrap(accountsControllerRemove({ path: { id }, throwOnError: false }))
}

export function updateAccount(id: string, body: UpdateAccountDto) {
  return unwrap(
    accountsControllerUpdate({ path: { id }, body, throwOnError: false }),
  )
}

/**
 * A new, renamed or archived account changes every list of accounts: the
 * accounts pages, the dashboard, the savings page and the import page.
 */
export function afterAccountsChanged(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: accountKeys.all }),
    queryClient.invalidateQueries({ queryKey: accountKeys.investments }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
    queryClient.invalidateQueries({ queryKey: savingsKeys.all }),
  ])
}

/**
 * A snapshot changes the account's balance, its performance, the investments
 * summary, the dashboard net worth and the savings page.
 */
export function afterSnapshotsChanged(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: accountKeys.all }),
    queryClient.invalidateQueries({ queryKey: accountKeys.investments }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
    queryClient.invalidateQueries({ queryKey: savingsKeys.all }),
  ])
}
