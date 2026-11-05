import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
} from '@finances/ui'
import { CheckIcon, CircleCheckBigIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  categoriesControllerList,
  transactionsControllerBulkUpdate,
  transactionsControllerList,
  transactionsControllerUpdate,
} from '#/api'
import type {
  CategoryDto,
  TransactionDto,
  TransactionKind,
  UpdateTransactionDto,
} from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { CategoryPicker } from '#/components/transactions/CategoryPicker'
import { displayLabel } from '#/components/transactions/labels'
import { restoreTransactions } from '#/components/transactions/restore'
import { RuleFromCorrectionDialog } from '#/components/transactions/RuleFromCorrectionDialog'
import type { RuleCreatedResult } from '#/components/transactions/RuleFromCorrectionDialog'
import { RuleOfferBanner } from '#/components/transactions/RuleOfferBanner'
import type { RuleOffer } from '#/components/transactions/RuleOfferBanner'
import { plural } from '#/lib/plural'
import {
  adjustReviewCount,
  refreshReviewCount,
  scheduleReviewCountRefresh,
  setReviewCount,
} from '#/lib/review-count'
import { ReviewItem } from './ReviewItem'

/** How long a toast offering "Annuler" stays up (Sonner's default is 4 s). */
const UNDO_TOAST_MS = 8000

/** Transactions fetched per page ("Charger plus"). */
export const REVIEW_PAGE_SIZE = 50

