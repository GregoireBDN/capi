import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  contactsControllerContactOwed,
  contactsControllerCreate,
  contactsControllerCreateOffset,
  contactsControllerOffsetProposal,
  contactsControllerList,
  contactsControllerRemove,
  contactsControllerUpdate,
  owedControllerSummary,
  owedLinksControllerClearRecurringShare,
  owedLinksControllerReplaceShares,
  owedLinksControllerSetRecurringShare,
  receivablesControllerCreateDebt,
  receivablesControllerFindOne,
  receivablesControllerForgive,
  receivablesControllerLink,
  receivablesControllerOptions,
  receivablesControllerRemove,
  receivablesControllerSuggestions,
  receivablesControllerUndoOffset,
  receivablesControllerUnforgive,
  receivablesControllerUnlink,
} from '#/api'
import type {
  CreateContactDto,
  CreateDebtDto,
  LinkItemDto,
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
  offer: (id: string) => ['owed', 'offer', id] as const,
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

/** The offset to propose with one person (#484); amount 0 when none. */
export function offsetProposalQuery(contactId: string) {
  return queryOptions({
    queryKey: owedKeys.offer(contactId),
    queryFn: () =>
      unwrap(
        contactsControllerOffsetProposal({
          path: { id: contactId },
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
/** Lets go `amountCents` of what is left, everything left when omitted (#437). */
export const forgiveReceivable = (
  id: string,
  { amountCents, note }: { amountCents?: number; note?: string | null } = {},
) =>
  unwrap(
    receivablesControllerForgive({
      path: { id },
      body: {
        ...(amountCents !== undefined ? { amountCents } : {}),
        note: note ?? null,
      },
      throwOnError: false,
    }),
  )
export const unforgiveReceivable = (id: string) =>
  unwrap(receivablesControllerUnforgive({ path: { id }, throwOnError: false }))
export const findReceivable = (id: string) =>
  unwrap(receivablesControllerFindOne({ path: { id }, throwOnError: false }))
export const removeReceivable = (id: string) =>
  unwrap(receivablesControllerRemove({ path: { id }, throwOnError: false }))
/** « Compenser » (#484): the items given, or the proposal. */
export const createOffset = (contactId: string, items?: LinkItemDto[]) =>
  unwrap(
    contactsControllerCreateOffset({
      path: { id: contactId },
      body: items ? { items } : {},
      throwOnError: false,
    }),
  )
/** « Annuler la compensation »: both sides together. */
export const undoOffset = (id: string) =>
  unwrap(receivablesControllerUndoOffset({ path: { id }, throwOnError: false }))
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
    return 'Une part déjà remboursée ou abandonnée ne peut pas être retirée : déliez d’abord ses remboursements, ou réclamez-la à nouveau.'
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
  if (message.includes('one side of an offset')) {
    return 'Ce règlement fait partie d’une compensation : annulez la compensation.'
  }
  if (message.includes('Nothing to offset')) return 'Rien à compenser.'
  if (message.includes('same amount on each side')) {
    return 'Une compensation règle le même montant de chaque côté.'
  }
  if (message.includes('Already let go')) return 'Déjà abandonné.'
  if (message.includes('Already repaid')) return 'Déjà remboursé.'
  if (error.status === 403) return 'Reconnectez-vous pour faire ce changement.'
  return 'Impossible d’enregistrer. Réessayez.'
}
