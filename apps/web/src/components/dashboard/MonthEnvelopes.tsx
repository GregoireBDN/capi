import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import {
  Button,
  Card,
  CategoryIcon,
  cn,
  Skeleton,
  EmptyState,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PlusIcon, ReceiptEuroIcon, WalletCardsIcon } from 'lucide-react'
import { useState } from 'react'
import type { EnvelopeDto, EnvelopesDto } from '#/api/types.gen'
import { formatBudgetAmount } from '#/components/budget/amount'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { envelopesQuery } from '#/components/expenses/queries'
import { formatWholeEuros } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { SeeLink } from './DashboardCardHeader'

/** Same warning level as the budget page (80 % of the target). */
const WARNING_THRESHOLD = 0.8

/**
 * « Enveloppes » (#262, #321, compact since #405): the current month's
 * envelopes (budget lines flagged « suivre pendant le mois »), one line
 * each: its category, what's left, a bar with the mark where an even pace
 * would be today and a « + »; a tap on the line notes an expense in it
 * (owner's « Appuyer = ajouter »). « Ajouter une dépense » is an item of
 * the page's « ⋮ » (#386). The detail and past months are on Budget.
 */
export function MonthEnvelopes() {
  const envelopes = useQuery(envelopesQuery())
  const [sheet, setSheet] = useState<{ open: boolean; categoryId?: string }>({
    open: false,
  })
  const data = envelopes.data
  const inMenu = useRegisterPageAction({
    label: 'Ajouter une dépense',
    icon: <ReceiptEuroIcon />,
    primary: true,
    onSelect: () => setSheet({ open: true }),
  })

  return (
    <section aria-labelledby="month-envelopes-title" className="min-w-0">
      <Card className="min-w-0 gap-1 px-2 pt-3 pb-2">
        <div className="flex items-baseline justify-between gap-3 px-2">
          <h2 id="month-envelopes-title" className="text-sm font-semibold">
            Enveloppes
          </h2>
          <SeeLink label="Budget" to={ROUTES.budget} />
        </div>
        {data ? (
          <EnvelopeList
            data={data}
            onAdd={(categoryId) => setSheet({ open: true, categoryId })}
          />
        ) : envelopes.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-2">
            <p className="text-muted-foreground text-sm">
              Enveloppes indisponibles.
            </p>
            <Button
              outline
              variant="secondary"
              size="sm"
              onClick={() => void envelopes.refetch()}
            >
              Réessayer
            </Button>
          </div>
        ) : (
          <div
            aria-busy="true"
            aria-label="Chargement des enveloppes"
            className="px-2"
          >
            <Skeleton className="h-11 w-full" />
          </div>
        )}
        {!inMenu && (
          <div className="px-2 pt-1">
            <Button className="w-full" onClick={() => setSheet({ open: true })}>
              <PlusIcon aria-hidden />
              Ajouter une dépense
            </Button>
          </div>
        )}
      </Card>
      <ManualTransactionSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((state) => ({ ...state, open }))}
        initialCategoryId={sheet.categoryId}
        suggestedCategoryIds={data?.items.map((item) => item.categoryId)}
      />
    </section>
  )
}

function EnvelopeList({
  data,
  onAdd,
}: {
  data: EnvelopesDto
  onAdd: (categoryId: string) => void
}) {
  if (data.items.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={<WalletCardsIcon />}
        title="Aucune enveloppe suivie"
        description="Sur la page Budget, activez « Suivre pendant le mois » pour les catégories à surveiller, comme les sorties."
        actions={
          <Button asChild size="sm" outline variant="secondary">
            <Link to={ROUTES.budget}>Choisir les enveloppes</Link>
          </Button>
        }
      />
    )
  }
  return (
    <ul className="space-y-0.5" aria-label="Enveloppes du mois">
      {data.items.map((item) => (
        <EnvelopeRow
          key={item.categoryId}
          item={item}
          live={data.current}
          onAdd={() => onAdd(item.categoryId)}
        />
      ))}
    </ul>
  )
}

/**
 * One envelope on one line: its category icon, its name over the bar (the
 * pace mark across it), what's left (« −12 € » once over, in the warning
 * tone when ahead of the pace), then a « + » that says what a tap does.
 */
function EnvelopeRow({
  item,
  live,
  onAdd,
}: {
  item: EnvelopeDto
  /** The month runs: the pace mark is today's. */
  live: boolean
  onAdd: () => void
}) {
  const over = item.remainingCents < 0
  const ratio = item.targetCents > 0 ? item.spentCents / item.targetCents : 0
  const pace =
    item.targetCents > 0 ? Math.min(item.paceCents / item.targetCents, 1) : 0
  const ahead = !over && item.aheadOfPace
  return (
    <li data-ahead={item.aheadOfPace || undefined}>
      <button
        type="button"
        aria-label={`Ajouter une dépense ${item.name}`}
        onClick={onAdd}
        className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px]"
      >
        <CategoryIcon icon={item.icon} color={item.color} />
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-medium">{item.name}</span>
            <span
              className={cn(
                'text-xs font-medium whitespace-nowrap tabular-nums',
                over && 'text-chart-delta-bad',
                ahead && 'text-amber-700 dark:text-amber-300',
              )}
            >
              {over
                ? `−${formatWholeEuros(-item.remainingCents)}`
                : formatWholeEuros(item.remainingCents)}
            </span>
          </span>
          <span
            role="meter"
            aria-label={item.name}
            aria-valuemin={0}
            aria-valuemax={item.targetCents}
            aria-valuenow={item.spentCents}
            aria-valuetext={`${formatBudgetAmount(item.spentCents)} sur ${formatBudgetAmount(item.targetCents)}, ${over ? `dépassé de ${formatBudgetAmount(-item.remainingCents)}` : `reste ${formatBudgetAmount(item.remainingCents)}`}${live ? `, rythme du mois : ${formatBudgetAmount(item.paceCents)}` : ''}${ahead ? ', en avance sur le rythme' : ''}`}
            className="bg-muted relative block h-1.5 rounded-full"
          >
            <span
              className={cn(
                'absolute inset-y-0 left-0 rounded-full',
                ratio > 1
                  ? 'bg-chart-over'
                  : ratio >= WARNING_THRESHOLD
                    ? 'bg-chart-warning'
                    : 'bg-primary',
              )}
              style={{ width: `${Math.min(ratio, 1) * 100}%` }}
            />
            {/* Where an even pace through the month would be today. */}
            {live && (
              <span
                aria-hidden
                className="bg-foreground absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded"
                style={{ left: `${pace * 100}%` }}
              />
            )}
          </span>
        </span>
        <span
          aria-hidden
          className="bg-primary text-primary-foreground flex size-[40px] shrink-0 items-center justify-center rounded-full"
        >
          <PlusIcon className="size-[20px]" strokeWidth={2.5} />
        </span>
      </button>
    </li>
  )
}
