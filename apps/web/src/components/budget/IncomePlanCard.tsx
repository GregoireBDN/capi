import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CategoryIcon,
  cn,
  EmptyState,
} from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { HandCoinsIcon, PencilIcon, PlusIcon, SparklesIcon } from 'lucide-react'
import type {
  BudgetIncomeDto,
  BudgetIncomeLineDto,
  BudgetPlanDto,
} from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'

interface IncomePlanCardProps {
  month: string
  income: BudgetIncomeDto
  plan: BudgetPlanDto
  onEdit: (line: BudgetIncomeLineDto) => void
  onAdd?: () => void
  onPrepare: () => void
}

const shortDay = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** `2026-11-27` → « 27 nov. », read in UTC so no time zone shifts it. */
function formatShortDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return shortDay.format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * Where a line stands, in words, and whether it calls for attention: what
 * came in against the plan for a month that is over, against what was due
 * by the data's last day for a partial one, nothing for an empty one.
 */
export function incomeLineState(line: BudgetIncomeLineDto): {
  text: string
  tone: 'good' | 'warning' | 'muted'
} {
  const received = line.receivedCents ?? 0
  switch (line.status) {
    case 'received':
      return { text: `Reçu ${formatCents(received)}`, tone: 'good' }
    case 'short':
      return {
        text: `Reçu ${formatCents(received)} · manque ${formatCents(
          (line.expectedByNowCents ?? line.plannedCents) - received,
        )}`,
        tone: 'warning',
      }
    case 'missing':
      return { text: 'Pas reçu', tone: 'warning' }
    case 'so_far':
      return {
        text: `Reçu à ce jour ${formatCents(received)}`,
        tone: 'muted',
      }
    case 'pending':
      if (line.expectedOn) {
        return {
          text:
            received > 0
              ? `Reçu ${formatCents(received)} · attendu le ${formatShortDay(line.expectedOn)}`
              : `Attendu le ${formatShortDay(line.expectedOn)}`,
          tone: 'muted',
        }
      }
      return {
        text:
          line.receivedCents === null
            ? 'Rien d’importé pour ce mois'
            : `Reçu à ce jour ${formatCents(received)}`,
        tone: 'muted',
      }
  }
}

const TONES = {
  good: 'text-chart-delta-good',
  warning: 'text-warning-foreground dark:text-warning',
  muted: 'text-muted-foreground',
} as const

/**
 * « Revenus prévus » (#315): each planned income line with what came in,
 * the totals and the balance of the plan, « À épargner » = planned income −
 * budgeted expenses. Tapping a line opens its income of the month; the
 * pencil edits the planned amount.
 */
export function IncomePlanCard({
  month,
  income,
  plan,
  onEdit,
  onAdd,
  onPrepare,
}: IncomePlanCardProps) {
  const { items, totals } = income
  return (
    <Card size="sm" role="region" aria-label="Revenus prévus">
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2">
          <span>Revenus prévus</span>
          {items.length > 0 && (
            <span className="tabular-nums">
              {formatCents(totals.plannedCents)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={<HandCoinsIcon />}
            title="Aucun revenu prévu"
            description="Prévoyez votre salaire, vos aides et les autres rentrées du mois pour savoir ce que le budget laisse à épargner."
            actions={
              <>
                <Button iconStart={<SparklesIcon />} onClick={onPrepare}>
                  Préparer les revenus
                </Button>
                {onAdd && (
                  <Button
                    outline
                    variant="secondary"
                    iconStart={<PlusIcon />}
                    onClick={onAdd}
                  >
                    Ajouter un revenu
                  </Button>
                )}
              </>
            }
          />
        ) : (
          <>
            <ul className="divide-y" aria-label="Revenus prévus par catégorie">
              {items.map((line) => {
                const state = incomeLineState(line)
                return (
                  <li
                    key={line.categoryId}
                    data-status={line.status}
                    className="flex items-center gap-1 py-1"
                  >
                    <Link
                      to={ROUTES.transactions}
                      search={{
                        month,
                        category: line.categoryId,
                        kind: 'income',
                      }}
                      aria-label={`Revenus ${line.name}`}
                      className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1.5 pr-1 outline-none focus-visible:ring-[3px]"
                    >
                      <CategoryIcon icon={line.icon} color={line.color} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-x-2">
                          <span className="min-w-0 flex-1 text-sm font-medium break-normal">
                            {line.name}
                          </span>
                          <span className="shrink-0 text-sm font-medium whitespace-nowrap tabular-nums">
                            {formatCents(line.plannedCents)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'block text-xs break-normal',
                            TONES[state.tone],
                          )}
                        >
                          {state.text}
                        </span>
                        {line.note && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {line.note}
                          </span>
                        )}
                      </span>
                    </Link>
                    <Button
                      variant="secondary"
                      ghost
                      iconOnly
                      aria-label={`Modifier le revenu prévu ${line.name}`}
                      onClick={() => onEdit(line)}
                    >
                      <PencilIcon />
                    </Button>
                  </li>
                )
              })}
            </ul>

            {totals.receivedCents !== null && (
              <p className="text-muted-foreground text-sm">
                Reçu{' '}
                <span className="text-foreground font-medium tabular-nums">
                  {formatCents(totals.receivedCents)}
                </span>{' '}
                sur {formatCents(totals.plannedCents)} prévus
                {(totals.unplannedCents ?? 0) > 0 &&
                  ` · hors plan ${formatCents(totals.unplannedCents!)}`}
              </p>
            )}

            <PlanBalance plan={plan} />

            <div className="flex flex-wrap gap-2 *:grow @[672px]:*:grow-0">
              {onAdd && (
                <Button
                  outline
                  variant="secondary"
                  iconStart={<PlusIcon />}
                  onClick={onAdd}
                >
                  Ajouter un revenu
                </Button>
              )}
              <Button
                outline
                variant="secondary"
                iconStart={<SparklesIcon />}
                onClick={onPrepare}
              >
                Préparer les revenus
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The balance of the plan: planned income − budgeted expenses = what it
 * leaves to save. Rows on a phone, one line of three from `@lg`.
 */
function PlanBalance({ plan }: { plan: BudgetPlanDto }) {
  if (plan.toSaveCents === null) return null
  const short = plan.toSaveCents < 0
  return (
    <dl
      aria-label="Équilibre du budget"
      className="bg-muted/50 grid gap-1 rounded-lg p-3 text-sm @lg:grid-cols-3 @lg:gap-3"
    >
      <PlanFigure
        label="Revenus prévus"
        value={formatCents(plan.plannedIncomeCents)}
      />
      <PlanFigure
        label="Dépenses prévues"
        value={formatCents(plan.budgetedExpensesCents)}
      />
      <PlanFigure
        label={short ? 'Le plan dépense plus' : 'À épargner'}
        value={formatCents(Math.abs(plan.toSaveCents))}
        strong
        bad={short}
      />
    </dl>
  )
}

function PlanFigure({
  label,
  value,
  strong = false,
  bad = false,
}: {
  label: string
  value: string
  strong?: boolean
  bad?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 @lg:block">
      <dt className="text-muted-foreground @lg:text-xs">{label}</dt>
      <dd
        className={cn(
          'whitespace-nowrap tabular-nums',
          strong && 'font-semibold',
          bad && 'text-chart-delta-bad',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
