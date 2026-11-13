import {
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Skeleton,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PlusIcon, WandSparklesIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { CategorizationRuleDto } from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { plural } from '#/lib/plural'
import { accountsQuery, categoriesQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { categoryProblem } from './describe'
import { ruleErrorMessage } from './errors'
import { moveById, moveOnto } from './order'
import {
  afterTransactionsChanged,
  applyRules,
  deleteRule,
  reorderRules,
  rulesKey,
  rulesQuery,
  updateRule,
} from './queries'
import { RuleEditorSheet } from './RuleEditorSheet'
import { RuleRow } from './RuleRow'

type Editing = { rule: CategorizationRuleDto | null } | null

/**
 * Settings page of the categorization rules, in evaluation order (the first
 * matching rule wins): enable, reorder (arrows, or drag with a mouse), edit
 * and test, delete, add, and apply the rules to existing transactions.
 */
export function RulesPage() {
  const queryClient = useQueryClient()
  const rules = useQuery({ ...rulesQuery, staleTime: 0 })
  const categories = useQuery(categoriesQuery)
  const accounts = useQuery(accountsQuery)
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<CategorizationRuleDto | null>(null)
  const [confirmApply, setConfirmApply] = useState(false)
  const [dragged, setDragged] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const list = rules.data ?? []
  const allCategories = categories.data ?? []
  const flagged = list.filter(
    (rule) => categoryProblem(rule, allCategories) !== null,
  ).length

  const setRules = (next: CategorizationRuleDto[]) =>
    queryClient.setQueryData(rulesKey, next)

  const reorder = useMutation({
    mutationFn: (next: CategorizationRuleDto[]) =>
      reorderRules(next.map((rule) => rule.id)),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: rulesKey })
      const previous =
        queryClient.getQueryData<CategorizationRuleDto[]>(rulesKey)
      setRules(next)
      return { previous }
    },
    onSuccess: (saved) => setRules(saved),
    onError: (error, _next, context) => {
      if (context?.previous) setRules(context.previous)
      toast.error(ruleErrorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: rulesKey }),
  })

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateRule(id, { enabled }),
    onMutate: ({ id, enabled }) => {
      setRules(
        (queryClient.getQueryData<CategorizationRuleDto[]>(rulesKey) ?? []).map(
          (rule) => (rule.id === id ? { ...rule, enabled } : rule),
        ),
      )
    },
    onError: (error) => toast.error(ruleErrorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: rulesKey }),
  })

  const remove = useMutation({
    mutationFn: (rule: CategorizationRuleDto) => deleteRule(rule.id),
    onSuccess: async () => {
      setDeleting(null)
      toast.success('Règle supprimée')
      await afterTransactionsChanged(queryClient)
    },
    onError: (error) => toast.error(ruleErrorMessage(error)),
  })

  const apply = useMutation({
    mutationFn: applyRules,
    onSuccess: async ({ updated }) => {
      setConfirmApply(false)
      toast.success(
        updated === 0
          ? 'Aucune opération n’a changé.'
          : `${plural(updated, 'opération mise à jour', 'opérations mises à jour')}.`,
      )
      await afterTransactionsChanged(queryClient)
    },
    onError: (error) => toast.error(ruleErrorMessage(error)),
  })

  function move(next: CategorizationRuleDto[]) {
    if (next.every((rule, index) => rule.id === list[index]?.id)) return
    reorder.mutate(next)
  }

  function endDrag() {
    setDragged(null)
    setOver(null)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24">
      <PageHeader
        title="Règles"
        description="Chaque opération importée est classée par la première règle qui lui correspond, de haut en bas. Changez l’ordre avec les flèches ou en glissant une règle."
      />
      <p className="text-sm">
        <Link
          to={ROUTES.categories}
          className="text-primary underline-offset-4 hover:underline"
        >
          Gérer les catégories
        </Link>
      </p>

      {rules.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {rules.isError && (
        <p role="alert" className="text-destructive text-sm">
          {ruleErrorMessage(rules.error)}
        </p>
      )}

      {rules.isSuccess && flagged > 0 && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
          {plural(
            flagged,
            'règle vise une catégorie archivée ou supprimée',
            'règles visent une catégorie archivée ou supprimée',
          )}{' '}
          : modifiez-les ou désactivez-les.
        </p>
      )}

      {rules.isSuccess && (
        <Card>
          <CardContent>
            {list.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucune règle pour l’instant. Ajoutez-en une ici, ou depuis une
                opération dont vous corrigez la catégorie.
              </p>
            ) : (
              <ol
                aria-label="Règles, dans l’ordre d’application"
                className="divide-border -mx-3 divide-y px-3"
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setOver(null)
                }}
              >
                {list.map((rule, index) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    index={index}
                    count={list.length}
                    categories={allCategories}
                    accounts={accounts.data ?? []}
                    busy={reorder.isPending}
                    onToggle={(target, enabled) =>
                      toggle.mutate({ id: target.id, enabled })
                    }
                    onMove={(target, step) =>
                      move(moveById(list, target.id, step))
                    }
                    onEdit={(target) => setEditing({ rule: target })}
                    onDelete={setDeleting}
                    dragging={dragged === rule.id}
                    dropTarget={dragged !== null && over === rule.id}
                    onDragStart={(target) => setDragged(target.id)}
                    onDragOver={(target) => setOver(target.id)}
                    onDrop={(target) => {
                      if (dragged) move(moveOnto(list, dragged, target.id))
                      endDrag()
                    }}
                    onDragEnd={endDrag}
                  />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 flex gap-2 sm:justify-end">
        <Button
          variant="secondary"
          className="shadow-lg"
          onClick={() => setEditing({ rule: null })}
          disabled={!rules.isSuccess}
        >
          <PlusIcon />
          <span className="max-sm:sr-only">Ajouter</span>
        </Button>
        <Button
          className="flex-1 shadow-lg sm:flex-none"
          onClick={() => setConfirmApply(true)}
          disabled={!rules.isSuccess || list.length === 0}
        >
          <WandSparklesIcon />
          Appliquer aux opérations existantes
        </Button>
      </div>

      <RuleEditorSheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        rule={editing?.rule ?? null}
        categories={allCategories}
        accounts={accounts.data ?? []}
        onSaved={(_rule, created) =>
          toast.success(created ? 'Règle ajoutée' : 'Règle enregistrée', {
            description:
              'Les opérations existantes changent quand vous appliquez les règles.',
            action: { label: 'Appliquer', onClick: () => apply.mutate() },
          })
        }
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Supprimer la règle ?"
        description="Les opérations qu’elle a classées repassent par les autres règles ; celles qu’aucune ne reconnaît retournent dans À revoir."
        confirmLabel="Supprimer"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting)
        }}
      />

      <ConfirmDialog
        open={confirmApply}
        onOpenChange={setConfirmApply}
        title="Appliquer les règles ?"
        description="Les opérations non classées et celles classées par une règle sont recalculées avec l’ordre actuel. Celles que vous avez classées à la main ne changent pas."
        confirmLabel="Appliquer"
        loading={apply.isPending}
        onConfirm={() => apply.mutate()}
      />
    </div>
  )
}
