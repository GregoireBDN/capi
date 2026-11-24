import { Button, CategoryIcon, Skeleton } from '@capi/ui'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type {
  CategorizationRuleMatchesQueryDto,
  CategoryDto,
} from '#/api/types.gen'
import { Amount } from '#/components/transactions/Amount'
import { formatCalendarDate } from '#/lib/money'
import { plural } from '#/lib/plural'
import { ruleErrorMessage } from './errors'
import { ruleMatchesQuery } from './queries'

/** Matches listed before « Voir plus », so « Avancé » below stays near. */
const SHOWN = 5

/** Wait after the last keystroke before asking the API. */
const DEBOUNCE_MS = 300

/** `value` once it has stopped changing for `delay` ms (compared as JSON). */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  const key = JSON.stringify(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
    // `key` stands for `value`: a new object with the same content waits on.
  }, [key, delay])
  return debounced
}

/**
 * The transactions of the last 12 months the conditions being typed catch,
 * live (#299): the count, then the most recent with their category today.
 */
export function RuleMatches({
  conditions,
  categories,
}: {
  /** null while the pattern is empty or an amount is not valid. */
  conditions: CategorizationRuleMatchesQueryDto | null
  categories: readonly CategoryDto[]
}) {
  const debounced = useDebounced(conditions, DEBOUNCE_MS)
  const [all, setAll] = useState(false)
  // A new search starts folded again.
  const searchKey = JSON.stringify(debounced)
  useEffect(() => setAll(false), [searchKey])
  const matches = useQuery({
    ...ruleMatchesQuery(debounced ?? { labelPattern: '' }),
    enabled: debounced !== null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  if (conditions === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Tapez un mot du libellé, par exemple le nom du commerçant : les
        opérations reconnues s’affichent ici.
      </p>
    )
  }
  if (matches.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {ruleErrorMessage(matches.error)}
      </p>
    )
  }
  if (!matches.data) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    )
  }
  const { total, transactions: loaded } = matches.data
  const transactions = all ? loaded : loaded.slice(0, SHOWN)
  const more = loaded.length - transactions.length
  const hidden = total - loaded.length
  return (
    <section aria-label="Opérations reconnues" className="space-y-2">
      <p aria-live="polite" className="text-sm font-medium">
        {total === 0
          ? 'Aucune opération sur 12 mois'
          : `${plural(total, 'opération', 'opérations')} sur 12 mois`}
      </p>
      {total === 0 && (
        <p className="text-muted-foreground text-sm">
          Vérifiez l’orthographe, ou raccourcissez le texte : majuscules,
          accents et ponctuation sont ignorés.
        </p>
      )}
      {transactions.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {transactions.map((transaction) => {
            const category = categories.find(
              (c) => c.id === transaction.categoryId,
            )
            return (
              <li key={transaction.id} className="space-y-1 px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="min-w-[7rem] flex-1 text-sm break-words">
                    {transaction.rawLabel}
                  </span>
                  <Amount cents={transaction.amountCents} className="ml-auto" />
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                  <span className="whitespace-nowrap">
                    {formatCalendarDate(transaction.bookingDate)}
                  </span>
                  <span aria-hidden="true">·</span>
                  {category ? (
                    <span className="inline-flex items-center gap-1">
                      <CategoryIcon
                        icon={category.icon}
                        color={category.color}
                        size="sm"
                      />
                      {category.name}
                    </span>
                  ) : (
                    <span>À revoir</span>
                  )}
                  {transaction.manual && (
                    <span>· classée à la main, ne changera pas</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {more > 0 && (
        <Button
          type="button"
          variant="secondary"
          ghost
          className="w-full"
          onClick={() => setAll(true)}
        >
          Voir {plural(more, 'autre opération', 'autres opérations')}
        </Button>
      )}
      {all && hidden > 0 && (
        <p className="text-muted-foreground text-xs">
          … et {plural(hidden, 'autre', 'autres')} plus anciennes.
        </p>
      )}
    </section>
  )
}
