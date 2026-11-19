import {
  Badge,
  Button,
  Card,
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
  Skeleton,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, WandSparklesIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type {
  CategorizationRuleDto,
  CategoryDto,
  TransactionKind,
} from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { TRANSACTION_KINDS } from '#/components/transactions/labels'
import { plural } from '#/lib/plural'
import { accountsQuery, categoriesQuery } from '#/lib/queries'
import { ruleErrorMessage } from './errors'
import {
  afterTransactionsChanged,
  applyRules,
  rulesInsightsQuery,
  rulesQuery,
} from './queries'
import { EvaluationOrder } from './EvaluationOrder'
import { RuleConflicts } from './RuleConflicts'
import { RuleEditorSheet } from './RuleEditorSheet'
import { RuleRow } from './RuleRow'
import { useRuleActions } from './use-rule-actions'

type Editing = { rule: CategorizationRuleDto | null } | null

interface RuleGroup {
  categoryId: string
  category: CategoryDto | undefined
  rules: CategorizationRuleDto[]
}

const KIND_ORDER: Record<TransactionKind, number> = Object.fromEntries(
  TRANSACTION_KINDS.map((kind, index) => [kind, index]),
) as Record<TransactionKind, number>

/**
 * The rules by target category (#299): expenses, income, then internal
 * moves, each by name; an unknown category last. Inside a group the rules
 * keep the evaluation order.
 */
export function groupRules(
  rules: readonly CategorizationRuleDto[],
  categories: readonly CategoryDto[],
): RuleGroup[] {
  const groups = new Map<string, RuleGroup>()
  for (const rule of rules) {
    let group = groups.get(rule.categoryId)
    if (!group) {
      group = {
        categoryId: rule.categoryId,
        category: categories.find((c) => c.id === rule.categoryId),
        rules: [],
      }
      groups.set(rule.categoryId, group)
    }
    group.rules.push(rule)
  }
  for (const group of groups.values()) {
    group.rules.sort((a, b) => a.rank - b.rank)
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.category || !b.category) {
      return a.category ? -1 : b.category ? 1 : 0
    }
    return (
      KIND_ORDER[a.category.kind] - KIND_ORDER[b.category.kind] ||
      a.category.name.localeCompare(b.category.name, 'fr')
    )
  })
}

/**
 * Settings page of the categorization rules (#299), read as sentences: the
 * rules by category with how many transactions each catches over 12 months,
 * the rules that overlap with a one-tap fix, and « Nouvelle règle ». There
 * is no order to set: the most specific rule wins, and the explicit order
 * (a rule's priority) stays under « Avancé ». Every save applies the rules
 * to the existing transactions, with « Annuler ».
 */
export function RulesPage() {
  const queryClient = useQueryClient()
  const rules = useQuery({ ...rulesQuery, staleTime: 0 })
  const insights = useQuery({ ...rulesInsightsQuery, staleTime: 0 })
  const categories = useQuery(categoriesQuery)
  const accounts = useQuery(accountsQuery)
  const actions = useRuleActions()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<CategorizationRuleDto | null>(null)
  const [confirmApply, setConfirmApply] = useState(false)

  const list = rules.data ?? []
  const allCategories = categories.data ?? []
  const allAccounts = accounts.data ?? []
  const counts = new Map(
    (insights.data?.rules ?? []).map((usage) => [
      usage.ruleId,
      usage.matchCount,
    ]),
  )
  const unused = insights.data
    ? list.filter((rule) => counts.get(rule.id) === 0).length
    : 0

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

  const newRule = () => setEditing({ rule: null })

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Règles"
        description="Chaque opération importée est classée par la règle la plus précise qui la reconnaît."
        actions={[
          {
            label: 'Nouvelle règle',
            icon: <PlusIcon />,
            primary: true,
            onSelect: newRule,
            disabled: !rules.isSuccess,
          },
        ]}
      />

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

      {rules.isSuccess && list.length === 0 && (
        <EmptyState
          variant="page"
          icon={<WandSparklesIcon />}
          title="Aucune règle pour l’instant"
          description="Une règle classe toute seule les opérations dont le libellé contient un texte. Créez-en une ici, ou depuis une opération dont vous corrigez la catégorie."
          actions={
            <Button iconStart={<PlusIcon />} onClick={newRule}>
              Nouvelle règle
            </Button>
          }
        />
      )}

      {rules.isSuccess && list.length > 0 && (
        <>
          {insights.data && (
            <RuleConflicts
              conflicts={insights.data.conflicts}
              rules={list}
              categories={allCategories}
              pendingRuleId={
                actions.prefer.isPending
                  ? actions.prefer.variables.rule.id
                  : null
              }
              onPrefer={(rule, over) => actions.prefer.mutate({ rule, over })}
            />
          )}

          {unused > 0 && (
            <p role="status" className="text-muted-foreground text-sm">
              {plural(unused, 'règle ne reconnaît', 'règles ne reconnaissent')}{' '}
              aucune opération des 12 derniers mois : modifiez-la ou
              supprimez-la si elle ne sert plus.
            </p>
          )}

          <Card className="min-w-0 gap-0 py-0">
            <ul aria-label="Règles par catégorie" className="divide-y">
              {groupRules(list, allCategories).map((group) => (
                <li key={group.categoryId}>
                  <h2 className="bg-muted/40 flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-medium">
                    {group.category ? (
                      <CategoryIcon
                        icon={group.category.icon}
                        color={group.category.color}
                        size="md"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 break-words">
                      {group.category?.name ?? 'Catégorie inconnue'}
                    </span>
                    {group.category?.archivedAt && (
                      <Badge variant="warning">archivée</Badge>
                    )}
                  </h2>
                  <ul
                    aria-label={`Règles vers ${group.category?.name ?? 'une catégorie inconnue'}`}
                    className="divide-y"
                  >
                    {group.rules.map((rule) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        categories={allCategories}
                        accounts={allAccounts}
                        matchCount={
                          insights.data ? (counts.get(rule.id) ?? 0) : undefined
                        }
                        onEdit={(target) => setEditing({ rule: target })}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>

          <EvaluationOrder
            rules={list}
            categories={allCategories}
            applying={apply.isPending}
            onApply={() => setConfirmApply(true)}
            onEdit={(rule) => setEditing({ rule })}
            reordering={actions.reorder.isPending}
            onReorder={(ids) =>
              actions.reorder.mutate({
                ids,
                previous: list.map((rule) => rule.id),
              })
            }
          />
        </>
      )}

      <RuleEditorSheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        rule={editing?.rule ?? null}
        rules={list}
        categories={allCategories}
        accounts={allAccounts}
        onSaved={(rule, previous) => actions.saved.mutate({ rule, previous })}
        onDelete={setDeleting}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Supprimer la règle ?"
        description="Les opérations qu’elle a classées repassent par les autres règles ; celles qu’aucune ne reconnaît retournent dans À revoir. Vous pourrez annuler juste après."
        confirmLabel="Supprimer"
        variant="danger"
        loading={actions.remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          actions.remove.mutate(deleting, {
            onSettled: () => setDeleting(null),
          })
        }}
      />

      <ConfirmDialog
        open={confirmApply}
        onOpenChange={setConfirmApply}
        title="Réappliquer toutes les règles ?"
        description="Les opérations non classées et celles classées par une règle sont recalculées. Celles que vous avez classées à la main ne changent pas."
        confirmLabel="Réappliquer"
        loading={apply.isPending}
        onConfirm={() => apply.mutate()}
      />
    </div>
  )
}
