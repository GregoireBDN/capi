import {
  Alert,
  AlertDescription,
  Button,
  CategoryIcon,
  Checkbox,
  Sheet,
  SheetContent,
  SheetFooter,
  Skeleton,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import type { IncomeSuggestionDto } from '#/api/types.gen'
import { formatMonth } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { centsToInput, parseEurosToCents, targetError } from './amount'
import { budgetErrorMessage } from './errors'
import {
  afterBudgetsChanged,
  fetchIncomeSuggestions,
  saveBudget,
} from './queries'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_SCREEN,
  SheetScroll,
} from '#/components/sheets/form-sheet'

interface IncomeSuggestionsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Month the accepted lines apply from. */
  month: string
}

interface Draft {
  accepted: boolean
  amount: string
}

const UNTICKED: Draft = { accepted: false, amount: '' }

/** Lines not planned yet are pre-ticked; a carried-over plan is kept as is. */
function initialDrafts(items: readonly IncomeSuggestionDto[]) {
  return Object.fromEntries(
    items.map((item) => [
      item.categoryId,
      {
        accepted: item.currentPlannedCents === null,
        amount: centsToInput(item.suggestedCents),
      },
    ]),
  ) as Record<string, Draft | undefined>
}

/** Where the suggested amount comes from, in words. */
function sourceText(item: IncomeSuggestionDto): string {
  if (item.currentPlannedCents !== null) {
    return `Déjà prévu : ${formatCents(item.currentPlannedCents)} (reporté)`
  }
  return `D’après ${item.sources.join(', ')}`
}

/**
 * « Préparer les revenus » (#315): next month's planned income, from the
 * plan carried over from the month before or, for the income categories
 * without one, the confirmed recurring credits (salary, benefits) at their
 * typical amount. Only the ticked lines are saved, from the month shown on.
 */
export function IncomeSuggestionsSheet({
  open,
  onOpenChange,
  month,
}: IncomeSuggestionsSheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const suggestions = useQuery({
    queryKey: ['budgets', 'income-suggestions', month],
    queryFn: () => fetchIncomeSuggestions(month),
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
        plural(count, 'revenu prévu enregistré', 'revenus prévus enregistrés'),
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : 'overflow-y-auto sm:max-w-md'}
      >
        <EditorHeader
          className="pb-0"
          title="Préparer les revenus"
          description={<>Le plan du mois précédent, ou vos revenus réguliers confirmés
            (salaire, aides) à leur montant habituel. Cochez ceux à garder, à
            partir de {formatMonth(month).toLowerCase()}.</>}
          action={
            items.length > 0
              ? {
                  label:
                    accepted.length === 0
                      ? 'Aucun revenu sélectionné'
                      : `Enregistrer ${plural(accepted.length, 'revenu')}`,
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
              {[0, 1].map((i) => (
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
              Aucun revenu régulier confirmé à proposer. Confirmez votre salaire
              dans « Abonnements », ou ajoutez un revenu à la main.
            </p>
          )}
          {items.length > 0 && (
            <ul className="divide-y" aria-label="Revenus proposés">
              {items.map((item) => {
                const draft = draftOf(item.categoryId)
                const error = draft.accepted ? targetError(draft.amount) : null
                const checkboxId = `income-suggestion-${item.categoryId}`
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
                        aria-label={`Prévu ${item.name}`}
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
                      {sourceText(item)}
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

        {!isMobile && items.length > 0 && (
          <SheetFooter>
            <Button
              loading={apply.isPending}
              disabled={accepted.length === 0 || invalid}
              onClick={() => apply.mutate()}
            >
              {accepted.length === 0
                ? 'Aucun revenu sélectionné'
                : `Enregistrer ${plural(accepted.length, 'revenu')}`}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
