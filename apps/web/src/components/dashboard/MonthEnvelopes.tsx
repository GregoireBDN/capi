import {
  Button,
  Card,
  CardContent,
  cn,
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
import { categoryIconComponent } from '#/components/categories/category-icons'
import { DashboardCardHeader } from './DashboardCardHeader'

/** Same warning level as the budget page (80 % of the target). */
const WARNING_THRESHOLD = 0.8

/**
 * "Ce mois-ci": the envelopes followed during the current month (budget
 * lines flagged "suivre pendant le mois"), each with what was spent so far,
 * what is left, and a mark where an even pace
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
        <CardContent className="@container mb-0 space-y-4">
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
          <Button className="w-full" onClick={() => setSheet({ open: true })}>
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
    <ul className="space-y-2" aria-label="Enveloppes du mois">
      {data.items.map((item) => (
        <EnvelopeRow
          key={item.categoryId}
          item={item}
          onAdd={() => onAdd(item.categoryId)}
        />
      ))}
    </ul>
  )
}

/**
 * One envelope, one target (#262, owner's « Appuyer = ajouter »): the whole
 * row notes an expense in it (the sheet opens at the amount). Its category
 * icon on its colour, the spent amount against the target with the pace
 * mark, what's left, and a « + » that says what a tap does.
 */
function EnvelopeRow({
  item,
  onAdd,
}: {
  item: EnvelopeDto
  onAdd: () => void
}) {
  const over = item.remainingCents < 0
  const Icon = categoryIconComponent(item.icon)
  const color = item.color ?? 'var(--chart-other)'
  const ratio = item.targetCents > 0 ? item.spentCents / item.targetCents : 0
  const pace =
    item.targetCents > 0 ? Math.min(item.paceCents / item.targetCents, 1) : 0
  return (
    <li data-ahead={item.aheadOfPace || undefined}>
      <button
        type="button"
        aria-label={`Ajouter une dépense ${item.name}`}
        onClick={onAdd}
        className="border-border hover:bg-muted/50 focus-visible:ring-ring/50 block w-full space-y-2 rounded-xl border px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-[3px]"
      >
        {/* Its category, and what a tap does. */}
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-[28px] shrink-0 items-center justify-center rounded-full text-white [&_svg]:size-[14px]"
            style={{
              backgroundColor: `color-mix(in srgb, ${color} 78%, black)`,
            }}
          >
            <Icon />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {item.name}
          </span>
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex size-[40px] shrink-0 items-center justify-center rounded-full"
          >
            <PlusIcon className="size-[22px]" strokeWidth={2.5} />
          </span>
        </span>
        <span
          role="meter"
          aria-label={item.name}
          aria-valuemin={0}
          aria-valuemax={item.targetCents}
          aria-valuenow={item.spentCents}
          aria-valuetext={`${formatBudgetAmount(item.spentCents)} sur ${formatBudgetAmount(item.targetCents)}, rythme du mois : ${formatBudgetAmount(item.paceCents)}`}
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
          <span
            aria-hidden
            className="bg-foreground absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded"
            style={{ left: `${pace * 100}%` }}
          />
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
              : `Reste ${formatBudgetAmount(item.remainingCents)}`}
            {!over && item.aheadOfPace && (
              <span className="text-amber-700 dark:text-amber-300">
                {' '}
                · en avance
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}
