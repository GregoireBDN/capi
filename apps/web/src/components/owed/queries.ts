import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  contactsControllerContactOwed,
  contactsControllerCreate,
  contactsControllerList,
  contactsControllerRemove,
  contactsControllerUpdate,
  owedControllerSummary,
  owedLinksControllerClearRecurringShare,
  owedLinksControllerReplaceShares,
  owedLinksControllerSetRecurringShare,
  receivablesControllerCreateDebt,
  receivablesControllerForgive,
  receivablesControllerLink,
  receivablesControllerOptions,
  receivablesControllerRemove,
  receivablesControllerSuggestions,
  receivablesControllerUnforgive,
  receivablesControllerUnlink,
} from '#/api'
import type {
  CreateContactDto,
  CreateDebtDto,
  LinkRepaymentDto,
  ReplaceSharesDto,
  SetRecurringShareDto,
  UpdateContactDto,
} from '#/api/types.gen'
import { ApiRequestError, unwrap } from '#/lib/queries'

/**
 * Money owed between the owner and the people around him (#359): the
 * « Dépenses partagées » lists, contacts, shares, repayments and debts.
 */

export const UNDO_TOAST_MS = 8_000

export const owedKeys = {
  all: ['owed'] as const,
  summary: ['owed', 'summary'] as const,
  contacts: ['owed', 'contacts'] as const,
  contact: (id: string) => ['owed', 'contact', id] as const,
  options: (transactionId: string, contactId: string | null) =>
    ['owed', 'options', transactionId, contactId] as const,
  suggestions: ['owed', 'suggestions'] as const,
}

export const owedSummaryQuery = queryOptions({
  queryKey: owedKeys.summary,
  queryFn: () => unwrap(owedControllerSummary({ throwOnError: false })),
})

export function contactsQuery(archived = false) {
  return queryOptions({
    queryKey: [...owedKeys.contacts, archived],
    queryFn: () =>
      unwrap(
        contactsControllerList({
          query: archived ? { archived: true } : {},
          throwOnError: false,
        }),
      ),
  })
}

export function contactOwedQuery(id: string) {
  return queryOptions({
    queryKey: owedKeys.contact(id),
    queryFn: () =>
      unwrap(
        contactsControllerContactOwed({ path: { id }, throwOnError: false }),
      ),
  })
}

export function repaymentOptionsQuery(
  transactionId: string,
  contactId: string | null,
) {
  return queryOptions({
    queryKey: owedKeys.options(transactionId, contactId),
    queryFn: () =>
      unwrap(
        receivablesControllerOptions({
          query: {
            transactionId,
            ...(contactId ? { contactId } : {}),
          },
          throwOnError: false,
        }),
      ),
  })
}

export const repaymentSuggestionsQuery = queryOptions({
  queryKey: owedKeys.suggestions,
  queryFn: () =>
    unwrap(receivablesControllerSuggestions({ throwOnError: false })),
})

export const replaceShares = (id: string, body: ReplaceSharesDto) =>
  unwrap(
    owedLinksControllerReplaceShares({
      path: { id },
      body,
      throwOnError: false,
    }),
  )
export const createDebt = (body: CreateDebtDto) =>
  unwrap(receivablesControllerCreateDebt({ body, throwOnError: false }))
export const linkRepayment = (body: LinkRepaymentDto) =>
  unwrap(receivablesControllerLink({ body, throwOnError: false }))
export const unlinkPayment = (id: string) =>
  unwrap(receivablesControllerUnlink({ path: { id }, throwOnError: false }))
export const forgiveReceivable = (id: string, note?: string | null) =>
  unwrap(
    receivablesControllerForgive({
      path: { id },
      body: { note: note ?? null },
      throwOnError: false,
    }),
  )
export const unforgiveReceivable = (id: string) =>
  unwrap(receivablesControllerUnforgive({ path: { id }, throwOnError: false }))
export const removeReceivable = (id: string) =>
  unwrap(receivablesControllerRemove({ path: { id }, throwOnError: false }))
export const createContact = (body: CreateContactDto) =>
  unwrap(contactsControllerCreate({ body, throwOnError: false }))
export const updateContact = (id: string, body: UpdateContactDto) =>
  unwrap(contactsControllerUpdate({ path: { id }, body, throwOnError: false }))
export const removeContact = (id: string) =>
  unwrap(contactsControllerRemove({ path: { id }, throwOnError: false }))
export const setRecurringShare = (id: string, body: SetRecurringShareDto) =>
  unwrap(
    owedLinksControllerSetRecurringShare({
      path: { id },
      body,
      throwOnError: false,
    }),
  )
export const clearRecurringShare = (id: string) =>
  unwrap(
    owedLinksControllerClearRecurringShare({
      path: { id },
      throwOnError: false,
    }),
  )

/**
 * Everything money owed touches: the lists, the transactions (their owner's
 * part and flags), the statistics that read it and the forecast.
 */
export function afterOwedChanged(queryClient: QueryClient) {
  return Promise.all(
    [
      owedKeys.all,
      ['transactions'],
      ['budgets'],
      ['forecast'],
      ['spending'],
      ['dashboard'],
      ['recurring'],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}

/** French message for a failed request (the API's are English). */
export function owedErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) {
    return 'Impossible d’enregistrer. Réessayez.'
  }
  const message = error.apiMessage ?? ''
  if (error.status === null) return 'Pas de connexion. Réessayez.'
  if (message.includes('exceed the expense')) {
    return 'Les parts dépassent la dépense.'
  }
  if (message.includes('exceeds the transfer')) {
    return 'C’est plus que le virement.'
  }
  if (message.includes('exceeds what is left')) {
    return 'C’est plus que ce qui reste dû.'
  }
  if (message.includes('repaid or let go cannot be removed')) {
    return 'Une part déjà remboursée ou abandonnée ne peut pas être retirée.'
  }
  if (message.includes('less than what was repaid')) {
    return 'Une part ne peut pas être inférieure à ce qui a été remboursé.'
  }
  if (message.includes('partCents cannot exceed billCents')) {
    return 'Votre part ne peut pas dépasser l’addition.'
  }
  if (message.includes('already has this name')) {
    return 'Un contact porte déjà ce nom.'
  }
  if (message.includes('has a history')) {
    return 'Ce contact a un historique : archivez-le plutôt.'
  }
  if (message.includes('Already let go')) return 'Déjà abandonné.'
  if (message.includes('Already repaid')) return 'Déjà remboursé.'
  if (error.status === 403) return 'Reconnectez-vous pour faire ce changement.'
  return 'Impossible d’enregistrer. Réessayez.'
}
