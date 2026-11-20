import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import {
  AreaChart,
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  ConfirmDialog,
  EmptyState,
  ItemList,
  ItemListGroup,
  ItemListRow,
  SegmentedControl,
  SegmentedControlItem,
  Sheet,
  SheetContent,
  Skeleton,
  useIsMobile,
} from '@finances/ui'
import type { ChartConfig } from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckIcon,
  CoinsIcon,
  CopyIcon,
  KeyRoundIcon,
  LineChartIcon,
  LoaderCircleIcon,
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
  ValuedHoldingDto,
  WalletKeyDto,
} from '#/api/types.gen'
import { InvestmentSummary } from '#/components/accounts/InvestmentSummary'
import { MovementsCard } from '#/components/accounts/Movements'
import { accountKeys } from '#/components/accounts/queries'
import { historyPoints } from '#/components/accounts/history'
import { DashboardCardHeader } from '#/components/dashboard/DashboardCardHeader'
import { formatCalendarDate, formatCents } from '#/lib/money'
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
import { AssetBadge } from './AssetBadge'
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
import { pricesSettling, staleShown, useLiveRefresh } from './live-refresh'
import { RowsCardSkeleton, ValueCardSkeleton } from './skeletons'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_SCREEN,
  SheetScroll,
} from '#/components/sheets/form-sheet'

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

