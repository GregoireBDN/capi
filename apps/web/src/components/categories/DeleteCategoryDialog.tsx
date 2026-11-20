import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Skeleton,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { CategoryDto, CategoryUsageDto } from '#/api/types.gen'
import { CategoryField } from './CategoryPicker'
import { categoryErrorMessage } from './errors'
import {
  afterCategoriesChanged,
  deleteCategory,
  fetchCategoryUsage,
} from './queries'

interface DeleteCategoryDialogProps {
  /** Category to delete; null when closed. */
  category: CategoryDto | null
  /** Every category (targets are picked among them). */
  categories: readonly CategoryDto[]
  onClose: () => void
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

/** "12 opérations, 1 règle et 3 objectifs de budget". */
export function describeUsage(usage: CategoryUsageDto): string {
  const parts = [
    usage.transactions > 0 &&
      plural(usage.transactions, 'opération', 'opérations'),
    usage.rules > 0 && plural(usage.rules, 'règle', 'règles'),
    usage.budgets > 0 &&
      plural(usage.budgets, 'objectif de budget', 'objectifs de budget'),
    usage.recurringItems > 0 &&
      plural(usage.recurringItems, 'abonnement', 'abonnements'),
  ].filter((part): part is string => typeof part === 'string')
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`
}

function inUse(usage: CategoryUsageDto): boolean {
  return (
    usage.transactions + usage.rules + usage.budgets + usage.recurringItems > 0
  )
}

/**
 * Deletes a category. When something uses it, a target category of the same
 * kind is required: everything moves there in one go, so no transaction is
 * left without a category.
 */
export function DeleteCategoryDialog({
  category,
  categories,
  onClose,
}: DeleteCategoryDialogProps) {
  const queryClient = useQueryClient()
  const id = useId()
  const [target, setTarget] = useState('')

  const usage = useQuery({
    queryKey: ['categories', 'usage', category?.id],
    queryFn: () => fetchCategoryUsage(category!.id),
    enabled: category !== null,
    staleTime: 0,
  })

  const targets = categories.filter(
    (c) => c.kind === category?.kind && c.id !== category.id && !c.archivedAt,
  )

  useEffect(() => {
    setTarget('')
  }, [category?.id])

  const needsTarget = usage.data ? inUse(usage.data) : false

  const remove = useMutation({
    mutationFn: () =>
      deleteCategory(category!.id, needsTarget ? target : undefined),
    onSuccess: async () => {
      const moved = targets.find((c) => c.id === target)
      toast.success(
        needsTarget && moved
          ? `Catégorie ${category!.name} supprimée, contenu déplacé vers ${moved.name}`
          : `Catégorie ${category!.name} supprimée`,
      )
      onClose()
      await afterCategoriesChanged(queryClient)
    },
    onError: (error) => toast.error(categoryErrorMessage(error)),
  })

  const canDelete =
    usage.isSuccess && (!needsTarget || target !== '') && !remove.isPending

  return (
    <Dialog
      open={category !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer {category?.name} ?</DialogTitle>
          <DialogDescription>
            La suppression est définitive. Pour garder l’historique sans la
            proposer, archivez-la plutôt.
          </DialogDescription>
        </DialogHeader>

        {usage.isPending && <Skeleton className="h-16 w-full" />}
        {usage.isError && (
          <p className="text-destructive text-sm">
            {categoryErrorMessage(usage.error)}
          </p>
        )}
        {usage.data && !needsTarget && (
          <p className="text-muted-foreground text-sm">
            Aucune opération, règle, budget ni abonnement n’utilise cette
            catégorie.
          </p>
        )}
        {usage.data && needsTarget && (
          <div className="space-y-3">
            <p className="text-sm">
              {describeUsage(usage.data)} seront déplacés vers la catégorie
              choisie. Ses objectifs de budget s’ajoutent aux siens.
            </p>
            {targets.length > 0 ? (
              <Field>
                <FieldLabel htmlFor={`${id}-target`}>Déplacer vers</FieldLabel>
                <CategoryField
                  id={`${id}-target`}
                  label="Déplacer vers"
                  categories={targets}
                  kinds={category ? [category.kind] : undefined}
                  value={target || null}
                  onPick={setTarget}
                />
              </Field>
            ) : (
              <p className="text-destructive text-sm">
                Aucune autre catégorie de ce type : ajoutez-en une avant de
                supprimer celle-ci.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" outline onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={!canDelete}
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {needsTarget ? 'Déplacer et supprimer' : 'Supprimer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
