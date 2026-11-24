import {
  Alert,
  AlertDescription,
  CategoryIcon,
  Checkbox,
  Sheet,
  SheetContent,
  Skeleton,
  useIsMobile,
} from '@capi/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import type { BudgetSuggestionDto } from '#/api/types.gen'
import { formatMonth } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { centsToInput, parseEurosToCents, targetError } from './amount'
import { budgetErrorMessage } from './errors'
import {
  afterBudgetsChanged,
  fetchSuggestions,
  saveBudget,
  SUGGEST_MONTHS,
} from './queries'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_SCREEN,
  SheetScroll,
} from '#/components/sheets/form-sheet'

interface SuggestionsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Month the accepted targets apply from. */
  month: string
}

interface Draft {
  accepted: boolean
  amount: string
}

/** Unchanged suggestions are pre-ticked only where there is no target yet. */
function initialDrafts(items: readonly BudgetSuggestionDto[]) {
  return Object.fromEntries(
    items.map((item) => [
      item.categoryId,
      {
        accepted: item.currentTargetCents === null,
        amount: centsToInput(item.suggestedCents),
      },
    ]),
  ) as Record<string, Draft | undefined>
}

const UNTICKED: Draft = { accepted: false, amount: '' }

/**
 * "Proposer des budgets": targets from the average spending of the last
 * full months (one-offs excluded), to review, adjust and accept one by one.
 * Only the ticked categories are saved.
 */
export function SuggestionsSheet({
  open,
  onOpenChange,
  month,
}: SuggestionsSheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const suggestions = useQuery({
    queryKey: ['budgets', 'suggestions', month, SUGGEST_MONTHS],
    queryFn: () => fetchSuggestions(month),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  })
  const [drafts, setDrafts] = useState<Record<string, Draft | undefined>>({})

  useEffect(() => {
    if (suggestions.data) setDrafts(initialDrafts(suggestions.data.items))
  }, [suggestions.data])

  const items = suggestions.data?.items ?? []
  const draftOf = (categoryId: string) => drafts[categoryId] ?? UNTICKED
  const accepted = items.filter((item) => draftOf(item.categoryId).accepted)
  const invalid = accepted.some(
    (item) => targetError(draftOf(item.categoryId).amount) !== null,
  )

  const apply = useMutation({
    mutationFn: async () => {
      // One at a time: a handful of requests, well under the rate limit.
      for (const item of accepted) {
        await saveBudget(
          item.categoryId,
          month,
          parseEurosToCents(draftOf(item.categoryId).amount)!,
        )
      }
      return accepted.length
    },
    onSuccess: async (count) => {
      toast.success(
        `${plural(count, 'budget enregistré', 'budgets enregistrés')}`,
      )
      onOpenChange(false)
      await afterBudgetsChanged(queryClient)
    },
    onError: async (error) => {
      toast.error(budgetErrorMessage(error))
      await afterBudgetsChanged(queryClient)
    },
  })

  function update(categoryId: string, change: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [categoryId]: { ...(current[categoryId] ?? UNTICKED), ...change },
    }))
  }

  const range = suggestions.data
  const period =
    range && range.months.length > 0
      ? `${formatMonth(range.months[0]).toLowerCase()} – ${formatMonth(range.months.at(-1)!).toLowerCase()}`
      : ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : 'overflow-y-auto sm:max-w-md'}
      >
        <EditorHeader
          className="pb-0"
          title="Proposer des budgets"
          description={
            <>
              Moyenne mensuelle de vos dépenses
              {period && ` (${period})`}, hors dépenses exceptionnelles,
              arrondie à l’euro. Cochez celles à garder, à partir de{' '}
              {formatMonth(month).toLowerCase()}.
            </>
          }
          action={
            items.length > 0
              ? {
                  label:
                    accepted.length === 0
                      ? 'Aucun budget sélectionné'
                      : `Enregistrer ${plural(accepted.length, 'budget')}`,
                  loading: apply.isPending,
                  disabled: accepted.length === 0 || invalid,
                  onClick: () => apply.mutate(),
                }
              : undefined
          }
        />

        <SheetScroll className="px-4">
          {suggestions.isPending && (
            <div className="space-y-2" aria-busy="true" aria-label="Chargement">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          )}
          {suggestions.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {budgetErrorMessage(suggestions.error)}
              </AlertDescription>
            </Alert>
          )}
          {suggestions.isSuccess && items.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Pas assez de dépenses sur les {SUGGEST_MONTHS} derniers mois pour
              proposer des budgets. Importez vos relevés d’abord.
            </p>
          )}
          {items.length > 0 && (
            <ul className="divide-y" aria-label="Propositions">
              {items.map((item) => {
                const draft = draftOf(item.categoryId)
                const error = draft.accepted ? targetError(draft.amount) : null
                const checkboxId = `suggestion-${item.categoryId}`
                return (
                  <li key={item.categoryId} className="space-y-1.5 py-3">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={checkboxId}
                        checked={draft.accepted}
                        onCheckedChange={(checked) =>
                          update(item.categoryId, {
                            accepted: checked === true,
                          })
                        }
                      />
                      <label
                        htmlFor={checkboxId}
                        className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium"
                      >
                        <CategoryIcon
                          icon={item.icon}
                          color={item.color}
                          size="sm"
                        />
                        <span className="truncate">{item.name}</span>
                      </label>
                      <AmountField
                        groupClassName="w-28 shrink-0"
                        aria-label={`Objectif ${item.name}`}
                        aria-invalid={error !== null}
                        value={draft.amount}
                        onValueChange={(typed) =>
                          update(item.categoryId, {
                            amount: typed,
                            accepted: true,
                          })
                        }
                      />
                    </div>
                    <p className="text-muted-foreground pl-8 text-xs">
                      Moyenne {formatCents(item.averageCents)}
                      {item.currentTargetCents !== null &&
                        ` · objectif actuel ${formatCents(item.currentTargetCents)}`}
                    </p>
                    {error && (
                      <p className="text-destructive pl-8 text-xs">{error}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </SheetScroll>
      </SheetContent>
    </Sheet>
  )
}
