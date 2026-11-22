import {
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  ConfirmDialog,
  EmptyState,
  formatSignedPercent,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BanknoteIcon,
  ChevronDownIcon,
  FileTextIcon,
  ListPlusIcon,
  PencilIcon,
  TagIcon,
  Trash2Icon,
} from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import type { PositionLineDto, PositionsDto } from '#/api/types.gen'
import { formatPrice, formatQuantity } from '#/components/crypto/format'
import { rowAmount } from '#/components/crypto/HoldingsPanel'
import { DashboardCardHeader } from '#/components/dashboard/DashboardCardHeader'
import { formatCalendarDate, formatCents, formatWholeEuros } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import type { AccountDetail } from '#/components/accounts/AccountDetails'
import { todayInParis } from '#/components/accounts/dates'
import {
  afterPositionsChanged,
  positionsQuery,
  removeStatement,
} from './queries'
import { lineColor, lineShare, linesStatus, shortName, tickerOf } from './lines'

function tone(cents: number) {
  return cn(
    cents > 0 && 'text-chart-delta-good',
    cents < 0 && 'text-chart-delta-bad',
  )
}

const signed = (cents: number) => `${cents > 0 ? '+' : ''}${formatCents(cents)}`

/** The ticker on a disc of the line's colour; hidden on the narrowest cards. */
function LineBadge({ line, index }: { line: PositionLineDto; index: number }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full text-[0.5rem] font-bold tracking-tighter text-white @max-[18rem]:hidden"
      style={{ background: lineColor(index) }}
    >
      {tickerOf(line)}
    </span>
  )
}

/** A figure of the unfolded line: a tile, its figure sized on its width. */
function Fact({
  label,
  children,
  note,
  toneClass,
}: {
  label: string
  children: React.ReactNode
  note?: React.ReactNode
  toneClass?: string
}) {
  return (
    <div className="bg-muted/50 @container min-w-0 rounded-lg px-3 py-2">
      <p className="text-muted-foreground truncate">{label}</p>
      <p
        className={cn(
          'text-[clamp(0.7rem,11cqi,0.95rem)] font-semibold whitespace-nowrap tabular-nums',
          toneClass,
        )}
      >
        {children}
      </p>
      {note && (
        <p className="text-muted-foreground truncate tabular-nums">{note}</p>
      )}
    </div>
  )
}

