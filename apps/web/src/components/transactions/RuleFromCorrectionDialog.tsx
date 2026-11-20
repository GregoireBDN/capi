import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Spinner,
} from '@finances/ui'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  categorizationRulesControllerApply,
  categorizationRulesControllerCreate,
  categorizationRulesControllerPreview,
  categorizationRulesControllerSuggest,
} from '#/api'
import type {
  CategorizationRulePreviewDto,
  CategoryDto,
  CreateCategorizationRuleDto,
  TransactionDto,
} from '#/api/types.gen'
import { plural } from '#/lib/plural'
import { CategoryBadge } from './CategoryBadge'

/** Delay between the last keystroke and the preview request. */
export const RULE_PREVIEW_DEBOUNCE_MS = 300

export interface RuleCreatedResult {
  /** Transactions the rules re-categorized once the new rule was applied. */
  updated: number
}

interface RuleFromCorrectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The transaction the user just corrected. */
  transaction: Pick<
    TransactionDto,
    'rawLabel' | 'merchant' | 'amountCents' | 'accountId'
  >
  /** The category it was filed under. */
  category: Pick<CategoryDto, 'id' | 'name' | 'color'>
  onCreated: (result: RuleCreatedResult) => void
}

function previewText({ matched, leavingReview }: CategorizationRulePreviewDto) {
  if (matched === 0) {
    return 'Aucune autre opération ne correspond pour l’instant.'
  }
  const queued = `${plural(leavingReview, 'opération à revoir sera recatégorisée', 'opérations à revoir seront recatégorisées')}`
  return matched > leavingReview
    ? `${queued} (${plural(matched, 'opération', 'opérations')} au total).`
    : `${queued}.`
}

/**
 * Offered after a category correction: proposes a `contains` rule from the
 * transaction (`suggest`), lets the user edit the pattern while previewing how
 * many transactions it would re-categorize (`preview`), then creates the rule
 * and applies the rules so similar transactions leave the review queue.
 *
 * Shared by the review queue and the transactions page.
 */
export function RuleFromCorrectionDialog({
  open,
  onOpenChange,
  transaction,
  category,
  onCreated,
}: RuleFromCorrectionDialogProps) {
  const patternId = useId()
  const [suggestion, setSuggestion] =
    useState<CreateCategorizationRuleDto | null>(null)
  const [pattern, setPattern] = useState('')
  const [preview, setPreview] = useState<CategorizationRulePreviewDto | null>(
    null,
  )
  const [previewing, setPreviewing] = useState(false)
  const [patternError, setPatternError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const previewRequest = useRef(0)

  // Fresh suggestion each time the dialog opens.
  useEffect(() => {
    if (!open) return
    // An expense paid by a contact (#359) has no bank label to learn from.
    const accountId = transaction.accountId
    if (accountId === null) return
    let cancelled = false
    setSuggestion(null)
    setPattern('')
    setPreview(null)
    setPatternError(null)
    void categorizationRulesControllerSuggest({
      body: {
        rawLabel: transaction.rawLabel,
        merchant: transaction.merchant,
        amountCents: transaction.amountCents,
        accountId,
        categoryId: category.id,
      },
      throwOnError: false,
    }).then(({ data }) => {
      if (cancelled) return
      const fallback = {
        matchType: 'contains' as const,
        labelPattern: transaction.merchant ?? transaction.rawLabel,
        categoryId: category.id,
      }
      const next = data ?? fallback
      setSuggestion({
        matchType: next.matchType,
        labelPattern: next.labelPattern,
        categoryId: next.categoryId,
      })
      setPattern(next.labelPattern)
    })
    return () => {
      cancelled = true
    }
  }, [open, transaction, category.id])

  const trimmed = pattern.trim()

  // Debounced preview of the edited rule; stale answers are dropped.
  useEffect(() => {
    if (!open || !suggestion) return
    const request = ++previewRequest.current
    if (trimmed === '') {
      setPreview(null)
      setPreviewing(false)
      setPatternError('Saisissez un motif.')
      return
    }
    setPreviewing(true)
    const timer = setTimeout(() => {
      void categorizationRulesControllerPreview({
        body: { ...suggestion, labelPattern: trimmed },
        throwOnError: false,
      }).then(({ data }) => {
        if (request !== previewRequest.current) return
        setPreviewing(false)
        setPreview(data ?? null)
        setPatternError(data ? null : 'Ce motif n’est pas valide.')
      })
    }, RULE_PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [open, suggestion, trimmed])

  async function createRule() {
    if (!suggestion || trimmed === '') return
    setSaving(true)
    try {
      const created = await categorizationRulesControllerCreate({
        body: { ...suggestion, labelPattern: trimmed },
        throwOnError: false,
      })
      if (!created.data) {
        setPatternError('Impossible de créer la règle avec ce motif.')
        return
      }
      const applied = await categorizationRulesControllerApply({
        throwOnError: false,
      })
      if (!applied.data) {
        toast.error(
          'Règle créée, mais elle n’a pas pu être appliquée. Réessayez plus tard.',
        )
        onOpenChange(false)
        return
      }
      onCreated({ updated: applied.data.updated })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer une règle</DialogTitle>
          <DialogDescription>
            Les opérations similaires seront classées automatiquement,
            maintenant et lors des prochains imports.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void createRule()
          }}
        >
          <Field data-invalid={patternError ? true : undefined}>
            <FieldLabel htmlFor={patternId}>
              Le libellé ou le marchand contient
            </FieldLabel>
            <Input
              id={patternId}
              value={pattern}
              disabled={!suggestion}
              aria-invalid={patternError ? true : undefined}
              onChange={(event) => setPattern(event.target.value)}
              autoComplete="off"
            />
            <FieldDescription>
              Majuscules, accents et ponctuation sont ignorés.
            </FieldDescription>
            {patternError && <FieldError>{patternError}</FieldError>}
          </Field>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Catégorie :</span>
            <CategoryBadge category={category} />
          </div>

          <p
            className="bg-muted/50 min-h-10 rounded-lg p-3 text-sm"
            aria-live="polite"
            data-testid="rule-preview"
          >
            {!suggestion || previewing ? (
              <span className="text-muted-foreground inline-flex items-center gap-2">
                <Spinner /> Calcul des opérations concernées…
              </span>
            ) : preview ? (
              previewText(preview)
            ) : null}
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              outline
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              loading={saving}
              disabled={!suggestion || trimmed === '' || patternError !== null}
            >
              Créer la règle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
