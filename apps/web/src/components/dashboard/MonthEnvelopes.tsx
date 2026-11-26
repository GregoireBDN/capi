import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import { Button, Card, CategoryIcon, cn, Skeleton, EmptyState } from '@capi/ui'
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
 * « Budgets suivis » (#262, #321, compact since #405; « Enveloppes » until #430): the current month's
 * envelopes (budget lines flagged « suivre pendant le mois »), a tile
 * each (#495): its category in a ring of what's left, the amount, its name
 * and a « + »; a tap on the tile notes an expense in it (owner's « Appuyer =
 * ajouter »). « Ajouter une dépense » is an item of
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
            Budgets suivis
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
              Budgets suivis indisponibles.
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
            aria-label="Chargement des budgets suivis"
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
        title="Aucun budget suivi"
        description="Sur la page Budget, activez « Suivre pendant le mois » pour les catégories à surveiller, comme les sorties."
        actions={
          <Button asChild size="sm" outline variant="secondary">
            <Link to={ROUTES.budget}>Choisir les budgets suivis</Link>
          </Button>
        }
      />
    )
  }
  return (
    <ul
      className="grid grid-cols-3 gap-2 px-1 pt-1"
      aria-label="Budgets suivis du mois"
    >
      {data.items.map((item) => (
        <EnvelopeTile
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
 * One tracked budget as a tile (#495, the owner's « B. Tuiles « + » »): its
 * category icon in a ring of what's left (red once over), what's left under
 * it (« −12 € » once over, in the warning tone when ahead of the pace), its
 * name, and a filled « + » on the corner: the whole tile is the button that
 * notes an expense in it, and says so.
 */
function EnvelopeTile({
  item,
  live,
  onAdd,
}: {
  item: EnvelopeDto
  /** The month runs: the pace is today's. */
  live: boolean
  onAdd: () => void
}) {
  const over = item.remainingCents < 0
  const left =
    item.targetCents > 0
      ? Math.max(item.remainingCents, 0) / item.targetCents
      : 0
  const ratio = item.targetCents > 0 ? item.spentCents / item.targetCents : 0
  const ahead = !over && item.aheadOfPace
  const ringColor = over
    ? 'var(--chart-over)'
    : ratio >= WARNING_THRESHOLD
      ? 'var(--chart-warning)'
      : (item.color ?? 'var(--primary)')
  return (
    <li data-ahead={item.aheadOfPace || undefined} className="min-w-0">
      <button
        type="button"
        aria-label={`Ajouter une dépense ${item.name}`}
        onClick={onAdd}
        className="bg-muted/50 hover:bg-muted focus-visible:ring-ring/50 relative flex h-full w-full min-w-0 flex-col items-center gap-1 rounded-2xl px-1.5 pt-2.5 pb-2 text-center outline-none focus-visible:ring-[3px]"
      >
        <span
          role="meter"
          aria-label={item.name}
          aria-valuemin={0}
          aria-valuemax={item.targetCents}
          aria-valuenow={item.spentCents}
          aria-valuetext={`${formatBudgetAmount(item.spentCents)} sur ${formatBudgetAmount(item.targetCents)}, ${over ? `dépassé de ${formatBudgetAmount(-item.remainingCents)}` : `reste ${formatBudgetAmount(item.remainingCents)}`}${live ? `, rythme du mois : ${formatBudgetAmount(item.paceCents)}` : ''}${ahead ? ', en avance sur le rythme' : ''}`}
          className="relative grid size-[56px] place-items-center"
        >
          <Ring ratio={over ? 1 : left} color={ringColor} />
          <CategoryIcon
            icon={item.icon}
            color={item.color}
            className="size-[40px] rounded-full [&_svg]:size-[20px]"
          />
        </span>
        <span
          className={cn(
            'text-sm font-bold whitespace-nowrap tabular-nums',
            over && 'text-chart-delta-bad',
            ahead && 'text-amber-700 dark:text-amber-300',
          )}
        >
          {over
            ? `−${formatWholeEuros(-item.remainingCents)}`
            : formatWholeEuros(item.remainingCents)}
        </span>
        <span className="text-muted-foreground line-clamp-2 text-xs leading-tight break-normal">
          {item.name}
        </span>
        <span
          aria-hidden
          className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 grid size-[24px] place-items-center rounded-full shadow-sm"
        >
          <PlusIcon className="size-[14px]" strokeWidth={3} />
        </span>
      </button>
    </li>
  )
}

/** A ring filled to `ratio` from the top, clockwise, on the muted track. */
function Ring({ ratio, color }: { ratio: number; color: string }) {
  const size = 56
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0 size-full -rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={stroke}
      />
      {ratio > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.min(ratio, 1)} ${c}`}
        />
      )}
    </svg>
  )
}
