import { Badge, cn } from '@finances/ui'
import { ChevronRightIcon } from 'lucide-react'
import type {
  AccountDto,
  CategorizationRuleDto,
  CategoryDto,
} from '#/api/types.gen'
import { KIND_LABELS } from '#/components/transactions/labels'
import { plural } from '#/lib/plural'
import { describeConditions, MATCH_TYPE_LABELS } from './describe'

interface RuleRowProps {
  rule: CategorizationRuleDto
  categories: readonly CategoryDto[]
  accounts: readonly AccountDto[]
  /** Transactions of the last 12 months it matches; undefined while loading. */
  matchCount: number | undefined
  onEdit: (rule: CategorizationRuleDto) => void
}

/**
 * One rule as a sentence (#299): « Libellé contient UBER EATS », then how
 * many transactions of the last 12 months it matches (« Aucune opération »
 * stands out) and its rarer conditions. The whole row opens the editor; the
 * category is the group's heading.
 */
export function RuleRow({
  rule,
  categories,
  accounts,
  matchCount,
  onEdit,
}: RuleRowProps) {
  const category = categories.find((c) => c.id === rule.categoryId)
  const conditions = describeConditions(rule, accounts)
  const destination =
    rule.counterpartAccountId === null
      ? null
      : (accounts.find((a) => a.id === rule.counterpartAccountId)?.name ?? null)
  const details = [
    conditions,
    rule.kind && category && rule.kind !== category.kind
      ? `comme ${KIND_LABELS[rule.kind].toLowerCase()}`
      : null,
    destination ? `vers ${destination}` : null,
    rule.merchant ? `renommé « ${rule.merchant} »` : null,
    rule.priority !== 0 ? 'prioritaire' : null,
  ].filter(Boolean)
  const sentence = `${MATCH_TYPE_LABELS[rule.matchType]} « ${rule.labelPattern} »`

  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(rule)}
        aria-label={`${sentence} → ${category?.name ?? 'catégorie inconnue'}`}
        className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1 space-y-0.5">
          <span
            className={cn(
              'block text-sm break-words',
              !rule.enabled && 'text-muted-foreground',
            )}
          >
            <span className="text-muted-foreground">
              {MATCH_TYPE_LABELS[rule.matchType]}{' '}
            </span>
            <span
              className={cn(
                'font-medium',
                rule.matchType === 'regex' && 'font-mono text-xs',
              )}
            >
              {rule.labelPattern}
            </span>
          </span>
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            {matchCount === undefined ? null : matchCount === 0 ? (
              <Badge variant="warning">Aucune opération</Badge>
            ) : (
              <span className="whitespace-nowrap">
                {plural(matchCount, 'opération', 'opérations')}
              </span>
            )}
            {!rule.enabled && (
              <Badge variant="secondary" outline>
                Désactivée
              </Badge>
            )}
            {details.length > 0 && (
              <span className="break-words">{details.join(' · ')}</span>
            )}
          </span>
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className="text-muted-foreground size-[0.8rem] shrink-0"
        />
      </button>
    </li>
  )
}
