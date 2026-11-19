import {
  AreaChart,
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  ConfirmDialog,
  EmptyState,
  formatSignedPercent,
  ItemList,
  ItemListGroup,
  ItemListRow,
  SegmentedControl,
  SegmentedControlItem,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  useIsMobile,
} from '@finances/ui'
import type { ChartConfig } from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckIcon,
  ChevronDownIcon,
  CoinsIcon,
  CopyIcon,
  KeyRoundIcon,
  LineChartIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type {
  AccountDto,
  AccountHoldingsDto,
  AccountPerformanceDto,
  SnapshotDto,
  ValuedHoldingDto,
  WalletKeyDto,
} from '#/api/types.gen'
import { afterSnapshotsChanged } from '#/components/accounts/queries'
import { DashboardCardHeader } from '#/components/dashboard/DashboardCardHeader'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { plural } from '#/lib/plural'
import {
  AddWalletKeySheet,
  keyErrorMessage,
  keyScanText,
  syncFailed,
  useWalletSync,
  WalletKeyTypeSheet,
  WalletTokenList,
} from './CryptoSourceCard'
import { holdingErrorMessage } from './errors'
import { formatPrice, formatPriceAge, formatQuantity } from './format'
import {
  afterHoldingsChanged,
  cryptoKeys,
  holdingsQuery,
  refreshPrices,
  removeHolding,
  removeWalletKey,
  walletKeysQuery,
  walletTokensQuery,
} from './queries'
import {
  CRYPTO_CHAIN_LABELS,
  DERIVED_ORIGIN_LABELS,
  maskPublicKey,
  walletKeyTypeLabel,
} from './sources'
import {
  chartRanges,
  groupHoldings,
  monthsBefore,
  RANGE_LABELS,
  shareText,
  splitParts,
} from './wallet-assets'
import type { Range, SplitPart, WalletAsset } from './wallet-assets'
import { chainFailureText } from './wallet-sync-status'

/**
 * « Actualiser » of a wallet account (#269): reads the chains (when the
 * server syncs wallets) then the prices, in one request; without sync, the
 * prices only.
 */
export function useWalletRefresh(accountId: string) {
  const queryClient = useQueryClient()
  const holdings = useQuery({ ...holdingsQuery(accountId), enabled: false })
  const sync = useWalletSync(accountId)
  const prices = useMutation({
    mutationFn: () => refreshPrices(accountId),
    onSuccess: async (result) => {
      queryClient.setQueryData(cryptoKeys.holdings(accountId), result)
      if (result.refreshFailed) {
        toast.error('Cours non actualisés : le service ne répond pas.')
      } else toast.success('Cours actualisés')
      await afterHoldingsChanged(queryClient)
    },
    onError: (error) => toast.error(holdingErrorMessage(error)),
  })
  const syncEnabled = holdings.data?.sync?.enabled ?? false
  return {
    refresh: () => (syncEnabled ? sync.mutate() : prices.mutate()),
    isPending: sync.isPending || prices.isPending,
    /** Nothing to refresh: no sync and no price service. */
    disabled:
      holdings.data !== undefined &&
      !syncEnabled &&
      !holdings.data.priceApiEnabled,
  }
}

/* ---------------------------------------------------------------------------
 * Holdings grouped by asset
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * Summary: value, change, freshness, split
 * ------------------------------------------------------------------------- */

const STATUS_LINE = 'flex items-start gap-1.5 text-sm'
const WARNING = 'text-warning-foreground dark:text-warning'

