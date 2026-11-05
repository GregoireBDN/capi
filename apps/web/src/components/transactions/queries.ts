import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import {
  transactionsControllerList,
  transactionsControllerSummary,
} from '#/api'
import type {
  TransactionDto,
  TransactionListDto,
  TransactionSort,
} from '#/api/types.gen'
import { unwrap } from '#/lib/queries'
import type { TransactionFilters } from './search'

/** Transactions fetched per page (infinite scroll / "Charger plus"). */
export const TRANSACTIONS_PAGE_SIZE = 50

export const transactionKeys = {
  all: ['transactions'] as const,
  lists: ['transactions', 'list'] as const,
  list: (filters: TransactionFilters, sort: TransactionSort) =>
    ['transactions', 'list', filters, sort] as const,
  summaries: ['transactions', 'summary'] as const,
  summary: (filters: TransactionFilters) =>
    ['transactions', 'summary', filters] as const,
}

/**
 * Pages of transactions for the filters. Always refetched on mount
 * (`staleTime: 0`): the review queue changes transactions outside this cache.
 */
export function transactionListQuery(
  filters: TransactionFilters,
  sort: TransactionSort,
) {
  return infiniteQueryOptions({
    queryKey: transactionKeys.list(filters, sort),
    queryFn: ({ pageParam }) =>
      unwrap(
        transactionsControllerList({
          query: {
            ...filters,
            sort,
            page: pageParam,
            limit: TRANSACTIONS_PAGE_SIZE,
          },
          throwOnError: false,
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (last: TransactionListDto) =>
      last.page * last.limit < last.total ? last.page + 1 : undefined,
    staleTime: 0,
  })
}

export function transactionSummaryQuery(filters: TransactionFilters) {
  return queryOptions({
    queryKey: transactionKeys.summary(filters),
    queryFn: () =>
      unwrap(
        transactionsControllerSummary({ query: filters, throwOnError: false }),
      ),
    staleTime: 0,
  })
}

/**
 * Replaces transactions in every cached list (optimistic updates, server
 * answers, undo). Lists keep their order and content otherwise: a changed
 * transaction stays where it is until the next fetch.
 */
export function patchCachedTransactions(
  queryClient: QueryClient,
  updated: readonly TransactionDto[],
) {
  const byId = new Map(updated.map((item) => [item.id, item]))
  queryClient.setQueriesData<InfiniteData<TransactionListDto>>(
    { queryKey: transactionKeys.lists },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => byId.get(item.id) ?? item),
        })),
      },
  )
}

/**
 * After a change: totals are refetched now; lists are only marked stale so
 * edited rows do not jump or vanish under the user's finger.
 */
export function afterTransactionsChanged(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: transactionKeys.summaries })
  void queryClient.invalidateQueries({
    queryKey: transactionKeys.lists,
    refetchType: 'none',
  })
}
