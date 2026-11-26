import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  envelopesControllerApplySplit,
  envelopesControllerAttach,
  envelopesControllerCreate,
  envelopesControllerDetail,
  envelopesControllerDismiss,
  envelopesControllerForAccount,
  envelopesControllerList,
  envelopesControllerMonth,
  envelopesControllerMove,
  envelopesControllerOffers,
  envelopesControllerRemove,
  envelopesControllerSetSplitKey,
  envelopesControllerUpdate,
} from '#/api'
import type {
  ApplySplitDto,
  CreateEnvelopeDto,
  MoveEnvelopeMoneyDto,
  SetSplitKeyDto,
  UpdateEnvelopeDto,
} from '#/api/types.gen'
import { ApiRequestError, unwrap } from '#/lib/queries'

/**
 * Envelopes (#430, ADR 0008): money set aside for a goal, split across
 * accounts. Every write goes through the API's session-only routes; nothing
 * here changes a balance.
 */
export const envelopeKeys = {
  all: ['envelopes'] as const,
  list: (includeArchived: boolean) =>
    ['envelopes', 'list', includeArchived] as const,
  detail: (id: string) => ['envelopes', 'detail', id] as const,
  account: (accountId: string) => ['envelopes', 'account', accountId] as const,
  offers: ['envelopes', 'offers'] as const,
  month: (month: string) => ['envelopes', 'month', month] as const,
}

export function envelopesQuery(includeArchived = false) {
  return queryOptions({
    queryKey: envelopeKeys.list(includeArchived),
    queryFn: () =>
      unwrap(
        envelopesControllerList({
          query: { includeArchived },
          throwOnError: false,
        }),
      ),
  })
}

export function envelopeQuery(id: string) {
  return queryOptions({
    queryKey: envelopeKeys.detail(id),
    queryFn: () =>
      unwrap(envelopesControllerDetail({ path: { id }, throwOnError: false })),
  })
}

export function accountEnvelopesQuery(accountId: string) {
  return queryOptions({
    queryKey: envelopeKeys.account(accountId),
    queryFn: () =>
      unwrap(
        envelopesControllerForAccount({
          path: { id: accountId },
          throwOnError: false,
        }),
      ),
  })
}

export const envelopeOffersQuery = queryOptions({
  queryKey: envelopeKeys.offers,
  queryFn: () => unwrap(envelopesControllerOffers({ throwOnError: false })),
})

export function envelopeMonthQuery(month: string) {
  return queryOptions({
    queryKey: envelopeKeys.month(month),
    queryFn: () =>
      unwrap(
        envelopesControllerMonth({ query: { month }, throwOnError: false }),
      ),
  })
}

export function createEnvelope(body: CreateEnvelopeDto) {
  return unwrap(envelopesControllerCreate({ body, throwOnError: false }))
}

export function updateEnvelope(id: string, body: UpdateEnvelopeDto) {
  return unwrap(
    envelopesControllerUpdate({ path: { id }, body, throwOnError: false }),
  )
}

export function removeEnvelope(id: string) {
  return unwrap(
    envelopesControllerRemove({ path: { id }, throwOnError: false }),
  )
}

export function moveEnvelopeMoney(body: MoveEnvelopeMoneyDto) {
  return unwrap(envelopesControllerMove({ body, throwOnError: false }))
}

export function setSplitKey(accountId: string, body: SetSplitKeyDto) {
  return unwrap(
    envelopesControllerSetSplitKey({
      path: { id: accountId },
      body,
      throwOnError: false,
    }),
  )
}

export function applySplit(transactionId: string, body: ApplySplitDto = {}) {
  return unwrap(
    envelopesControllerApplySplit({
      path: { transactionId },
      body,
      throwOnError: false,
    }),
  )
}

export function attachToEnvelope(
  envelopeId: string,
  transactionId: string,
  amountCents?: number,
) {
  return unwrap(
    envelopesControllerAttach({
      path: { id: envelopeId },
      body: { transactionId, ...(amountCents ? { amountCents } : {}) },
      throwOnError: false,
    }),
  )
}

export function dismissOffer(transactionId: string) {
  return unwrap(
    envelopesControllerDismiss({
      path: { transactionId },
      throwOnError: false,
    }),
  )
}

/**
 * An envelope change shows on the account pages, Épargne, the budget (what
 * envelopes paid) and the transactions (the envelope of a row): refetch
 * them all.
 */
export function afterEnvelopesChanged(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: envelopeKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['budgets'] }),
    queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ])
}

/** French message for a failed envelope request (API messages stay in logs). */
export function envelopeErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cette enveloppe n’existe plus.'
  if (error.status === 409) {
    return 'Impossible : l’argent a déjà été déplacé ou dépensé.'
  }
  if (error.status === 400) {
    const message = error.apiMessage ?? ''
    if (/holds|libre|more than/i.test(message)) {
      return 'Montant trop élevé pour ce qui est disponible.'
    }
    return 'Données invalides. Vérifiez le formulaire.'
  }
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