function StatusLine({
  icon,
  warning = false,
  children,
}: {
  icon: ReactNode
  warning?: boolean
  children: ReactNode
}) {
  return (
    <p className={cn(STATUS_LINE, warning ? WARNING : 'text-muted-foreground')}>
      <span aria-hidden className="mt-0.5 shrink-0 [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/**
 * How fresh the balances are, in one line (#294), then one line per thing
 * that went wrong: a chain not read with its retry time, prices not
 * refreshed, an asset without a price. Never an alert block.
 */
function WalletStatusLines({
  data,
  refreshing,
  now,
}: {
  data: AccountHoldingsDto
  refreshing: boolean
  now: Date
}) {
  const sync = data.sync
  const failed = syncFailed(data)
  const failures = failed && sync ? sync.failedChains : []
  const { totals } = data

  let freshness: ReactNode
  if (refreshing) {
    freshness = (
      <StatusLine icon={<LoaderCircleIcon className="animate-spin" />}>
        {!sync?.enabled
          ? 'Actualisation des cours…'
          : sync.syncedAt === null
            ? 'Premier scan de vos clés : il peut prendre quelques minutes.'
            : 'Lecture des chaînes…'}
      </StatusLine>
    )
  } else if (!sync?.enabled) {
    freshness = (
      <StatusLine icon={<TriangleAlertIcon />}>
        {sync?.syncedAt
          ? `Soldes lus ${formatPriceAge(sync.syncedAt, now)} · synchronisation désactivée`
          : 'Synchronisation désactivée sur ce serveur : les soldes ne sont pas lus sur la blockchain.'}
      </StatusLine>
    )
  } else if (sync.syncedAt === null) {
    freshness = (
      <StatusLine icon={<RefreshCwIcon />}>
        Jamais synchronisé : actualisez pour lire vos clés.
      </StatusLine>
    )
  } else {
    freshness = (
      <StatusLine
        icon={
          <CheckIcon className="text-success-foreground dark:text-success" />
        }
      >
        {`Soldes lus ${formatPriceAge(sync.syncedAt, now)}`}
      </StatusLine>
    )
  }

  return (
    <div className="space-y-0.5">
      {freshness}
      {failed && failures.length === 0 && (
        <StatusLine icon={<TriangleAlertIcon />} warning>
          La dernière synchronisation a échoué : soldes de la précédente.
        </StatusLine>
      )}
      {failures.length > 0 && (
        <ul aria-label="Chaînes non lues" className="space-y-0.5">
          {failures.map((failure) => (
            <li key={failure.chain}>
              <StatusLine icon={<TriangleAlertIcon />} warning>
                {chainFailureText(failure, now)}
              </StatusLine>
            </li>
          ))}
        </ul>
      )}
      {(data.refreshFailed || totals.staleCount > 0) && (
        <StatusLine icon={<TriangleAlertIcon />} warning>
          Cours non actualisés : les derniers connus sont utilisés.
        </StatusLine>
      )}
      {totals.missingPriceCount > 0 && (
        <StatusLine icon={<TriangleAlertIcon />} warning>
          {totals.missingPriceCount === 1
            ? 'Un actif sans cours connu : la valeur du compte n’est pas mise à jour.'
            : `${totals.missingPriceCount} actifs sans cours connu : la valeur du compte n’est pas mise à jour.`}
        </StatusLine>
      )}
    </div>
  )
}

/** The split by asset as one bar, with its legend. */
function SplitBar({
  parts,
  totalCents,
}: {
  parts: readonly SplitPart[]
  totalCents: number
}) {
  const summary = parts
    .map((part) => `${part.label} ${shareText(part.valueCents, totalCents)}`)
    .join(', ')
  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label={`Répartition : ${summary}`}
        className="bg-muted flex h-3 overflow-hidden rounded-full"
      >
        {parts.map((part) => (
          <span
            key={part.key}
            className="border-card h-full border-r-2 last:border-r-0"
            style={{
              width: `${(part.valueCents / totalCents) * 100}%`,
              background: part.color,
            }}
          />
        ))}
      </div>
      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {parts.map((part) => (
          <li key={part.key} className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: part.color }}
            />
            {part.label}
            <span className="text-muted-foreground tabular-nums">
              {shareText(part.valueCents, totalCents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** « +643,53 € depuis le 19 oct. », toned. */
function ChangeLine({
  change,
  year,
}: {
  change: NonNullable<AccountPerformanceDto['sincePrevious']>
  year: string
}) {
  const { changeCents } = change
  return (
    <p className="text-sm tabular-nums">
      <span
        className={cn(
          changeCents > 0 && 'text-chart-delta-good',
          changeCents < 0 && 'text-chart-delta-bad',
        )}
      >
        {changeCents > 0 ? '+' : ''}
        {formatCents(changeCents)}
      </span>{' '}
      <span className="text-muted-foreground">
        depuis le {formatShortDay(change.fromDate, year)}
      </span>
    </p>
  )
}

/**
 * Top of a wallet account (#294): what it is worth (once on the page), its
 * change since the previous value, how fresh the balances are, and the
 * split by asset. « Actualiser » is the page action.
 */
function WalletSummary({
  data,
  assets,
  performance,
  refreshing,
  now,
  year,
}: {
  data: AccountHoldingsDto
  assets: readonly WalletAsset[]
  performance: AccountPerformanceDto
  refreshing: boolean
  now: Date
  year: string
}) {
  const id = useId()
  const nothingRead = data.holdings.length === 0 && !data.sync?.syncedAt
  const parts = splitParts(assets)
  const total = parts.reduce((sum, part) => sum + part.valueCents, 0)
  return (
    <Card role="region" aria-labelledby={id} className="min-w-0">
      <CardContent className="@container space-y-4 pt-5">
        <div className="space-y-1">
          <h2 id={id} className="text-muted-foreground text-sm">
            Valeur du wallet
          </h2>
          <p className="text-[clamp(1.5rem,12cqi,2.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
            {nothingRead ? '—' : formatCents(data.totals.valueCents)}
          </p>
          {!nothingRead && performance.sincePrevious && (
            <ChangeLine change={performance.sincePrevious} year={year} />
          )}
        </div>
        <WalletStatusLines data={data} refreshing={refreshing} now={now} />
        {parts.length > 1 && total > 0 && (
          <SplitBar parts={parts} totalCents={total} />
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Holdings
 * ------------------------------------------------------------------------- */

/** The symbol in a round badge, tinted with the asset's colour in the split. */
function AssetBadge({ symbol, color }: { symbol: string; color?: string }) {
  return (
    <span
      aria-hidden
      // 32px whatever the root size (the app's rem is 22px).
      // Left out on the narrowest cards (320px phones): the name comes first.
      className="bg-muted text-muted-foreground hidden size-[32px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold @[12rem]:flex"
      style={
        color
          ? {
              background: `color-mix(in oklab, ${color} 16%, transparent)`,
              color,
            }
          : undefined
      }
    >
      {symbol.slice(0, 4)}
    </span>
  )
}

/** Where a line is: its chain, or « Saisi à la main » for a manual line. */
function lineLocation(line: ValuedHoldingDto): string {
  return line.location || line.name
}

function priceText(line: ValuedHoldingDto, now: Date): string | null {
  if (line.priceEur === null || line.priceFetchedAt === null) return null
  return `1 ${line.symbol} = ${formatPrice(line.priceEur)} · ${
    line.priceSource === 'manual' ? 'cours manuel, ' : 'cours '
  }${formatPriceAge(line.priceFetchedAt, now)}`
}

function AssetRow({
  asset,
  color,
  totalCents,
  mixed,
  now,
  onDelete,
}: {
  asset: WalletAsset
  color?: string
  totalCents: number
  /** The wallet holds lines typed by hand beside the synced ones. */
  mixed: boolean
  now: Date
  /** Lines typed by hand can only be deleted (#269). */
  onDelete?: (line: ValuedHoldingDto) => void
}) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const several = asset.lines.length > 1
  const price = asset.priced ? priceText(asset.priced, now) : null
  const subtitle = [
    `${formatQuantity(asset.quantity)} ${asset.symbol}`,
    several
      ? plural(asset.lines.length, 'réseau', 'réseaux')
      : lineLocation(asset.lines[0]) !== asset.name
        ? lineLocation(asset.lines[0])
        : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const share =
    asset.valueCents !== null && totalCents > 0
      ? shareText(asset.valueCents, totalCents)
      : null
  const label = [
    asset.name,
    asset.valueCents === null ? 'sans cours' : formatCents(asset.valueCents),
    subtitle,
    share,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <li>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen(!open)}
        className={cn(
          'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2',
          open && 'bg-muted/40',
        )}
      >
        <AssetBadge symbol={asset.symbol} color={color} />
        {/* Name and value on one line, quantity and share on the next. */}
        <span className="block min-w-0 flex-1 space-y-0.5">
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate font-medium">
              {asset.name}
            </span>
            {asset.valueCents === null ? (
              <span className="text-muted-foreground shrink-0 text-xs">
                sans cours
              </span>
            ) : (
              <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
                {formatCents(asset.valueCents)}
              </span>
            )}
          </span>
          <span className="text-muted-foreground flex items-baseline gap-3 text-xs tabular-nums">
            <span className="min-w-0 flex-1">{subtitle}</span>
            {share && (
              <span className="shrink-0 whitespace-nowrap">{share}</span>
            )}
          </span>
        </span>
      </button>
      <div
        id={detailsId}
        hidden={!open}
        className="text-muted-foreground mb-2 space-y-1 px-2 text-xs @[12rem]:pl-[52px]"
      >
        <ul aria-label={`Lignes ${asset.symbol}`} className="space-y-1">
          {asset.lines.map((line) => (
            <li key={line.id} className="flex min-h-6 items-center gap-3">
              <span className="min-w-0 flex-1 tabular-nums">
                <span className="whitespace-nowrap">{lineLocation(line)}</span>
                {' · '}
                <span className="whitespace-nowrap">
                  {formatQuantity(line.quantity)} {line.symbol}
                </span>
                {mixed && (
                  <Badge variant="secondary" outline className="ml-1.5">
                    {line.origin === 'manual'
                      ? 'Saisi à la main'
                      : DERIVED_ORIGIN_LABELS[line.origin]}
                  </Badge>
                )}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums">
                {line.valueCents === null ? '—' : formatCents(line.valueCents)}
                {onDelete && line.origin === 'manual' && (
                  <Button
                    size="sm"
                    iconOnly
                    variant="secondary"
                    ghost
                    aria-label={`Supprimer ${line.symbol} · ${lineLocation(line)}`}
                    onClick={() => onDelete(line)}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {price && (
          <p className="flex flex-wrap items-center gap-1.5 tabular-nums">
            {price}
            {asset.priced?.priceStale && (
              <Badge variant="warning" outline>
                Non à jour
              </Badge>
            )}
          </p>
        )}
        {asset.valueCents === null && (
          <p>Jeton sans cours : il ne compte pas dans la valeur du wallet.</p>
        )}
      </div>
    </li>
  )
}

/** « cours il y a 3 min »: the oldest price shown, said once for the list. */
function pricesText(data: AccountHoldingsDto, now: Date): string | null {
  if (!data.priceApiEnabled) return 'cours saisis à la main'
  const fetched = data.holdings
    .map((holding) => holding.priceFetchedAt)
    .filter((at): at is string => at !== null)
    .sort()
  return fetched.length > 0 ? `cours ${formatPriceAge(fetched[0], now)}` : null
}

/**
 * The holdings by asset (#294): one row per asset, its chains and price
 * folded under it, the tokens without a price last. Lines typed by hand
 * before (#269) can only be deleted.
 */
function WalletHoldings({
  accountId,
  data,
  assets,
  writable,
  now,
}: {
  accountId: string
  data: AccountHoldingsDto
  assets: readonly WalletAsset[]
  writable: boolean
  now: Date
}) {
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState<ValuedHoldingDto>()
  const remove = useMutation({
    mutationFn: (holding: ValuedHoldingDto) =>
      removeHolding(accountId, holding.id),
    onSuccess: async (_, holding) => {
      toast.success(`${holding.symbol} supprimé`)
      setDeleting(undefined)
      await afterHoldingsChanged(queryClient)
    },
    onError: (error) => toast.error(holdingErrorMessage(error)),
  })

  const priced = assets.filter((asset) => asset.valueCents !== null)
  const unpriced = assets.filter((asset) => asset.valueCents === null)
  const total = priced.reduce((sum, asset) => sum + (asset.valueCents ?? 0), 0)
  const colors = new Map(
    splitParts(assets).map((part) => [part.key, part.color]),
  )
  const mixed =
    data.holdings.some((holding) => holding.origin !== 'manual') &&
    data.holdings.some((holding) => holding.origin === 'manual')
  const chains = new Set(data.holdings.map((holding) => holding.location))
  const status = [
    assets.length > 0 && plural(assets.length, 'actif'),
    chains.size > 1 && plural(chains.size, 'réseau', 'réseaux'),
    assets.length > 0 && pricesText(data, now),
  ]
    .filter(Boolean)
    .join(' · ')
  const rowProps = {
    totalCents: total,
    mixed,
    now,
    onDelete: writable ? setDeleting : undefined,
  }

  return (
    <Card role="region" aria-label="Avoirs crypto" className="min-w-0">
      <DashboardCardHeader title="Avoirs" status={status || undefined} />
      <CardContent className="@container space-y-4">
        {data.holdings.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={<CoinsIcon />}
            title={
              data.sync?.syncedAt ? 'Aucun solde trouvé' : 'Aucun avoir lu'
            }
            description={
              !data.sync?.enabled
                ? 'La synchronisation est désactivée sur ce serveur : les soldes de ce wallet ne peuvent pas être lus.'
                : data.sync.syncedAt
                  ? 'Les clés de ce wallet n’ont rien sur la blockchain : vérifiez le type d’adresses de chaque clé.'
                  : 'Actualisez pour lire les soldes de vos clés publiques sur la blockchain.'
            }
          />
        ) : (
          <>
            {priced.length > 0 && (
              <ul aria-label="Avoirs" className="space-y-0.5">
                {priced.map((asset) => (
                  <AssetRow
                    key={asset.assetId}
                    asset={asset}
                    color={colors.get(asset.assetId)}
                    {...rowProps}
                  />
                ))}
              </ul>
            )}
            {unpriced.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-muted-foreground px-2 text-sm font-medium">
                  Sans cours
                </h3>
                <ul aria-label="Avoirs sans cours" className="space-y-0.5">
                  {unpriced.map((asset) => (
                    <AssetRow key={asset.assetId} asset={asset} {...rowProps} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Supprimer ${deleting?.symbol ?? 'cet avoir'} ?`}
        description="Cette ligne a été saisie à la main : les avoirs d’un wallet sont lus sur la blockchain. Elle ne pourra pas être saisie à nouveau."
        confirmLabel="Supprimer"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Evolution
 * ------------------------------------------------------------------------- */

const chartConfig = {
  value: { label: 'Valeur', color: 'var(--chart-1)' },
} satisfies ChartConfig

/**
 * The wallet's value over time (one value per day it was valued), its
 * change over one year, and the values themselves, folded.
 */
function WalletHistory({
  performance,
  today,
  writable,
  onEditSnapshot,
}: {
  performance: AccountPerformanceDto
  today: string
  writable: boolean
  onEditSnapshot: (snapshot: SnapshotDto) => void
}) {
  const { snapshots, sinceOneYear } = performance
  const ranges = chartRanges(snapshots, today)
  const [chosen, setChosen] = useState<Range>('1y')
  const range: Range = ranges.includes(chosen)
    ? chosen
    : (ranges.find((r) => r !== 'all') ?? 'all')
  const [showValues, setShowValues] = useState(false)
  const valuesId = useId()
  const from =
    range === '6m'
      ? monthsBefore(today, 6)
      : range === '1y'
        ? monthsBefore(today, 12)
        : ''
  const shown = snapshots.filter((snapshot) => snapshot.date >= from)

  const status = sinceOneYear && (
    <>
      <span
        className={cn(
          'tabular-nums',
          sinceOneYear.changeCents > 0 && 'text-chart-delta-good',
          sinceOneYear.changeCents < 0 && 'text-chart-delta-bad',
        )}
      >
        {sinceOneYear.changeCents > 0 ? '+' : ''}
        {formatCents(sinceOneYear.changeCents)}
      </span>{' '}
      sur 1 an
      {sinceOneYear.changeRate !== null &&
        ` (${formatSignedPercent(sinceOneYear.changeRate)})`}
    </>
  )

  return (
    <Card role="region" aria-label="Évolution" className="min-w-0">
      <DashboardCardHeader title="Évolution" status={status || undefined} />
      <CardContent className="space-y-3">
        {snapshots.length < 2 ? (
          <EmptyState
            variant="inline"
            icon={<LineChartIcon />}
            title="Une seule valeur pour l’instant"
            description="La courbe apparaîtra dès la prochaine valorisation du wallet, un autre jour."
          />
        ) : (
          <>
            {ranges.length > 1 && (
              <SegmentedControl
                aria-label="Période"
                value={range}
                onValueChange={setChosen}
                fullWidth
              >
                {ranges.map((r) => (
                  <SegmentedControlItem key={r} value={r}>
                    {RANGE_LABELS[r]}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            )}
            <AreaChart
              data={shown.map((snapshot) => ({
                date: snapshot.date,
                value: snapshot.valueCents,
              }))}
              index="date"
              config={chartConfig}
              indexScale="time"
              tooltipIndexFormatter={formatCalendarDate}
              indexLabel="Date"
              label="Valeur du wallet"
              height={200}
            />
          </>
        )}
        <div>
          <button
            type="button"
            aria-expanded={showValues}
            aria-controls={valuesId}
            onClick={() => setShowValues(!showValues)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm outline-none focus-visible:ring-2"
          >
            {`Valeurs enregistrées (${snapshots.length})`}
            <ChevronDownIcon
              aria-hidden
              className={cn(
                'size-4 shrink-0 transition-transform',
                showValues && 'rotate-180',
              )}
            />
          </button>
          <ul
            id={valuesId}
            hidden={!showValues}
            aria-label="Valeurs enregistrées"
            className="space-y-0.5"
          >
            {[...snapshots].reverse().map((snapshot) => {
              const content = (
                <>
                  <span className="min-w-0 flex-1">
                    {formatCalendarDate(snapshot.date)}
                  </span>
                  <span className="font-medium whitespace-nowrap tabular-nums">
                    {formatCents(snapshot.valueCents)}
                  </span>
                </>
              )
              const row =
                'flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm'
              return (
                <li key={snapshot.id}>
                  {writable ? (
                    <button
                      type="button"
                      aria-label={`Modifier la valeur du ${formatCalendarDate(snapshot.date)}`}
                      onClick={() => onEditSnapshot(snapshot)}
                      className={cn(
                        row,
                        'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring outline-none focus-visible:ring-2',
                      )}
                    >
                      {content}
                      <PencilIcon
                        aria-hidden
                        className="text-muted-foreground size-4 shrink-0"
                      />
                    </button>
                  ) : (
                    <div className={row}>{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Keys and tokens: one screen each
 * ------------------------------------------------------------------------- */

/** « Bitcoin », « Adresse EVM », or the key's own label. */
function keyTitle(key: WalletKeyDto): string {
  return key.label ?? (key.family === 'bitcoin' ? 'Bitcoin' : 'Adresse EVM')
}

/** The chains a key is read on: « Ethereum, Arbitrum ». */
function keyChains(key: WalletKeyDto): string {
  return key.chains.map((chain) => CRYPTO_CHAIN_LABELS[chain]).join(', ')
}

/**
 * « zpub6rFR…GutZYs · 4 adresses utilisées »: what its last scan found, the
 * chains of an EVM address, else its address type (never « Bitcoin ·
 * Bitcoin »).
 */
function keySubtitle(key: WalletKeyDto): string {
  const found =
    keyScanText(key)?.text ??
    (key.family === 'evm' ? keyChains(key) : walletKeyTypeLabel(key))
  return [maskPublicKey(key.publicKey), found].filter(Boolean).join(' · ')
}

const sheetClass = (isMobile: boolean) =>
  isMobile
    ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
    : 'overflow-y-auto'

/** « Type d’adresses   Native SegWit (bc1q…) », one line of a key's screen. */
function KeyFact({
  label,
  children,
  warning = false,
}: {
  label: string
  children: ReactNode
  warning?: boolean
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b py-1.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'ml-auto inline-flex items-center gap-1 text-right',
          warning && 'text-warning-foreground dark:text-warning font-medium',
        )}
      >
        {children}
      </dd>
    </div>
  )
}

/**
 * One key's screen (#294, the owner's « Un écran par clé »): the key with
 * « Copier », its address type and « Changer » (an xpub), its chains, what
 * its last scan found, and « Retirer la clé » (not the last one).
 */
function WalletKeySheet({
  accountId,
  walletKey,
  removable,
  writable,
  onOpenChange,
  onChangeType,
}: {
  accountId: string
  /** The key shown; the sheet is closed without one. */
  walletKey: WalletKeyDto | undefined
  /** Not the wallet's only key. */
  removable: boolean
  writable: boolean
  onOpenChange: (open: boolean) => void
  onChangeType: (key: WalletKeyDto) => void
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState(false)
  // Kept while the sheet closes, so its content does not vanish mid-slide.
  const [shown, setShown] = useState(walletKey)
  useEffect(() => {
    if (walletKey) setShown(walletKey)
  }, [walletKey])

  const remove = useMutation({
    mutationFn: (key: WalletKeyDto) => removeWalletKey(accountId, key.id),
    onSuccess: async () => {
      toast.success('Clé retirée')
      setRemoving(false)
      onOpenChange(false)
      await queryClient.invalidateQueries({
        queryKey: cryptoKeys.walletKeys(accountId),
      })
    },
    onError: (error) => toast.error(keyErrorMessage(error)),
  })

  const copy = async (key: WalletKeyDto) => {
    try {
      await navigator.clipboard.writeText(key.publicKey)
      toast.success('Clé copiée')
    } catch {
      toast.error('Copie impossible sur cet appareil.')
    }
  }

  const key = walletKey ?? shown
  const scan = key ? keyScanText(key) : null
  const type = key ? walletKeyTypeLabel(key) : null
  return (
    <>
      <Sheet open={walletKey !== undefined} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={sheetClass(isMobile)}
        >
          <SheetHeader className="pb-0">
            <SheetTitle>{key ? keyTitle(key) : 'Clé publique'}</SheetTitle>
            <SheetDescription>
              Clé publique : elle permet de lire les soldes, jamais de dépenser.
            </SheetDescription>
          </SheetHeader>
          {key && (
            <div className="space-y-4 px-4 pb-6">
              <div className="bg-muted/50 flex items-center gap-2 rounded-lg py-1 pr-1 pl-3">
                <span
                  className="min-w-0 flex-1 truncate font-mono text-sm"
                  title={key.publicKey}
                >
                  {maskPublicKey(key.publicKey)}
                </span>
                <Button
                  size="sm"
                  ghost
                  variant="secondary"
                  iconStart={<CopyIcon />}
                  onClick={() => void copy(key)}
                >
                  Copier
                </Button>
              </div>
              <dl>
                {type && (
                  <KeyFact label="Type d’adresses">
                    {type}
                    {writable && key.format === 'xpub' && (
                      <Button
                        size="sm"
                        ghost
                        variant="primary"
                        aria-label="Changer le type d’adresses"
                        onClick={() => onChangeType(key)}
                      >
                        Changer
                      </Button>
                    )}
                  </KeyFact>
                )}
                <KeyFact label="Réseaux">{keyChains(key)}</KeyFact>
                {scan && (
                  <KeyFact label="Dernier scan" warning={scan.warning}>
                    {scan.text}
                  </KeyFact>
                )}
              </dl>
              {writable && removable && (
                <Button
                  className="w-full"
                  outline
                  variant="danger"
                  iconStart={<Trash2Icon />}
                  onClick={() => setRemoving(true)}
                >
                  Retirer la clé
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Retirer cette clé ?"
        description="Les avoirs lus avec elle ne seront plus synchronisés. Vous pourrez l’ajouter à nouveau."
        confirmLabel="Retirer"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => key && remove.mutate(key)}
      />
    </>
  )
}

/**
 * Keys and tokens are settings, not content (#294): one row per key (what
 * it found) and one for the tokens read, each opening its own screen, then
 * « Ajouter une clé ».
 */
function WalletSettings({
  account,
  writable,
  onTokensChanged,
}: {
  account: AccountDto
  writable: boolean
  onTokensChanged: () => void
}) {
  const keys = useQuery(walletKeysQuery(account.id))
  const tokens = useQuery(walletTokensQuery(account.id))
  const [openKeyId, setOpenKeyId] = useState<string>()
  const [typing, setTyping] = useState<WalletKeyDto>()
  const [tokensOpen, setTokensOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const isMobile = useIsMobile()
  const list = keys.data ?? []
  const evmChains = [
    ...new Set(
      list.filter((key) => key.family === 'evm').flatMap((key) => key.chains),
    ),
  ]
  const tokensText =
    tokens.data && tokens.data.length > 0
      ? tokens.data.map((token) => token.symbol).join(', ')
      : 'ETH, BNB et POL seulement'
  const rowClass = 'w-full text-left'

  return (
    <Card role="region" aria-label="Clés et jetons" className="min-w-0">
      <DashboardCardHeader
        title="Clés et jetons"
        status="Ce que le wallet lit sur la blockchain."
      />
      <CardContent className="space-y-3">
        {keys.isPending ? (
          <Skeleton className="h-12 w-full" aria-label="Chargement" />
        ) : (
          <ItemList>
            <ItemListGroup>
              {list.map((key) => (
                <ItemListRow
                  key={key.id}
                  asChild
                  icon={<KeyRoundIcon />}
                  iconClassName={
                    keyScanText(key)?.warning
                      ? 'bg-warning/15 text-warning-foreground dark:text-warning'
                      : undefined
                  }
                  title={keyTitle(key)}
                  subtitle={keySubtitle(key)}
                >
                  <button
                    type="button"
                    aria-label={`${keyTitle(key)} : ${keySubtitle(key)}`}
                    className={rowClass}
                    onClick={() => setOpenKeyId(key.id)}
                  />
                </ItemListRow>
              ))}
              {evmChains.length > 0 && (
                <ItemListRow
                  asChild
                  icon={<CoinsIcon />}
                  title="Jetons lus"
                  subtitle={tokensText}
                >
                  <button
                    type="button"
                    aria-label={`Jetons lus : ${tokensText}`}
                    className={rowClass}
                    onClick={() => setTokensOpen(true)}
                  />
                </ItemListRow>
              )}
            </ItemListGroup>
          </ItemList>
        )}
        {writable && (
          <Button
            className="w-full"
            outline
            variant="secondary"
            iconStart={<PlusIcon />}
            onClick={() => setAdding(true)}
          >
            Ajouter une clé
          </Button>
        )}
      </CardContent>

      <WalletKeySheet
        accountId={account.id}
        walletKey={list.find((key) => key.id === openKeyId)}
        removable={list.length > 1}
        writable={writable}
        onOpenChange={(open) => !open && setOpenKeyId(undefined)}
        onChangeType={(key) => {
          setOpenKeyId(undefined)
          setTyping(key)
        }}
      />
      <Sheet open={tokensOpen} onOpenChange={setTokensOpen}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={sheetClass(isMobile)}
        >
          <SheetHeader className="pb-0">
            <SheetTitle>Jetons lus</SheetTitle>
            <SheetDescription>
              Les jetons ERC-20 / BEP-20 lus sur les adresses du wallet.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <WalletTokenList
              accountId={account.id}
              writable={writable}
              chains={evmChains}
              onChanged={onTokensChanged}
            />
          </div>
        </SheetContent>
      </Sheet>
      {writable && (
        <>
          <AddWalletKeySheet
            open={adding}
            onOpenChange={setAdding}
            accountId={account.id}
            provider={account.institution ?? undefined}
          />
          <WalletKeyTypeSheet
            accountId={account.id}
            walletKey={typing}
            onOpenChange={(open) => !open && setTyping(undefined)}
          />
        </>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Page body
 * ------------------------------------------------------------------------- */

/**
 * A wallet account's page body (#269, reworked in #294, the owner's « A.
 * Par actif »): what it holds first (value, change, freshness and the split
 * by asset), the holdings by asset, the evolution, then the keys and tokens
 * as settings. One column at every width, read top to bottom.
 */
export function WalletAccount({
  account,
  performance,
  writable,
  today,
  refreshing,
  onTokensChanged,
  onEditSnapshot,
}: {
  account: AccountDto
  performance: AccountPerformanceDto
  writable: boolean
  today: string
  /** « Actualiser » is running. */
  refreshing: boolean
  /** A token added or removed: read it at once (« Actualiser »). */
  onTokensChanged: () => void
  onEditSnapshot: (snapshot: SnapshotDto) => void
}) {
  const queryClient = useQueryClient()
  const holdings = useQuery(holdingsQuery(account.id))
  const now = new Date()

  // A valuation wrote today's snapshot: balance, chart and net worth follow.
  const written = holdings.data?.snapshot
  useEffect(() => {
    if (written) void afterSnapshotsChanged(queryClient)
  }, [written, holdings.dataUpdatedAt, queryClient])

  if (holdings.isPending) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Chargement">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }
  if (holdings.isError) {
    return (
      <EmptyState
        icon={<TriangleAlertIcon />}
        title="Impossible de charger les avoirs."
        description="Le serveur n’a pas répondu."
        actions={
          <Button outline onClick={() => void holdings.refetch()}>
            Réessayer
          </Button>
        }
      />
    )
  }
  const data = holdings.data
  const assets = groupHoldings(data.holdings)
  const year = today.slice(0, 4)

  return (
    <>
      <WalletSummary
        data={data}
        assets={assets}
        performance={performance}
        refreshing={refreshing}
        now={now}
        year={year}
      />
      <WalletHoldings
        accountId={account.id}
        data={data}
        assets={assets}
        writable={writable}
        now={now}
      />
      {performance.snapshots.length > 0 && (
        <WalletHistory
          performance={performance}
          today={today}
          writable={writable}
          onEditSnapshot={onEditSnapshot}
        />
      )}
      <WalletSettings
        account={account}
        writable={writable}
        onTokensChanged={onTokensChanged}
      />
    </>
  )
}
