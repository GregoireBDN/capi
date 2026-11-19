import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CategorizationRuleDto } from '#/api/types.gen'
import { UNDO_TOAST_MS } from '#/components/transactions/use-transaction-actions'
import { plural } from '#/lib/plural'
import { ruleErrorMessage } from './errors'
import {
  afterTransactionsChanged,
  applyRules,
  createRule,
  deleteRule,
  preferRule,
  reorderRules,
  rulesKey,
  updateRule,
} from './queries'
import { bodyFromRule } from './rule-form'

function changedText(updated: number): string {
  return updated === 0
    ? 'Aucune opération n’a changé.'
    : `${plural(updated, 'opération reclassée', 'opérations reclassées')}.`
}

/**
 * Rule changes as the page makes them (#299): every change is applied to the
 * existing transactions at once (never those filed by hand), then a toast
 * says how many changed and offers « Annuler », which puts the rules back
 * and applies them again.
 */
export function useRuleActions() {
  const queryClient = useQueryClient()

  async function reapply(): Promise<number> {
    const { updated } = await applyRules()
    await afterTransactionsChanged(queryClient)
    return updated
  }

  async function undo(restore: () => Promise<unknown>) {
    try {
      await restore()
      const updated = await reapply()
      toast.success('Modification annulée', {
        description: changedText(updated),
      })
    } catch (error) {
      toast.error(ruleErrorMessage(error))
    }
  }

  async function announce(title: string, restore: () => Promise<unknown>) {
    const updated = await reapply()
    toast.success(title, {
      description: changedText(updated),
      duration: UNDO_TOAST_MS,
      action: { label: 'Annuler', onClick: () => void undo(restore) },
    })
  }

  /** After a save: apply, toast, undo = delete or restore `previous`. */
  const saved = useMutation({
    mutationFn: ({
      rule,
      previous,
    }: {
      rule: CategorizationRuleDto
      previous: CategorizationRuleDto | null
    }) =>
      announce(previous ? 'Règle enregistrée' : 'Règle ajoutée', () =>
        previous
          ? updateRule(rule.id, bodyFromRule(previous))
          : deleteRule(rule.id),
      ),
    onError: (error) => toast.error(ruleErrorMessage(error)),
  })

  /** Deletes a rule (its transactions go through the others); undo re-creates it. */
  const remove = useMutation({
    mutationFn: async (rule: CategorizationRuleDto) => {
      await deleteRule(rule.id)
      await afterTransactionsChanged(queryClient)
      toast.success('Règle supprimée', {
        description:
          'Ses opérations sont reclassées par les autres règles, ou à revoir.',
        duration: UNDO_TOAST_MS,
        action: {
          label: 'Annuler',
          onClick: () => void undo(() => createRule(bodyFromRule(rule))),
        },
      })
    },
    onError: (error) => toast.error(ruleErrorMessage(error)),
  })

  /** « Faire gagner cette règle »: `rule` now wins over `over`. */
  const prefer = useMutation({
    mutationFn: async ({
      rule,
      over,
    }: {
      rule: CategorizationRuleDto
      over: CategorizationRuleDto
    }) => {
      await preferRule(rule.id, over.id)
      await announce(
        `« ${rule.labelPattern} » passe avant « ${over.labelPattern} »`,
        // Either priority may have moved: both are put back.
        async () => {
          await updateRule(rule.id, { priority: rule.priority })
          await updateRule(over.id, { priority: over.priority })
        },
      )
    },
    onError: (error) => toast.error(ruleErrorMessage(error)),
  })

  /** Drag and drop: shown at once, saved, applied; undo = the old order. */
  const reorder = useMutation({
    mutationFn: async ({
      ids,
      previous,
    }: {
      ids: string[]
      previous: string[]
    }) => {
      const ranked = await reorderRules(ids)
      queryClient.setQueryData(rulesKey, ranked)
      await announce('Ordre modifié', () => reorderRules(previous))
    },
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: rulesKey })
      const before = queryClient.getQueryData<CategorizationRuleDto[]>(rulesKey)
      if (before) {
        const byId = new Map(before.map((rule) => [rule.id, rule]))
        queryClient.setQueryData(
          rulesKey,
          ids.flatMap((id, rank) => {
            const rule = byId.get(id)
            return rule ? [{ ...rule, rank }] : []
          }),
        )
      }
      return { before }
    },
    onError: (error, _variables, context) => {
      if (context?.before) queryClient.setQueryData(rulesKey, context.before)
      toast.error(ruleErrorMessage(error))
    },
  })

  return { saved, remove, prefer, reorder }
}
