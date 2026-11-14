import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  budgetsControllerEnvelopes,
  transactionsControllerCreateManual,
  transactionsControllerRemoveManual,
  transactionsControllerUpdateManual,
} from '#/api'
import type {
  CreateManualExpenseDto,
  UpdateManualExpenseDto,
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

export function createManualExpense(body: CreateManualExpenseDto) {
  return unwrap(
    transactionsControllerCreateManual({ body, throwOnError: false }),
  )
}

export function updateManualExpense(id: string, body: UpdateManualExpenseDto) {
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
 * A manual expense counts in the envelopes, budgets, spending, dashboard
 * and transaction lists: refetch them all.
 */
export function afterManualExpenseChanged(queryClient: QueryClient) {
  return Promise.all(
    [
      envelopeKeys.all,
      ['budgets'],
      ['dashboard'],
      ['transactions'],
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
  if (error.status === 404) return 'Cette dépense n’existe plus.'
  if (error.status === 400) {
    if (error.apiMessage?.includes('No checking account')) {
      return 'Ajoutez d’abord un compte courant.'
    }
    if (error.apiMessage?.includes('future')) {
      return 'La date ne peut pas être dans le futur.'
    }
    return 'Dépense invalide : vérifiez le montant, la catégorie et le compte.'
  }
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
