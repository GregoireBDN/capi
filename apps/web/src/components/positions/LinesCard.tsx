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
import { DashboardCardHeader } from '#/components/dashboard/DashboardCardHeader'
import { formatCalendarDate, formatCents, formatWholeEuros } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
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

/** A figure in the unfolded line: a row on a phone, a tile from 560px. */
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
    <div className="bg-muted/50 flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 @min-[560px]:block">
      <p className="text-muted-foreground min-w-0 truncate">{label}</p>
      <div className="shrink-0 text-right @min-[560px]:text-left">
        <p
          className={cn(
            'text-sm font-semibold whitespace-nowrap tabular-nums',
            toneClass,
          )}
        >
          {children}
        </p>
        {note && <p className="text-muted-foreground tabular-nums">{note}</p>}
      </div>
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
  const value =
    line.valueCents === null ? (
      <Badge variant="warning" outline>
        Sans cours
      </Badge>
    ) : (
      formatCents(line.valueCents)
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
        {/* A phone (#344's « Nom puis chiffres »): the name alone, then the
            value and result, then the parts and share; from 24rem of card,
            the value and result on the right like the crypto assets. */}
        <span className="grid min-w-0 flex-1 grid-cols-1 items-baseline gap-x-3 gap-y-0.5 @min-[24rem]:grid-cols-[1fr_auto]">
          <span className="min-w-0 font-medium break-normal">
            {shortName(line.name)}
          </span>
          <span className="hidden text-right font-medium whitespace-nowrap tabular-nums @min-[24rem]:block">
            {value}
          </span>
          <span className="whitespace-nowrap tabular-nums @min-[24rem]:hidden">
            <span className="font-medium">{value}</span>
            {rateText}
          </span>
          <span className="text-muted-foreground min-w-0 text-xs break-normal tabular-nums">
            <span className="whitespace-nowrap">
              {formatQuantity(line.quantity)} parts
            </span>
            {share && <span className="whitespace-nowrap"> · {share}</span>}
          </span>
          <span className="hidden text-right text-xs whitespace-nowrap tabular-nums @min-[24rem]:block">
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
        <div className="grid grid-cols-1 gap-1.5 @min-[560px]:grid-cols-3 @min-[560px]:gap-2">
          {line.costCents !== null && line.unitCostEur !== null ? (
            <Fact label="Investi" note={`PRU ${formatPrice(line.unitCostEur)}`}>
              {formatCents(line.costCents)}
            </Fact>
          ) : (
            <p className="text-muted-foreground self-center">
              PRU non renseigné
            </p>
          )}
          {line.gainCents !== null && (
            <Fact
              label="Résultat"
              toneClass={tone(line.gainCents)}
              note={
                rate !== null && (
                  <span className={tone(line.gainCents)}>
                    {formatSignedPercent(rate)}
                  </span>
                )
              }
            >
              {signed(line.gainCents)}
            </Fact>
          )}
          <Fact
            label="Cours"
            note={
              line.priceDay
                ? `${line.priceSource === 'manual' ? 'manuel' : 'relevé'}, ${formatShortDay(line.priceDay, year)}`
                : 'pas encore saisi'
            }
          >
            {line.priceEur ? formatPrice(line.priceEur) : '—'}
          </Fact>
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

/** The statements the lines come from, folded at the end of the card. */
function Statements({
  accountId,
  data,
  writable,
}: {
  accountId: string
  data: PositionsDto
  writable: boolean
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const id = useId()
  const remove = useMutation({
    mutationFn: (asOf: string) => removeStatement(accountId, asOf),
    onSuccess: async (_data, asOf) => {
      toast.success(`Relevé du ${formatCalendarDate(asOf)} supprimé`)
      setDeleting(null)
      await afterPositionsChanged(queryClient)
    },
    onError: () => toast.error('Impossible de supprimer ce relevé.'),
  })
  if (data.statements.length === 0) return null
  return (
    <div className="border-t pt-2">
      <Button
        ghost
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls={id}
        iconEnd={
          <ChevronDownIcon
            aria-hidden
            className={cn('transition-transform', open && 'rotate-180')}
          />
        }
        onClick={() => setOpen(!open)}
      >
        Relevés de portefeuille ({data.statements.length})
      </Button>
      <ul id={id} hidden={!open} className="divide-y">
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
 * « Lignes » (#413, the owner's « A. Comme le Crypto »): the split of the
 * value, one row per ETF like the Crypto page's « Actifs », the cash last,
 * the lines' cost, then the statements folded.
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
                  {/* Like a line: the amount under the word on a phone. */}
                  <span className="grid min-w-0 flex-1 grid-cols-1 items-baseline gap-x-3 gap-y-0.5 @min-[24rem]:grid-cols-[1fr_auto]">
                    <span className="font-medium">Liquidités</span>
                    <span className="font-medium whitespace-nowrap tabular-nums @min-[24rem]:row-span-2 @min-[24rem]:self-center @min-[24rem]:text-right">
                      {formatCents(data.cashCents)}
                    </span>
                    {total > 0 && (
                      <span className="text-muted-foreground text-xs tabular-nums">
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
            {data.totals.costCents > 0 && (
              <p className="text-muted-foreground border-t pt-3 text-xs tabular-nums">
                Prix de revient des lignes{' '}
                {formatWholeEuros(data.totals.costCents)} · résultat{' '}
                <span className={tone(data.totals.gainCents)}>
                  {data.totals.gainCents > 0 ? '+' : ''}
                  {formatWholeEuros(data.totals.gainCents)}
                </span>
                {data.totals.withoutCostCount > 0 &&
                  ` · hors ${data.totals.withoutCostCount} ligne${data.totals.withoutCostCount > 1 ? 's' : ''} sans PRU`}
              </p>
            )}
          </>
        )}
        <Statements accountId={accountId} data={data} writable={writable} />
      </CardContent>
    </Card>
  )
}
