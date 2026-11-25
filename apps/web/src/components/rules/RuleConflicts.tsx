import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@capi/ui'
import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import type {
  CategorizationRuleConflictDto,
  CategorizationRuleDto,
  CategoryDto,
} from '#/api/types.gen'
import { plural } from '#/lib/plural'
import { quoted, ruleName } from './describe'

/** Conflicts shown before « Voir les autres ». */
const SHOWN = 3

interface RuleConflictsProps {
  conflicts: readonly CategorizationRuleConflictDto[]
  rules: readonly CategorizationRuleDto[]
  categories: readonly CategoryDto[]
  /** Makes `rule` win the transactions it shares with `over`. */
  onPrefer: (rule: CategorizationRuleDto, over: CategorizationRuleDto) => void
  /** Id of the rule being preferred, while it is saved. */
  pendingRuleId: string | null
}

/**
 * Rules that catch the same transactions but file them differently (#299):
 * the first in the order (the most specific) wins them; « Faire gagner … »
 * turns it around in one tap, then the rules are applied (with « Annuler »).
 */
export function RuleConflicts({
  conflicts,
  rules,
  categories,
  onPrefer,
  pendingRuleId,
}: RuleConflictsProps) {
  const [all, setAll] = useState(false)
  const byId = new Map(rules.map((rule) => [rule.id, rule]))
  const known = conflicts.filter(
    (c) => byId.has(c.winnerRuleId) && byId.has(c.loserRuleId),
  )
  if (known.length === 0) return null
  const shown = all ? known : known.slice(0, SHOWN)

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Règles qui se recouvrent</CardTitle>
        <CardDescription>
          La plus précise l’emporte ; changez-le d’un geste si besoin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul aria-label="Règles qui se recouvrent" className="divide-y">
          {shown.map((conflict) => {
            const winner = byId.get(conflict.winnerRuleId)!
            const loser = byId.get(conflict.loserRuleId)!
            return (
              <li
                key={`${conflict.winnerRuleId}:${conflict.loserRuleId}`}
                className="space-y-2 py-3 first:pt-0 last:pb-0"
              >
                <p className="text-sm">
                  {plural(
                    conflict.count,
                    'opération correspond',
                    'opérations correspondent',
                  )}{' '}
                  aussi à la règle{' '}
                  <span className="font-medium">
                    {ruleName(loser, categories)}
                  </span>{' '}
                  :{' '}
                  <span className="font-medium">
                    {ruleName(winner, categories)}
                  </span>{' '}
                  l’emporte.
                </p>
                <Button
                  variant="secondary"
                  outline
                  className="w-full"
                  loading={pendingRuleId === loser.id}
                  disabled={pendingRuleId !== null}
                  onClick={() => onPrefer(loser, winner)}
                >
                  Faire gagner {quoted(loser.labelPattern)}
                </Button>
              </li>
            )
          })}
        </ul>
        {known.length > SHOWN && !all && (
          <Button
            ghost
            variant="secondary"
            className="mt-2 w-full"
            onClick={() => setAll(true)}
          >
            <ChevronDownIcon aria-hidden />
            Voir les {known.length - SHOWN} autres
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
