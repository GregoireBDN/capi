import type { CategorizationRulePreviewDto, CategoryDto } from '#/api/types.gen'
import { Amount } from '#/components/transactions/Amount'
import { CategoryBadge } from '#/components/transactions/CategoryBadge'
import { displayLabel } from '#/components/transactions/labels'
import { formatCalendarDate } from '#/lib/money'
import { plural } from '#/lib/plural'

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
    return ['Aucune opération ne correspond à cette règle.']
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
      `${plural(released, 'opération quitterait', 'opérations quitteraient')} cette règle (autre règle ou À revoir).`,
    )
  }
  lines.push(
    changed > 0
      ? `${plural(changed, 'opération changerait', 'opérations changeraient')} :`
      : 'Aucune ne changerait de catégorie.',
  )
  return lines
}

/**
 * What saving the rule and applying the rules would change: counts, then the
 * most recent transactions that would change, from → to.
 */
export function RulePreview({
  preview,
  categories,
}: {
  preview: CategorizationRulePreviewDto
  categories: readonly CategoryDto[]
}) {
  const hidden = preview.changed - preview.transactions.length
  return (
    <section
      aria-label="Résultat du test"
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
        Rien ne change avant d’enregistrer puis d’appliquer les règles.
      </p>
    </section>
  )
}
