import {
  Button,
  Card,
  CardContent,
  CategoryIcon,
  cn,
  Skeleton,
  EmptyState,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PlusIcon, WalletCardsIcon } from 'lucide-react'
import { useState } from 'react'
import type { EnvelopeDto, EnvelopesDto } from '#/api/types.gen'
import { formatBudgetAmount } from '#/components/budget/amount'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { envelopesQuery } from '#/components/expenses/queries'
import { currentMonth } from '#/lib/calendar'
import { ROUTES } from '#/lib/routes'
import { DashboardCardHeader } from './DashboardCardHeader'

/** Same warning level as the budget page (80 % of the target). */
const WARNING_THRESHOLD = 0.8

/**
 * « Budget » (#321, formerly « Ce mois-ci »): the envelopes of the month
 * the dashboard follows (budget lines flagged « suivre pendant le mois »),
 * each with what was spent against its target and what is left. While the
 * month runs, a mark where an even pace through the month would be today,
 * and expenses are noted from here (a tap on an envelope, or « Ajouter une
 * dépense »); a past month is only read.
 */
export function MonthEnvelopes({ month }: { month: string }) {
  const current = month === currentMonth()
  const envelopes = useQuery(envelopesQuery(current ? undefined : month))
  const [sheet, setSheet] = useState<{ open: boolean; categoryId?: string }>({
    open: false,
  })
  // While another month loads, the previous figures stay, but not the
  // actions of the wrong month.
  const data = envelopes.data
  const live = current && data?.current === true

  return (
    <section aria-labelledby="month-envelopes-title" className="min-w-0">
      <Card className="min-w-0">
        <DashboardCardHeader
          id="month-envelopes-title"
          title="Budget"
          status={
            live && data.items.length > 0
              ? `Jour ${data.dayOfMonth} sur ${data.daysInMonth} · le trait marque le rythme`
              : undefined
          }
          link={{
            label: 'Détail',
            to: ROUTES.budget,
            search: current ? {} : { month },
          }}
        />
        <CardContent className="@container space-y-4">
          {data ? (
            <EnvelopeList
              data={data}
              onAdd={
                live
                  ? (categoryId) => setSheet({ open: true, categoryId })
                  : undefined
              }
            />
          ) : envelopes.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
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
            <div aria-busy="true" aria-label="Chargement des enveloppes">
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          {current && (
            <Button className="w-full" onClick={() => setSheet({ open: true })}>
              <PlusIcon aria-hidden />
              Ajouter une dépense
            </Button>
          )}
        </CardContent>
      </Card>
      {current && (
        <ManualTransactionSheet
          open={sheet.open}
          onOpenChange={(open) => setSheet((state) => ({ ...state, open }))}
          initialCategoryId={sheet.categoryId}
          suggestedCategoryIds={data?.items.map((item) => item.categoryId)}
        />
      )}
    </section>
  )
}

function EnvelopeList({
  data,
  onAdd,
}: {
  data: EnvelopesDto
  /** Notes an expense in an envelope; absent for a month that is over. */
  onAdd?: (categoryId: string) => void
}) {
  if (data.items.length === 0) {
    return data.current ? (
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
    ) : (
      <EmptyState
        variant="inline"
        icon={<WalletCardsIcon />}
        title="Aucune enveloppe suivie ce mois-là"
        description="Les catégories marquées « Suivre pendant le mois » sur la page Budget s’affichent ici."
      />
    )
  }
  return (
    <ul className="space-y-2" aria-label="Enveloppes du mois">
      {data.items.map((item) => (
        <EnvelopeRow
          key={item.categoryId}
          item={item}
          onAdd={onAdd && (() => onAdd(item.categoryId))}
        />
      ))}
    </ul>
  )
}

/**
 * One envelope, one target (#262, owner's « Appuyer = ajouter »): while the
 * month runs, the whole row notes an expense in it (the sheet opens at the
 * amount). Its category icon on its colour, the spent amount against the
 * target (with the pace mark while the month runs), what's left, and a
 * « + » that says what a tap does. A past month's row is only read.
 */
function EnvelopeRow({
  item,
  onAdd,
}: {
  item: EnvelopeDto
  onAdd?: () => void
}) {
  const over = item.remainingCents < 0
  const ratio = item.targetCents > 0 ? item.spentCents / item.targetCents : 0
  const live = onAdd !== undefined
  const pace =
    item.targetCents > 0 ? Math.min(item.paceCents / item.targetCents, 1) : 0
  const body = (
    <>
      {/* Its category, and what a tap does. */}
      <span className="flex items-center gap-2.5">
        <CategoryIcon icon={item.icon} color={item.color} />
        <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
        {live && (
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex size-[40px] shrink-0 items-center justify-center rounded-full"
          >
            <PlusIcon className="size-[22px]" strokeWidth={2.5} />
          </span>
        )}
      </span>
      <span
        role="meter"
        aria-label={item.name}
        aria-valuemin={0}
        aria-valuemax={item.targetCents}
        aria-valuenow={item.spentCents}
        aria-valuetext={`${formatBudgetAmount(item.spentCents)} sur ${formatBudgetAmount(item.targetCents)}${live ? `, rythme du mois : ${formatBudgetAmount(item.paceCents)}` : ''}`}
        className="bg-muted relative block h-2 rounded-full"
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
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
        <span className="tabular-nums">
          <span className="font-medium">
            {formatBudgetAmount(item.spentCents)}
          </span>
          <span className="text-muted-foreground">
            {' '}
            / {formatBudgetAmount(item.targetCents)}
          </span>
        </span>
        <span
          className={cn(
            'ml-auto font-medium whitespace-nowrap',
            over && 'text-chart-delta-bad',
          )}
        >
          {over
            ? `Dépassé de ${formatBudgetAmount(-item.remainingCents)}`
            : live
              ? `Reste ${formatBudgetAmount(item.remainingCents)}`
              : `${formatBudgetAmount(item.remainingCents)} sous l’objectif`}
          {!over && item.aheadOfPace && (
            <span className="text-amber-700 dark:text-amber-300">
              {' '}
              · en avance
            </span>
          )}
        </span>
      </span>
    </>
  )
  return (
    <li data-ahead={item.aheadOfPace || undefined}>
      {live ? (
        <button
          type="button"
          aria-label={`Ajouter une dépense ${item.name}`}
          onClick={onAdd}
          className="border-border hover:bg-muted/50 focus-visible:ring-ring/50 block w-full space-y-2 rounded-xl border px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-[3px]"
        >
          {body}
        </button>
      ) : (
        <div className="border-border block space-y-2 rounded-xl border px-3 py-2.5 text-sm">
          {body}
        </div>
      )}
    </li>
  )
}
