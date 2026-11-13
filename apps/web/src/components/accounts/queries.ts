import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  accountsControllerCreate,
  accountsControllerFindOne,
  accountsControllerList,
  accountsControllerUpdate,
  accountSnapshotsControllerBulk,
  accountSnapshotsControllerPerformance,
  accountSnapshotsControllerRemove,
  accountSnapshotsControllerUpsert,
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
 * summary and the dashboard net worth.
 */
export function afterSnapshotsChanged(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: accountKeys.all }),
    queryClient.invalidateQueries({ queryKey: accountKeys.investments }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
  ])
}