/** One ETF; tapping it unfolds its ISIN, cost, result and price (#413, A). */
function LineRow({
  line,
  index,
  totalCents,
  asOf,
  writable,
  onEdit,
  onPrice,
}: {
  line: PositionLineDto
  index: number
  totalCents: number
  asOf: string
  writable: boolean
  onEdit: () => void
  onPrice: () => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const year = asOf.slice(0, 4)
  const rate =
    line.gainCents !== null && line.costCents
      ? line.gainCents / line.costCents
      : null
  const share =
    line.valueCents !== null ? lineShare(line.valueCents, totalCents) : null
  // From 1 000 € without cents, like the crypto lines: room for the name.
  const value =
    line.valueCents === null ? (
      <Badge variant="warning" outline>
        Sans cours
      </Badge>
    ) : (
      rowAmount(line.valueCents)
    )
  const rateText = rate !== null && line.gainCents !== null && (
    <span
      className={cn('ml-2 text-xs @min-[24rem]:ml-0', tone(line.gainCents))}
    >
      {formatSignedPercent(rate)}
    </span>
  )
  const label = [
    line.name,
    line.valueCents === null ? 'sans cours' : formatCents(line.valueCents),
    `${formatQuantity(line.quantity)} parts`,
    rate !== null && `résultat ${formatSignedPercent(rate)}`,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <li>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cn(
          'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 @min-[400px]:gap-3',
          open && 'bg-muted/40',
        )}
      >
        <LineBadge line={line} index={index} />
        {/* Two lines on every width (#413, the owner): the name and the
            value, then the parts and the result; the rest unfolds. */}
        <span className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5">
          <span className="min-w-0 truncate font-medium">
            {shortName(line.name)}
          </span>
          <span className="text-right font-medium whitespace-nowrap tabular-nums">
            {value}
          </span>
          <span className="text-muted-foreground min-w-0 truncate text-xs tabular-nums">
            {formatQuantity(line.quantity)} parts
          </span>
          <span className="text-right text-xs whitespace-nowrap tabular-nums">
            {rateText}
          </span>
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        id={id}
        hidden={!open}
        className="mb-3 space-y-3 px-2 pt-1 text-xs @[18rem]:pl-[52px]"
      >
        <p className="text-muted-foreground">
          ISIN <span className="text-foreground font-mono">{line.isin}</span>
        </p>
        {/* More figures once unfolded (#413, the owner): two tiles a row
            on a phone, three from 560px of card. */}
        <div className="grid grid-cols-2 gap-1.5 @min-[560px]:grid-cols-3 @min-[560px]:gap-2">
          <Fact label="Investi">
            {line.costCents === null ? '—' : formatCents(line.costCents)}
          </Fact>
          <Fact
            label="Résultat"
            toneClass={
              line.gainCents === null ? undefined : tone(line.gainCents)
            }
            note={
              rate !== null &&
              line.gainCents !== null && (
                <span className={tone(line.gainCents)}>
                  {formatSignedPercent(rate)}
                </span>
              )
            }
          >
            {line.gainCents === null ? '—' : signed(line.gainCents)}
          </Fact>
          <Fact
            label="Cours"
            // Its day only; « manuel » when typed by hand.
            note={
              line.priceDay
                ? `${formatShortDay(line.priceDay, year)}${line.priceSource === 'manual' ? ' · manuel' : ''}`
                : 'à saisir'
            }
          >
            {line.priceEur ? formatPrice(line.priceEur) : '—'}
          </Fact>
          <Fact label="PRU">
            {line.unitCostEur ? formatPrice(line.unitCostEur) : '—'}
          </Fact>
          <Fact label="Part">{share ?? '—'}</Fact>
          <Fact label="Quantité">{formatQuantity(line.quantity)}</Fact>
        </div>
        {line.priceOlderThanStatement && (
          <p className="text-muted-foreground">
            Cours plus ancien que le relevé du {formatShortDay(asOf, year)}.
          </p>
        )}
        {writable && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              outline
              variant="secondary"
              iconStart={<PencilIcon />}
              onClick={onEdit}
            >
              Modifier la ligne
            </Button>
            <Button
              size="sm"
              outline
              variant="secondary"
              iconStart={<TagIcon />}
              onClick={onPrice}
            >
              {line.priceEur ? 'Nouveau cours' : 'Saisir le cours'}
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

/** The value as one bar of its lines and its cash, with a legend. */
function SplitBar({ data }: { data: PositionsDto }) {
  const priced = data.lines.filter((line) => line.valueCents !== null)
  const total = data.totals.pricedValueCents
  if (total <= 0) return null
  const parts = [
    ...priced.map((line) => ({
      key: line.isin,
      label: shortName(line.name),
      cents: line.valueCents!,
      color: lineColor(data.lines.indexOf(line)),
    })),
    ...(data.cashCents > 0
      ? [
          {
            key: 'cash',
            label: 'Liquidités',
            cents: data.cashCents,
            color: 'var(--chart-other)',
          },
        ]
      : []),
  ]
  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label={`Répartition : ${parts
          .map((part) => `${part.label} ${lineShare(part.cents, total)}`)
          .join(', ')}`}
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
      >
        {parts.map((part) => (
          <span
            key={part.key}
            className="h-full"
            style={{
              width: `${(part.cents / total) * 100}%`,
              background: part.color,
            }}
          />
        ))}
      </div>
      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((part) => (
          <li key={part.key} className="flex min-w-0 items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: part.color }}
            />
            <span className="text-muted-foreground truncate">{part.label}</span>
            <span className="tabular-nums">{lineShare(part.cents, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The statements the lines come from, newest first, each deletable. */
function StatementsList({
  accountId,
  data,
  writable,
}: {
  accountId: string
  data: PositionsDto
  writable: boolean
}) {
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState<string | null>(null)
  const remove = useMutation({
    mutationFn: (asOf: string) => removeStatement(accountId, asOf),
    onSuccess: async (_data, asOf) => {
      toast.success(`Relevé du ${formatCalendarDate(asOf)} supprimé`)
      setDeleting(null)
      await afterPositionsChanged(queryClient)
    },
    onError: () => toast.error('Impossible de supprimer ce relevé.'),
  })
  return (
    <div>
      <ul className="divide-y" aria-label="Relevés de portefeuille">
        {data.statements.map((statement) => (
          <li
            key={statement.asOf}
            className="flex min-h-11 items-center gap-3 py-1.5 text-sm"
          >
            <FileTextIcon
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {formatCalendarDate(statement.asOf)}
              </span>
              <span className="text-muted-foreground block text-xs">
                {statement.lineCount} ligne{statement.lineCount > 1 ? 's' : ''}
                {' · '}
                {statement.source === 'mcp' ? 'lu par Claude' : 'saisi'}
              </span>
            </span>
            {writable && (
              <Button
                ghost
                size="sm"
                variant="secondary"
                iconOnly
                aria-label={`Supprimer le relevé du ${formatCalendarDate(statement.asOf)}`}
                onClick={() => setDeleting(statement.asOf)}
              >
                <Trash2Icon />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={
          deleting
            ? `Supprimer le relevé du ${formatCalendarDate(deleting)} ?`
            : ''
        }
        description="Ses lignes et la valeur qu’elles donnaient seront retirées ; les valeurs saisies restent."
        confirmLabel="Supprimer"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting)
        }}
      />
    </div>
  )
}

/**
 * A PEA's statements (#413), the whole account on each day: a row of « Plus
 * d’informations » (#447), absent while there is none.
 */
export function useStatementsDetail({
  accountId,
  writable,
  enabled,
}: {
  accountId: string
  writable: boolean
  /** Only a PEA has statements. */
  enabled: boolean
}): AccountDetail | null {
  const positions = useQuery({ ...positionsQuery(accountId), enabled })
  const data = positions.data
  if (!enabled || !data || data.statements.length === 0) return null
  const latest = data.statements[0].asOf
  return {
    id: 'statements',
    icon: FileTextIcon,
    label: 'Relevés de portefeuille',
    summary: `${data.statements.length} · au ${formatShortDay(latest, todayInParis().slice(0, 4))}`,
    description:
      'Ce que contenait le PEA à chaque relevé, lu par Claude ou saisi.',
    content: (
      <StatementsList accountId={accountId} data={data} writable={writable} />
    ),
  }
}

/**
 * « Lignes » (#413, the owner's « A. Comme le Crypto »): the split of the
 * value, one row per ETF like the Crypto page's « Actifs », the cash last,
 * the lines' cost. Its statements are in « Plus d’informations » (#447).
 */
export function LinesCard({
  accountId,
  writable,
  onAddLine,
  onEditLine,
  onEditPrice,
  onEditCash,
}: {
  accountId: string
  writable: boolean
  onAddLine: () => void
  onEditLine: (line: PositionLineDto) => void
  onEditPrice: (line: PositionLineDto) => void
  onEditCash: () => void
}) {
  const positions = useQuery(positionsQuery(accountId))
  const data = positions.data
  if (!data) return null
  const total = data.totals.pricedValueCents
  return (
    <Card role="region" aria-label="Lignes" className="min-w-0">
      <DashboardCardHeader title="Lignes" status={linesStatus(data)} />
      <CardContent className="@container space-y-4">
        {data.lines.length === 0 && data.cashCents === 0 ? (
          <EmptyState
            variant="inline"
            icon={<ListPlusIcon />}
            title="Ce que contient votre PEA"
            description="Ajoutez vos lignes pour voir chaque ETF, son prix de revient et son résultat. Claude peut aussi les lire sur votre relevé."
            actions={
              writable && (
                <Button iconStart={<ListPlusIcon />} onClick={onAddLine}>
                  Ajouter une ligne
                </Button>
              )
            }
          />
        ) : (
          <>
            <SplitBar data={data} />
            <ul aria-label="Lignes" className="space-y-0.5">
              {data.lines.map((line, index) => (
                <LineRow
                  key={line.isin}
                  line={line}
                  index={index}
                  totalCents={total}
                  asOf={data.asOf ?? ''}
                  writable={writable}
                  onEdit={() => onEditLine(line)}
                  onPrice={() => onEditPrice(line)}
                />
              ))}
              <li>
                <button
                  type="button"
                  disabled={!writable}
                  onClick={onEditCash}
                  aria-label={`Liquidités, ${formatCents(data.cashCents)}`}
                  className="hover:bg-muted/60 focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 disabled:hover:bg-transparent @min-[400px]:gap-3"
                >
                  <span
                    aria-hidden
                    className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full @max-[18rem]:hidden"
                  >
                    <BanknoteIcon className="size-4" />
                  </span>
                  {/* Two lines like an ETF: the word and the amount, then
                      its share. */}
                  <span className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5">
                    <span className="font-medium break-normal">Liquidités</span>
                    <span className="text-right font-medium whitespace-nowrap tabular-nums">
                      {rowAmount(data.cashCents)}
                    </span>
                    {total > 0 && (
                      <span className="text-muted-foreground col-span-2 text-xs tabular-nums">
                        {lineShare(data.cashCents, total)}
                      </span>
                    )}
                  </span>
                  {writable ? (
                    <PencilIcon
                      aria-hidden
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  ) : (
                    <span aria-hidden className="size-4 shrink-0" />
                  )}
                </button>
              </li>
            </ul>
            {/* What the lines are worth, what they cost and the difference
                (#413, the owner: « prix de revient » said plainly). */}
            {data.totals.costCents > 0 && (
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 border-t px-2 pt-3 text-sm">
                <span className="min-w-0 truncate font-medium">Total</span>
                <span className="text-right font-medium whitespace-nowrap tabular-nums">
                  {formatCents(data.totals.costCents + data.totals.gainCents)}
                </span>
                <span className="text-muted-foreground min-w-0 text-xs break-normal tabular-nums">
                  <span className="whitespace-nowrap">
                    acheté {formatWholeEuros(data.totals.costCents)}
                  </span>
                  {data.totals.withoutCostCount > 0 && (
                    <span className="whitespace-nowrap">
                      {' '}
                      · hors {data.totals.withoutCostCount} sans PRU
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-right text-xs whitespace-nowrap tabular-nums',
                    tone(data.totals.gainCents),
                  )}
                >
                  {data.totals.gainCents > 0 ? '+' : ''}
                  {formatWholeEuros(data.totals.gainCents)}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
