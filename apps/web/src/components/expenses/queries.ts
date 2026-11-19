import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  budgetsControllerEnvelopes,
  transactionsControllerCreateManual,
  transactionsControllerManualSuggestions,
  transactionsControllerRemoveManual,
  transactionsControllerUpdateManual,
} from '#/api'
import type {
  CreateManualTransactionDto,
  TransactionDto,
  TransactionKind,
  UpdateManualTransactionDto,
} from '#/api/types.gen'
import { ApiRequestError, unwrap } from '#/lib/queries'

export const envelopeKeys = {
  all: ['envelopes'] as const,
}

/** Envelopes of the current month (Europe/Paris, decided by the API). */
export const envelopesQuery = queryOptions({
  queryKey: envelopeKeys.all,
  queryFn: () => unwrap(budgetsControllerEnvelopes({ throwOnError: false })),
  // Expenses are noted elsewhere too (other tab, phone): refetch on mount.
  staleTime: 0,
})

/**
 * Labels and categories offered first when entering a transaction of this
 * kind by hand (#196). Under `transactions`, so every save refetches it.
 */
export const manualSuggestionsQuery = (kind: TransactionKind) =>
  queryOptions({
    queryKey: ['transactions', 'manual-suggestions', kind] as const,
    queryFn: () =>
      unwrap(
        transactionsControllerManualSuggestions({
          query: { kind },
          throwOnError: false,
        }),
      ),
    staleTime: 5 * 60_000,
  })

export function createManualExpense(body: CreateManualTransactionDto) {
  return unwrap(
    transactionsControllerCreateManual({ body, throwOnError: false }),
  )
}

export function updateManualExpense(
  id: string,
  body: UpdateManualTransactionDto,
) {
  return unwrap(
    transactionsControllerUpdateManual({
      path: { id },
      body,
      throwOnError: false,
    }),
  )
}

export function deleteManualExpense(id: string) {
  return unwrap(
    transactionsControllerRemoveManual({ path: { id }, throwOnError: false }),
  )
}

/**
 * Every field of a transaction entered by hand, as sent to create it again
 * (undo of a deletion) or to put it back as it was (undo of an edit).
 */
export function manualBody(
  item: TransactionDto,
): CreateManualTransactionDto & UpdateManualTransactionDto {
  return {
    amountCents: Math.abs(item.amountCents),
    direction: item.amountCents > 0 ? 'in' : 'out',
    kind: item.kind,
    categoryId: item.categoryId,
    bookingDate: item.bookingDate,
    label: item.rawLabel,
    accountId: item.accountId,
    isOneOff: item.isOneOff,
    note: item.note,
  }
}

/**
 * A manual expense counts in the envelopes, budgets, spending, dashboard,
 * transaction lists and account balances (a meal-voucher card's, #298):
 * refetch them all.
 */
export function afterManualExpenseChanged(queryClient: QueryClient) {
  return Promise.all(
    [
      envelopeKeys.all,
      ['accounts'],
      ['budgets'],
      ['dashboard'],
      ['transactions'],
      ['spending'],
      ['savings'],
      ['forecast'],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}

/**
 * After an edit made from the transactions list: every figure that depends
 * on transactions is refetched, but the lists are only marked stale so the
 * edited row does not jump or vanish under the user's finger.
 */
export function afterTransactionEdited(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: ['transactions', 'list'],
    refetchType: 'none',
  })
  return Promise.all(
    [
      envelopeKeys.all,
      ['budgets'],
      ['dashboard'],
      ['transactions', 'summary'],
      ['spending'],
      ['savings'],
      ['forecast'],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}

/** French message for a failed manual expense request. */
export function manualExpenseErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cette opération n’existe plus.'
  if (error.status === 400) {
    if (error.apiMessage?.includes('No checking account')) {
      return 'Ajoutez d’abord un compte courant.'
    }
    if (error.apiMessage?.includes('future')) {
      return 'La date ne peut pas être dans le futur.'
    }
    if (error.apiMessage?.includes('label or a categoryId')) {
      return 'Choisissez une catégorie ou indiquez un libellé.'
    }
    if (error.apiMessage?.includes('split')) {
      return 'L’opération est répartie : annulez la répartition avant de changer son montant.'
    }
    return 'Opération invalide : vérifiez le montant, la catégorie et le compte.'
  }
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