/** Queue order, as the API sorts it: newest date first, then id descending. */
function byQueueOrder(a: TransactionDto, b: TransactionDto) {
  if (a.bookingDate !== b.bookingDate) {
    return a.bookingDate < b.bookingDate ? 1 : -1
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/**
 * The review queue: transactions flagged `needsReview`, newest first, with
 * one-click corrections (category, kind, one-off, validate), undo, bulk
 * actions, and rule creation from a correction.
 *
 * Corrections are optimistic: the item leaves the list at once and comes back
 * if the API refuses the change.
 */
export function ReviewQueue() {
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [items, setItems] = useState<TransactionDto[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [offer, setOffer] = useState<RuleOffer | null>(null)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const fetchPage = useCallback(async (page: number) => {
    const { data } = await transactionsControllerList({
      query: { needsReview: true, page, limit: REVIEW_PAGE_SIZE },
      throwOnError: false,
    })
    if (data) setReviewCount(data.total)
    return data
  }, [])

  /** First page; `silent` keeps the current list on screen meanwhile. */
  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setStatus('loading')
      const [page, cats] = await Promise.all([
        fetchPage(1),
        categoriesControllerList({ throwOnError: false }),
      ])
      if (!page || !cats.data) {
        if (silent) toast.error('Impossible de recharger la file de revue.')
        else setStatus('error')
        return
      }
      setCategories(cats.data)
      setItems(page.items)
      setTotal(page.total)
      setSelected(new Set())
      setStatus('ready')
    },
    [fetchPage],
  )

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Next items. Corrections shift the server's pages, so the page holding the
   * first item not shown yet is fetched and merged without duplicates: no
   * item is ever skipped.
   */
  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    const page = await fetchPage(
      Math.floor(items.length / REVIEW_PAGE_SIZE) + 1,
    )
    setLoadingMore(false)
    if (!page) {
      toast.error('Impossible de charger la suite. Réessayez.')
      return
    }
    setTotal(page.total)
    setItems((current) => {
      const known = new Set(current.map((item) => item.id))
      return [
        ...current,
        ...page.items.filter((item) => !known.has(item.id)),
      ].sort(byQueueOrder)
    })
  }, [fetchPage, items.length])

  // Everything shown was handled but more is waiting: fetch it.
  useEffect(() => {
    if (status === 'ready' && items.length === 0 && total > 0 && !loadingMore) {
      void loadMore()
    }
  }, [status, items.length, total, loadingMore, loadMore])

  function removeLocal(ids: readonly string[]) {
    const gone = new Set(ids)
    setItems((current) => current.filter((item) => !gone.has(item.id)))
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) next.delete(id)
      return next
    })
    setTotal((current) => Math.max(0, current - ids.length))
    adjustReviewCount(-ids.length)
  }

  function restoreLocal(previous: readonly TransactionDto[]) {
    const back = new Map(previous.map((item) => [item.id, item]))
    setItems((current) =>
      [...current.filter((item) => !back.has(item.id)), ...back.values()].sort(
        byQueueOrder,
      ),
    )
    setTotal((current) => current + previous.length)
    adjustReviewCount(previous.length)
  }

  function replaceLocal(updated: TransactionDto) {
    setItems((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    )
  }

  /** Puts corrected transactions back in the queue as they were. */
  async function undo(previous: readonly TransactionDto[]) {
    const restored = await restoreTransactions(previous)
    scheduleReviewCountRefresh()
    if (!restored) {
      toast.error('Impossible d’annuler la correction.')
      void load({ silent: true })
      return
    }
    restoreLocal(previous)
    setOffer((current) =>
      current && previous.some((item) => item.id === current.transaction.id)
        ? null
        : current,
    )
  }

  /** Toast options offering to undo a correction. */
  function undoable(previous: readonly TransactionDto[]) {
    return {
      duration: UNDO_TOAST_MS,
      action: { label: 'Annuler', onClick: () => void undo(previous) },
    }
  }

  async function categorize(item: TransactionDto, categoryId: string) {
    const category = categoriesById.get(categoryId)
    if (!category) return
    removeLocal([item.id])
    const { data } = await transactionsControllerUpdate({
      path: { id: item.id },
      body: { categoryId },
      throwOnError: false,
    })
    scheduleReviewCountRefresh()
    if (!data) {
      restoreLocal([item])
      toast.error('La catégorie n’a pas pu être enregistrée.')
      return
    }
    setOffer({ transaction: item, category })
    toast.success(`Classée dans « ${category.name} »`, {
      description: displayLabel(item),
      ...undoable([item]),
    })
  }

  async function validate(item: TransactionDto) {
    removeLocal([item.id])
    const { data } = await transactionsControllerUpdate({
      path: { id: item.id },
      body: { needsReview: false },
      throwOnError: false,
    })
    scheduleReviewCountRefresh()
    if (!data) {
      restoreLocal([item])
      toast.error('L’opération n’a pas pu être validée.')
      return
    }
    toast.success('Opération validée', {
      description: displayLabel(item),
      ...undoable([item]),
    })
  }

  /** In-place change that keeps the item in the queue (kind, one-off). */
  async function patchInPlace(
    item: TransactionDto,
    body: Pick<UpdateTransactionDto, 'kind' | 'isOneOff'>,
  ) {
    replaceLocal({ ...item, ...body })
    const { data } = await transactionsControllerUpdate({
      path: { id: item.id },
      body,
      throwOnError: false,
    })
    if (!data) {
      replaceLocal(item)
      toast.error('La modification n’a pas pu être enregistrée.')
      return
    }
    replaceLocal(data)
  }

  const selectedItems = items.filter((item) => selected.has(item.id))
  const allSelected = items.length > 0 && selectedItems.length === items.length
  const canBulkValidate =
    selectedItems.length > 0 && selectedItems.every((item) => item.categoryId)

  async function bulkUpdate(
    body: { categoryId: string } | { needsReview: false },
    message: string,
  ) {
    const previous = selectedItems
    if (previous.length === 0) return
    setBulkBusy(true)
    removeLocal(previous.map((item) => item.id))
    const { data } = await transactionsControllerBulkUpdate({
      body: { ...body, ids: previous.map((item) => item.id) },
      throwOnError: false,
    })
    setBulkBusy(false)
    scheduleReviewCountRefresh()
    if (!data) {
      restoreLocal(previous)
      toast.error('Les opérations n’ont pas pu être modifiées.')
      return
    }
    toast.success(message, undoable(previous))
  }

  function bulkCategorize(categoryId: string) {
    const category = categoriesById.get(categoryId)
    if (!category) return
    void bulkUpdate(
      { categoryId },
      `${plural(selectedItems.length, 'opération classée', 'opérations classées')} dans « ${category.name} »`,
    )
  }

  function bulkValidate() {
    void bulkUpdate(
      { needsReview: false },
      plural(selectedItems.length, 'opération validée', 'opérations validées'),
    )
  }

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function onRuleCreated({ updated }: RuleCreatedResult) {
    setOffer(null)
    toast.success(
      `Règle créée : ${plural(updated, 'opération recatégorisée', 'opérations recatégorisées')}`,
    )
    void load({ silent: true })
    void refreshReviewCount()
  }

  const description =
    status === 'ready' && total > 0
      ? `${plural(total, 'opération à vérifier', 'opérations à vérifier')} : catégorisez-les ou validez-les.`
      : 'Les opérations non reconnues ou signalées lors des imports.'

  return (
    <div className="space-y-6">
      <PageHeader title="À revoir" description={description} />

      {offer && (
        <RuleOfferBanner
          offer={offer}
          onCreateRule={() => setRuleDialogOpen(true)}
          onDismiss={() => setOffer(null)}
        />
      )}

      {status === 'loading' && (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger la file de revue.</AlertTitle>
          <AlertDescription>
            <Button size="sm" outline onClick={() => void load()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {status === 'ready' && total === 0 && items.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheckBigIcon />
            </EmptyMedia>
            <EmptyTitle>Tout est à jour</EmptyTitle>
            <EmptyDescription>
              Aucune opération à revoir. Les opérations non reconnues lors des
              prochains imports apparaîtront ici.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {status === 'ready' && items.length > 0 && (
        <>
          <div className="flex items-center gap-3 px-3 sm:px-4">
            <Checkbox
              id="review-select-all"
              checked={
                allSelected
                  ? true
                  : selectedItems.length > 0
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={(checked) =>
                setSelected(
                  checked === true
                    ? new Set(items.map((item) => item.id))
                    : new Set(),
                )
              }
            />
            <label htmlFor="review-select-all" className="text-sm">
              Tout sélectionner
            </label>
          </div>

          <ul className="space-y-3" aria-label="Opérations à revoir">
            {items.map((item) => (
              <ReviewItem
                key={item.id}
                item={item}
                categories={categories}
                selected={selected.has(item.id)}
                onSelectedChange={(on) => toggle(item.id, on)}
                onCategory={(categoryId) => void categorize(item, categoryId)}
                onKind={(kind: TransactionKind) =>
                  void patchInPlace(item, { kind })
                }
                onOneOff={(isOneOff) => void patchInPlace(item, { isOneOff })}
                onValidate={() => void validate(item)}
              />
            ))}
          </ul>

          {items.length < total && (
            <div className="flex justify-center">
              <Button
                outline
                variant="secondary"
                loading={loadingMore}
                onClick={() => void loadMore()}
              >
                Charger plus ({total - items.length} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      {selectedItems.length > 0 && (
        <div
          role="region"
          aria-label="Actions groupées"
          className="bg-card sticky bottom-4 z-10 flex flex-col gap-2 rounded-xl border p-3 shadow-lg lg:flex-row lg:items-center lg:gap-3"
        >
          <div className="flex items-center justify-between gap-2 lg:justify-start">
            <p className="text-sm font-medium">
              {plural(
                selectedItems.length,
                'opération sélectionnée',
                'opérations sélectionnées',
              )}
            </p>
            <Button
              size="sm"
              variant="secondary"
              ghost
              onClick={() => setSelected(new Set())}
            >
              Désélectionner
            </Button>
          </div>
          <div className="flex flex-1 items-center gap-2 lg:justify-end">
            <CategoryPicker
              categories={categories}
              value={null}
              onChange={bulkCategorize}
              label="Classer la sélection dans"
              placeholder="Classer dans…"
              disabled={bulkBusy}
              className="min-w-0 flex-1 lg:w-56 lg:flex-none"
            />
            <Button
              size="sm"
              variant="success"
              outline
              iconStart={<CheckIcon />}
              aria-label="Valider la sélection"
              disabled={!canBulkValidate || bulkBusy}
              title={
                canBulkValidate
                  ? undefined
                  : 'Les opérations sans catégorie doivent d’abord être classées'
              }
              onClick={bulkValidate}
            >
              Valider
            </Button>
          </div>
        </div>
      )}

      {offer && (
        <RuleFromCorrectionDialog
          open={ruleDialogOpen}
          onOpenChange={setRuleDialogOpen}
          transaction={offer.transaction}
          category={offer.category}
          onCreated={onRuleCreated}
        />
      )}
    </div>
  )
}