export function StatusLine({
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
  live,
  now,
}: {
  data: AccountHoldingsDto
  /** « Actualiser » is running. */
  refreshing: boolean
  /** The live step after the stored values is running (#381). */
  live: boolean
  now: Date
}) {
  const sync = data.sync
  const failed = syncFailed(data)
  const failures = failed && sync ? sync.failedChains : []
  const { totals } = data
  // A sync the live step left running in the background (#381).
  const syncing = sync?.syncing ?? false
  const busy = refreshing || live || syncing

  let freshness: ReactNode
  if (busy) {
    // In place of the freshness line: the same height, nothing jumps.
    freshness = (
      <StatusLine icon={<LoaderCircleIcon className="animate-spin" />}>
        {!sync?.enabled || (live && !refreshing && !syncing)
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
      {staleShown(data, busy) && (
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
export function SplitBar({
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

/* ---------------------------------------------------------------------------
 * Holdings
 * ------------------------------------------------------------------------- */

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
  settling,
  now,
  onDelete,
}: {
  asset: WalletAsset
  color?: string
  totalCents: number
  /** The wallet holds lines typed by hand beside the synced ones. */
  mixed: boolean
  /** The live step is due or running: a stale price is not news yet. */
  settling: boolean
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
            {asset.priced?.priceStale && !settling && (
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
  settling,
  now,
}: {
  accountId: string
  data: AccountHoldingsDto
  assets: readonly WalletAsset[]
  writable: boolean
  settling: boolean
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
  const parts = splitParts(assets)
  const partsTotal = parts.reduce((sum, part) => sum + part.valueCents, 0)
  const colors = new Map(parts.map((part) => [part.key, part.color]))
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
    settling,
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
            {parts.length > 1 && partsTotal > 0 && (
              <SplitBar parts={parts} totalCents={partsTotal} />
            )}
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

const investedChartConfig = {
  ...chartConfig,
  contributions: { label: 'Investi', color: 'var(--chart-2)' },
} satisfies ChartConfig

/**
 * The wallet's value over time (#366): one value per day, written by the
 * daily close, then today's live value. Read only: a value comes from the
 * holdings and the prices, never typed.
 */
export function CryptoHistory({
  performance,
  today,
  label = 'Valeur du wallet',
}: {
  performance: AccountPerformanceDto
  today: string
  /** The chart's accessible name. */
  label?: string
}) {
  const snapshots = historyPoints(performance)
  const ranges = chartRanges(snapshots, today)
  const [chosen, setChosen] = useState<Range>('1y')
  const range: Range = ranges.includes(chosen)
    ? chosen
    : (ranges.find((r) => r !== 'all') ?? 'all')
  const from =
    range === '6m'
      ? monthsBefore(today, 6)
      : range === '1y'
        ? monthsBefore(today, 12)
        : ''
  const shown = snapshots.filter((snapshot) => snapshot.date >= from)
  // The coins' cost at each value (#296), from the linked movements.
  const invested = new Map(
    performance.contributionsHistory.map((point) => [
      point.date,
      point.contributionsCents,
    ]),
  )
  const withInvested =
    performance.contributionsCents !== null &&
    [...invested.values()].some((cents) => cents !== null)

  return (
    <Card role="region" aria-label="Évolution" className="min-w-0">
      <DashboardCardHeader title="Évolution" />
      <CardContent className="space-y-3">
        {snapshots.length < 2 ? (
          <EmptyState
            variant="inline"
            icon={<LineChartIcon />}
            title="Une seule valeur pour l’instant"
            description="Une valeur est enregistrée chaque nuit : la courbe apparaîtra dès demain."
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
                ...(withInvested && {
                  contributions: invested.get(snapshot.date) ?? null,
                }),
              }))}
              index="date"
              config={withInvested ? investedChartConfig : chartConfig}
              indexScale="time"
              tooltipIndexFormatter={formatCalendarDate}
              indexLabel="Date"
              label={label}
              height={200}
            />
          </>
        )}
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
  isMobile ? FORM_SHEET_SCREEN : 'overflow-y-auto'

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
          side={editorSide(isMobile)}
          className={sheetClass(isMobile)}
        >
          <EditorHeader
            title={<>{key ? keyTitle(key) : 'Clé publique'}</>}
            description={
              <>
                Clé publique : elle permet de lire les soldes, jamais de
                dépenser.
              </>
            }
            className="pb-0"
          />
          {key && (
            <SheetScroll className="space-y-4 px-4 pb-6">
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
            </SheetScroll>
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
  // In the page's « ⋮ » inside the shell (#386).
  const inMenu = useRegisterPageAction(
    writable
      ? {
          label: 'Ajouter une clé',
          icon: <KeyRoundIcon />,
          onSelect: () => setAdding(true),
        }
      : null,
  )
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
        {writable && !inMenu && (
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
          side={editorSide(isMobile)}
          className={sheetClass(isMobile)}
        >
          <EditorHeader
            title={<>Jetons lus</>}
            description={
              <>Les jetons ERC-20 / BEP-20 lus sur les adresses du wallet.</>
            }
            className="pb-0"
          />
          <SheetScroll className="px-4 pb-6">
            <WalletTokenList
              accountId={account.id}
              writable={writable}
              chains={evmChains}
              onChanged={onTokensChanged}
            />
          </SheetScroll>
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
  onEditInvested,
}: {
  account: AccountDto
  performance: AccountPerformanceDto
  writable: boolean
  today: string
  /** « Actualiser » is running. */
  refreshing: boolean
  /** A token added or removed: read it at once (« Actualiser »). */
  onTokensChanged: () => void
  /** Opens the invested amount's editor. */
  onEditInvested: () => void
}) {
  const queryClient = useQueryClient()
  // Stored balances and prices at once (#381), then the live step: the
  // chains when due, the prices older than the TTL, in place.
  const holdings = useQuery(holdingsQuery(account.id))
  const live = useLiveRefresh({
    target: account.id,
    queryKey: cryptoKeys.holdings(account.id),
    data: holdings.data,
    run: () => refreshPrices(account.id, 'auto'),
  })
  const now = new Date()

  // Fresh prices or balances: the summary and the curve's live point follow.
  useEffect(() => {
    if (holdings.dataUpdatedAt) {
      void queryClient.invalidateQueries({
        queryKey: accountKeys.performance(account.id),
      })
    }
  }, [account.id, holdings.dataUpdatedAt, queryClient])

  if (holdings.isPending) {
    return (
      <div
        className="space-y-6"
        role="status"
        aria-busy="true"
        aria-label="Chargement du wallet"
      >
        <ValueCardSkeleton label="Valeur du wallet" bar={false} />
        <RowsCardSkeleton title="Avoirs" rows={3} />
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
  const nothingRead = data.holdings.length === 0 && !data.sync?.syncedAt

  return (
    <>
      {/* The summary of every investment account (#360). */}
      <InvestmentSummary
        account={account}
        performance={performance}
        writable={writable}
        label="Valeur du wallet"
        valueCents={nothingRead ? null : data.totals.valueCents}
        status={
          <WalletStatusLines
            data={data}
            refreshing={refreshing}
            live={live}
            now={now}
          />
        }
        onEditInvested={onEditInvested}
      />
      <WalletHoldings
        accountId={account.id}
        data={data}
        assets={assets}
        writable={writable}
        settling={pricesSettling(data, live || refreshing)}
        now={now}
      />
      {/* Bank → exchange → Ledger, with the cost the coins left with (#296). */}
      <MovementsCard accountId={account.id} />
      {historyPoints(performance).length > 0 && (
        <CryptoHistory performance={performance} today={today} />
      )}
      <WalletSettings
        account={account}
        writable={writable}
        onTokensChanged={onTokensChanged}
      />
    </>
  )
}
