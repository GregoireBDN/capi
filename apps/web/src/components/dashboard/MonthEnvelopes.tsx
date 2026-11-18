import {
  Button,
  Card,
  CardContent,
  cn,
  ProgressMeter,
  Skeleton,
  EmptyState,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PlusIcon, WalletCardsIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { EnvelopeDto, EnvelopesDto } from '#/api/types.gen'
import { formatBudgetAmount } from '#/components/budget/amount'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { envelopesQuery } from '#/components/expenses/queries'
import { ROUTES } from '#/lib/routes'
import { DashboardCardHeader } from './DashboardCardHeader'

/** Same warning level as the budget page (80 % of the target). */
const WARNING_THRESHOLD = 0.8

/**
 * "Ce mois-ci": the envelopes followed during the current month (budget
 * lines flagged "suivre pendant le mois"), each with what was spent so far,
 * imported and noted by hand, what is left, and a mark where an even pace
 * through the month would be today. Expenses are noted from here.
 */
export function MonthEnvelopes({
  figures,
}: {
  /** Figures of the month shown above the envelopes (the forecast tiles). */
  figures?: ReactNode
} = {}) {
  const envelopes = useQuery(envelopesQuery)
  const [sheet, setSheet] = useState<{ open: boolean; categoryId?: string }>({
    open: false,
  })
  const data = envelopes.data

  return (
    <section aria-labelledby="month-envelopes-title" className="min-w-0">
      <Card className="min-w-0">
        <DashboardCardHeader
          id="month-envelopes-title"
          title="Ce mois-ci"
          status={
            data && data.items.length > 0
              ? `Jour ${data.dayOfMonth} sur ${data.daysInMonth} · le trait marque le rythme`
              : undefined
          }
          link={{ label: 'Budget', to: ROUTES.budget }}
        />
        <CardContent className="@container space-y-4">
          {figures}
          {data ? (
            <EnvelopeList
              data={data}
              onAdd={(categoryId) => setSheet({ open: true, categoryId })}
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
          <Button className="w-fit" onClick={() => setSheet({ open: true })}>
            <PlusIcon aria-hidden />
            Ajouter une dépense
          </Button>
        </CardContent>
      </Card>
      <ManualTransactionSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
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
        description="Sur la page Budget, activez « Suivre pendant le mois » pour les catégories à surveiller, comme les sorties."
        actions={
          <Button asChild size="sm" outline variant="secondary">
            <Link to={ROUTES.budget}>Choisir les enveloppes</Link>
          </Button>
        }
      />
    )
  }
  return (
    <ul className="space-y-1" aria-label="Enveloppes du mois">
      {data.items.map((item) => (
        <EnvelopeRow
          key={item.categoryId}
          item={item}
          month={data.month}
          onAdd={() => onAdd(item.categoryId)}
        />
      ))}
    </ul>
  )
}

function EnvelopeRow({
  item,
  month,
  onAdd,
}: {
  item: EnvelopeDto
  month: string
  onAdd: () => void
}) {
  const over = item.remainingCents < 0
  return (
    <li
      data-ahead={item.aheadOfPace || undefined}
      className="flex items-start gap-1"
    >
      <Link
        to={ROUTES.transactions}
        search={{ month, category: item.categoryId, kind: 'expense' }}
        aria-label={`Opérations ${item.name} du mois`}
        // One envelope per line on a wide card: the long bar, then what's
        // left at the end of the line; stacked on a phone.
        className="hover:bg-muted/50 focus-visible:ring-ring/50 -mx-2 block min-w-0 flex-1 space-y-1.5 rounded-lg px-2 py-2 outline-none focus-visible:ring-[3px] @[36rem]:flex @[36rem]:items-end @[36rem]:gap-6 @[36rem]:space-y-0"
      >
        <ProgressMeter
          className="min-w-0 flex-1"
          label={item.name}
          value={item.spentCents}
          target={item.targetCents}
          valueFormatter={formatBudgetAmount}
          warningThreshold={WARNING_THRESHOLD}
          hideStatus
          marker={{
            value: item.paceCents,
            label: `rythme du mois : ${formatBudgetAmount(item.paceCents)}`,
          }}
        />
        <span className="flex flex-wrap justify-between gap-x-3 text-xs @[36rem]:w-48 @[36rem]:shrink-0 @[36rem]:flex-col @[36rem]:items-end @[36rem]:text-right">
          <span
            className={cn(
              'whitespace-nowrap',
              over ? 'text-chart-delta-bad font-medium' : 'font-medium',
            )}
          >
            {over
              ? `Dépassé de ${formatBudgetAmount(-item.remainingCents)}`
              : `Reste ${formatBudgetAmount(item.remainingCents)}`}
            {!over && item.aheadOfPace && (
              <span className="text-amber-700 dark:text-amber-300">
                {' '}
                · en avance
              </span>
            )}
          </span>
          {item.manualCents !== 0 && (
            <span className="text-muted-foreground">
              {item.manualCents === item.spentCents
                ? 'tout noté à la main'
                : `dont ${formatBudgetAmount(item.manualCents)} noté à la main`}
            </span>
          )}
        </span>
      </Link>
      <Button
        variant="secondary"
        ghost
        iconOnly
        className="mt-1"
        aria-label={`Ajouter une dépense ${item.name}`}
        onClick={onAdd}
      >
        <PlusIcon />
      </Button>
    </li>
  )
}
