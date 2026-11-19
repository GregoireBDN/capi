import { Button } from '@finances/ui'
import type {
  CategorizationRuleDto,
  CategorizationRulePreviewDto,
  CategoryDto,
} from '#/api/types.gen'
import { Amount } from '#/components/transactions/Amount'
import { CategoryBadge } from '#/components/transactions/CategoryBadge'
import { displayLabel } from '#/components/transactions/labels'
import { formatCalendarDate } from '#/lib/money'
import { plural } from '#/lib/plural'
import { ruleName } from './describe'

/** Id the API gives a new rule in a preview. */
export const PREVIEW_RULE_ID = '00000000-0000-0000-0000-000000000000'

function Target({
  categoryId,
  categories,
  none,
}: {
  categoryId: string | null
  categories: readonly CategoryDto[]
  /** Shown when there is no category. */
  none: string
}) {
  if (categoryId === null) {
    return <span className="text-foreground">{none}</span>
  }
  const category = categories.find((c) => c.id === categoryId)
  return category ? (
    <CategoryBadge category={category} />
  ) : (
    <span className="text-muted-foreground">Catégorie inconnue</span>
  )
}

/** Counts in one sentence each, only those that are not zero. */
export function previewSummary({
  matched,
  leavingReview,
  released,
  changed,
}: CategorizationRulePreviewDto): string[] {
  if (matched === 0 && released === 0) {
    return [
      'Aucune opération à classer pour l’instant : la règle servira aux prochains imports.',
    ]
  }
  const lines: string[] = []
  if (matched > 0) {
    const caught = plural(matched, 'opération classée', 'opérations classées')
    lines.push(
      leavingReview > 0
        ? `${caught} par cette règle, dont ${leavingReview} à revoir.`
        : `${caught} par cette règle.`,
    )
  }
  if (released > 0) {
    lines.push(
      `${plural(released, 'opération quitte', 'opérations quittent')} cette règle (autre règle ou À revoir).`,
    )
  }
  lines.push(
    changed > 0
      ? `${plural(changed, 'opération changera', 'opérations changeront')} :`
      : 'Aucune ne change de catégorie.',
  )
  return lines
}

/**
 * What saving the rule and applying the rules will change: counts, the most
 * recent transactions that change (from → to), then the rules it overlaps
 * with. Where another rule wins, « Faire gagner cette règle » raises this
 * one's priority (`onPreferOver`, saved with the rule).
 */
export function RulePreview({
  preview,
  categories,
  rules,
  selfId,
  onPreferOver,
}: {
  preview: CategorizationRulePreviewDto
  categories: readonly CategoryDto[]
  /** The saved rules, to name the ones in conflict. */
  rules: readonly CategorizationRuleDto[]
  /** The previewed rule's id in `preview.conflicts`. */
  selfId: string
  onPreferOver: (winner: CategorizationRuleDto) => void
}) {
  const hidden = preview.changed - preview.transactions.length
  const byId = new Map(rules.map((rule) => [rule.id, rule]))
  const beaten = preview.conflicts.filter(
    (c) => c.winnerRuleId === selfId && byId.has(c.loserRuleId),
  )
  const beating = preview.conflicts.filter(
    (c) => c.loserRuleId === selfId && byId.has(c.winnerRuleId),
  )
  return (
    <div className="space-y-3">
      <section
        aria-label="Ce qui change"
        className="bg-muted/50 space-y-2 rounded-lg p-3 text-sm"
      >
        {previewSummary(preview).map((line) => (
          <p key={line}>{line}</p>
        ))}
        {preview.transactions.length > 0 && (
          <ul
            className="divide-border divide-y"
            aria-label="Opérations modifiées"
          >
            {preview.transactions.map((transaction) => (
              <li key={transaction.id} className="space-y-1 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="min-w-[7rem] flex-1 break-words">
                    {displayLabel(transaction)}
                  </span>
                  <Amount cents={transaction.amountCents} className="ml-auto" />
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="whitespace-nowrap">
                    {formatCalendarDate(transaction.bookingDate)}
                  </span>
                  <Target
                    categoryId={transaction.categoryId}
                    categories={categories}
                    none="Non classée"
                  />
                  <span aria-label="devient">→</span>
                  <Target
                    categoryId={transaction.nextCategoryId}
                    categories={categories}
                    none="À revoir"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {hidden > 0 && (
          <p className="text-muted-foreground">
            … et {plural(hidden, 'autre', 'autres')}.
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Appliqué à l’enregistrement, sauf aux opérations classées à la main.
        </p>
      </section>

      {(beating.length > 0 || beaten.length > 0) && (
        <section aria-label="Règles qui se recouvrent" className="space-y-2">
          {beating.map((conflict) => {
            const winner = byId.get(conflict.winnerRuleId)!
            return (
              <div
                key={conflict.winnerRuleId}
                className="space-y-2 rounded-lg border p-3 text-sm"
              >
                <p>
                  {plural(
                    conflict.count,
                    'opération correspond',
                    'opérations correspondent',
                  )}{' '}
                  aussi à la règle{' '}
                  <span className="font-medium">
                    {ruleName(winner, categories)}
                  </span>
                  , qui l’emporte.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  outline
                  className="w-full"
                  onClick={() => onPreferOver(winner)}
                >
                  Faire gagner cette règle
                </Button>
              </div>
            )
          })}
          {beaten.map((conflict) => (
            <p
              key={conflict.loserRuleId}
              className="text-muted-foreground text-sm"
            >
              {plural(
                conflict.count,
                'opération correspond',
                'opérations correspondent',
              )}{' '}
              aussi à la règle{' '}
              {ruleName(byId.get(conflict.loserRuleId), categories)} : celle-ci
              l’emporte.
            </p>
          ))}
        </section>
      )}
    </div>
  )
}
