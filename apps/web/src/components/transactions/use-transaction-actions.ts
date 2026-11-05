import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  transactionsControllerBulkUpdate,
  transactionsControllerUpdate,
} from '#/api'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { plural } from '#/lib/plural'
import {
  refreshReviewCount,
  scheduleReviewCountRefresh,
} from '#/lib/review-count'
import { applyChanges } from './changes'
import type { BulkChanges, TransactionChanges } from './changes'
import { KIND_LABELS, displayLabel } from './labels'
import {
  afterTransactionsChanged,
  patchCachedTransactions,
  transactionKeys,
} from './queries'
import { restoreTransactions } from './restore'
import type { RuleOffer } from './RuleOfferBanner'

/** How long a toast offering "Annuler" stays up (Sonner's default is 4 s). */
export const UNDO_TOAST_MS = 8000

function describeChange(
  changes: TransactionChanges,
  category: CategoryDto | undefined,
): string {
  if (category) return `Classée dans « ${category.name} »`
  if (changes.kind) return `Type : ${KIND_LABELS[changes.kind]}`
  if (changes.isOneOff !== undefined) {
    return changes.isOneOff
      ? 'Marquée comme ponctuelle'
      : 'N’est plus ponctuelle'
  }
  if (changes.needsReview !== undefined) {
    return changes.needsReview ? 'Remise à revoir' : 'Marquée comme revue'
  }
  return changes.note ? 'Note enregistrée' : 'Note supprimée'
}

function describeBulkChange(
  count: number,
  changes: BulkChanges,
  category: CategoryDto | undefined,
): string {
  const n = plural(count, 'opération', 'opérations')
  if (category)
    return `${n} ${count > 1 ? 'classées' : 'classée'} dans « ${category.name} »`
  if (changes.kind)
    return `Type « ${KIND_LABELS[changes.kind]} » appliqué à ${n}`
  if (changes.isOneOff !== undefined) {
    return changes.isOneOff
      ? `${n} ${count > 1 ? 'marquées ponctuelles' : 'marquée ponctuelle'}`
      : `${n} ${count > 1 ? 'ne sont plus ponctuelles' : 'n’est plus ponctuelle'}`
  }
  return changes.needsReview
    ? `${n} ${count > 1 ? 'remises' : 'remise'} à revoir`
    : `${n} ${count > 1 ? 'marquées comme revues' : 'marquée comme revue'}`
}

/**
 * Corrections from the transactions page, one transaction or a selection:
 * optimistic in every cached list, rolled back if the API refuses, with an
 * "Annuler" toast. A category change offers to create a rule from it.
 */
export function useTransactionActions(categories: readonly CategoryDto[]) {
  const queryClient = useQueryClient()
  const [offer, setOffer] = useState<RuleOffer | null>(null)
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  async function optimistic(updated: readonly TransactionDto[]) {
    await queryClient.cancelQueries({ queryKey: transactionKeys.lists })
    patchCachedTransactions(queryClient, updated)
  }

  function settled() {
    afterTransactionsChanged(queryClient)
    scheduleReviewCountRefresh()
  }

  /** Puts transactions back as they were before a correction. */
  async function undo(previous: readonly TransactionDto[], noteOnly = false) {
    await optimistic(previous)
    const restored = noteOnly
      ? (
          await transactionsControllerUpdate({
            path: { id: previous[0].id },
            body: { note: previous[0].note ?? '' },
            throwOnError: false,
          })
        ).data !== undefined
      : await restoreTransactions(previous)
    settled()
    if (!restored) {
      toast.error('Impossible d’annuler la modification.')
      void queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      return
    }
    setOffer((current) =>
      current && previous.some((item) => item.id === current.transaction.id)
        ? null
        : current,
    )
  }

  function undoable(previous: readonly TransactionDto[], noteOnly = false) {
    return {
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Annuler',
        onClick: () => void undo(previous, noteOnly),
      },
    }
  }

  /** Applies `changes` to one transaction. */
  async function update(item: TransactionDto, changes: TransactionChanges) {
    const category =
      changes.categoryId != null
        ? categoriesById.get(changes.categoryId)
        : undefined
    await optimistic([applyChanges(item, changes, categoriesById)])
    const { data } = await transactionsControllerUpdate({
      path: { id: item.id },
      body: changes,
      throwOnError: false,
    })
    if (!data) {
      patchCachedTransactions(queryClient, [item])
      toast.error('La modification n’a pas pu être enregistrée.')
      return
    }
    patchCachedTransactions(queryClient, [data])
    settled()
    const noteOnly = Object.keys(changes).every((key) => key === 'note')
    toast.success(describeChange(changes, category), {
      description: displayLabel(item),
      ...undoable([item], noteOnly),
    })
    if (category) setOffer({ transaction: item, category })
  }

  /** Applies the same `changes` to every transaction of `items`. */
  async function updateMany(
    items: readonly TransactionDto[],
    changes: BulkChanges,
  ): Promise<boolean> {
    if (items.length === 0) return false
    const category =
      changes.categoryId != null
        ? categoriesById.get(changes.categoryId)
        : undefined
    await optimistic(
      items.map((item) => applyChanges(item, changes, categoriesById)),
    )
    const { data } = await transactionsControllerBulkUpdate({
      body: { ...changes, ids: items.map((item) => item.id) },
      throwOnError: false,
    })
    if (!data) {
      patchCachedTransactions(queryClient, items)
      toast.error('Les opérations n’ont pas pu être modifiées.')
      return false
    }
    settled()
    toast.success(
      describeBulkChange(items.length, changes, category),
      undoable(items),
    )
    return true
  }

  /** A rule was created and applied: everything may have moved. */
  function onRuleCreated(updated: number) {
    setOffer(null)
    toast.success(
      `Règle créée : ${plural(updated, 'opération recatégorisée', 'opérations recatégorisées')}`,
    )
    void queryClient.invalidateQueries({ queryKey: transactionKeys.all })
    void refreshReviewCount()
  }

  return { update, updateMany, offer, setOffer, onRuleCreated }
}
