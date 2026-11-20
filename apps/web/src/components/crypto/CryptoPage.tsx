import { useInShell } from '#/components/app-shell/page-actions'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  EmptyState,
  formatSignedPercent,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CoinsIcon,
  FileUpIcon,
  LoaderCircleIcon,
  PencilIcon,
  PencilLineIcon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  WalletIcon,
} from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type {
  CryptoPortfolioDto,
  PortfolioAccountDto,
  PortfolioAssetDto,
} from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { DashboardCardHeader } from '#/components/dashboard/DashboardCardHeader'
import { InvestedBar, Tile } from '#/components/accounts/InvestmentSummary'
import { todayInParis } from '#/components/accounts/dates'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { ROUTES } from '#/lib/routes'
import { accountLinkSearch } from '#/components/accounts/account-origin'
import { AddCryptoSheet } from './AddCryptoSheet'
import { AssetBadge } from './AssetBadge'
import { assetColor } from './asset-colors'
import { coins } from './pending-text'
import { holdingErrorMessage } from './errors'
import { pricesSettling, staleShown, useLiveRefresh } from './live-refresh'
import { formatPrice, formatPriceAge, formatQuantity } from './format'
import {
  accountFreshness,
  changePercentText,
  deltaTone,
} from './portfolio-view'
import {
  afterHoldingsChanged,
  cryptoKeys,
  cryptoPortfolioQuery,
  refreshPortfolio,
} from './queries'
import { PortfolioSkeleton } from './skeletons'
import { shareText, splitParts } from './wallet-assets'
import { SplitBar, StatusLine } from './WalletAccount'

const SOURCE_ICONS = {
  exchange: <Building2Icon />,
  wallet: <WalletIcon />,
  manual: <PencilLineIcon />,
}

/** What happened on the day a narrow account row gives (owner, 20 Nov). */
const EVENT_ICONS = {
  export: <FileUpIcon />,
  read: <RefreshCwIcon />,
  edit: <PencilIcon />,
}

/** « +178,40 € », toned. */
function SignedCents({ cents }: { cents: number }) {
  return (
    <span className={cn('whitespace-nowrap tabular-nums', deltaTone(cents))}>
      {cents > 0 ? '+' : ''}
      {formatCents(cents)}
    </span>
  )
}

/** « hors 0,1 BTC sans coût connu » (#373), or the number of assets. */
function withoutCostText(
  unknown: readonly { symbol: string; quantity: string }[],
): string | null {
  if (unknown.length === 0) return null
  return unknown.length <= 2
    ? `hors ${unknown.map(coins).join(' et ')} sans coût connu`
    : `hors ${plural(unknown.length, 'actif')} au coût inconnu`
}

/**
 * How fresh the portfolio is, in one line, then one line per thing that went
 * wrong: a wallet not read, prices not refreshed, an asset without a price.
 */
function PortfolioStatus({
  data,
  refreshing,
  live,
  now,
}: {
  data: CryptoPortfolioDto
  /** « Actualiser » is running. */
  refreshing: boolean
  /** The live step after the stored values is running (#381). */
  live: boolean
  now: Date
}) {
  const failedWallets = data.accounts.filter(
    (account) => account.source === 'wallet' && account.sync?.failedAt,
  )
  const syncing = data.accounts.some((account) => account.sync?.syncing)
  const { totals } = data
  const busy = refreshing || live || syncing
  return (
    <div className="space-y-0.5">
      {busy ? (
        // In place of the freshness line: the same height, nothing jumps.
        <StatusLine icon={<LoaderCircleIcon className="animate-spin" />}>
          {refreshing &&
          data.walletSyncEnabled &&
          data.accounts.some((account) => account.source === 'wallet')
            ? 'Lecture des wallets et des cours…'
            : syncing && !live && !refreshing
              ? 'Lecture des wallets…'
              : 'Actualisation des cours…'}
        </StatusLine>
      ) : !data.priceApiEnabled ? (
        <StatusLine icon={<PencilLineIcon />}>
          Cours saisis à la main
        </StatusLine>
      ) : data.pricesAt ? (
        <StatusLine
          icon={
            <CheckIcon className="text-success-foreground dark:text-success" />
          }
        >
          {`Cours ${formatPriceAge(data.pricesAt, now)}`}
        </StatusLine>
      ) : null}
      {failedWallets.map((account) => (
        <StatusLine
          key={account.accountId}
          icon={<TriangleAlertIcon />}
          warning
        >
          {`${account.name} non lu : soldes de la lecture précédente.`}
        </StatusLine>
      ))}
      {staleShown(data, busy) && (
        <StatusLine icon={<TriangleAlertIcon />} warning>
          Cours non actualisés : les derniers connus sont utilisés.
        </StatusLine>
      )}
      {totals.missingPriceCount > 0 && (
        <StatusLine icon={<TriangleAlertIcon />} warning>
          {totals.missingPriceCount === 1
            ? 'Un actif sans cours connu : il ne compte pas dans le total.'
            : `${totals.missingPriceCount} actifs sans cours connu : ils ne comptent pas dans le total.`}
        </StatusLine>
      )}
    </div>
  )
}

/**
 * Top of the page (#295): what every crypto is worth together, how much it
 * moved over 24 hours, the invested amount and gain where the cost is
 * known, how fresh it is, and the split by asset.
 */
function PortfolioSummary({
  data,
  refreshing,
  live,
  now,
}: {
  data: CryptoPortfolioDto
  refreshing: boolean
  live: boolean
  now: Date
}) {
  const id = useId()
  const { totals } = data
  // The euros waiting on the exchanges are a part of the split, never of
  // « Investi » (the owner's « A. Comme un compte », #373): what the coins
  // cost, what they are worth, what they gained.
  const parts = [
    ...splitParts(data.assets),
    ...(totals.fiatCents > 0
      ? [
          {
            key: 'fiat',
            label: 'Euros',
            valueCents: totals.fiatCents,
            color: 'var(--chart-other)',
          },
        ]
      : []),
  ]
  const splitTotal = parts.reduce((sum, part) => sum + part.valueCents, 0)
  const without = withoutCostText(totals.unknown)
  const coinsInvested =
    totals.investedCents === null
      ? null
      : totals.investedCents - totals.fiatCents
  const gain = totals.gainCents
  const year = todayInParis(now).slice(0, 4)
  const realised = totals.realised.count > 0
  return (
    <Card role="region" aria-labelledby={id} className="min-w-0">
      <CardContent
        className="@container space-y-4 pt-5"
        aria-busy={refreshing || live}
      >
        <div className="space-y-1">
          <h2 id={id} className="text-muted-foreground text-sm">
            Valeur de vos cryptos
          </h2>
          <p className="text-[clamp(1.5rem,12cqi,2.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
            {formatCents(totals.valueCents)}
          </p>
          {totals.change24hCents !== null && (
            <p className="text-sm">
              <SignedCents cents={totals.change24hCents} />{' '}
              <span className="text-muted-foreground">sur 24 h</span>
            </p>
          )}
        </div>
        {coinsInvested !== null && coinsInvested > 0 && gain !== null ? (
          <div className="space-y-2">
            <InvestedBar
              valueCents={coinsInvested + gain}
              investedCents={coinsInvested}
            />
            <div className="grid grid-cols-2 gap-2">
              <Tile
                label="Résultat"
                cents={gain}
                rate={gain / coinsInvested}
                className={realised ? undefined : 'col-span-2'}
              />
              {realised && (
                <Tile
                  label="Réalisé"
                  cents={totals.realised.yearCents}
                  rate={null}
                  note={`en ${year}`}
                />
              )}
            </div>
            {without && (
              <p className="text-muted-foreground text-xs">
                {without[0].toUpperCase() + without.slice(1)} : à préciser sur
                la page du compte.
              </p>
            )}
          </div>
        ) : (
          data.assets.some((asset) => asset.valueCents !== null) && (
            <p className="text-muted-foreground text-sm">
              Le prix de revient de vos cryptos n’est pas encore connu :
              précisez d’où elles viennent sur la page de chaque compte.
            </p>
          )
        )}
        <PortfolioStatus
          data={data}
          refreshing={refreshing}
          live={live}
          now={now}
        />
        {parts.length > 1 && splitTotal > 0 && (
          <SplitBar parts={parts} totalCents={splitTotal} />
        )}
      </CardContent>
    </Card>
  )
}

/** A figure of an unfolded asset: its label, the figure, a note under it. */
function Fact({
  label,
  children,
  note,
  tone,
  className,
}: {
  label: string
  children: ReactNode
  note?: ReactNode
  tone?: string
  className?: string
}) {
  // A line on a phone (label left, figure right), a tile from 400px.
  return (
    <div
      className={cn(
        'bg-muted/50 flex min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2 @min-[400px]:block',
        className,
      )}
    >
      <p className="text-muted-foreground min-w-0 truncate">{label}</p>
      <div className="shrink-0 text-right @min-[400px]:text-left">
        <p
          className={cn(
            'text-sm font-semibold whitespace-nowrap tabular-nums',
            tone,
          )}
        >
          {children}
        </p>
        {note && (
          <p className="text-muted-foreground flex flex-wrap items-center justify-end tabular-nums @min-[400px]:justify-start">
            {note}
          </p>
        )}
      </div>
    </div>
  )
}

/** One asset across accounts; its accounts, price and cost fold under it. */
function AssetRow({
  asset,
  color,
  settling,
  now,
}: {
  asset: PortfolioAssetDto
  color?: string
  /** The live step is due or running: a stale price is not news yet. */
  settling: boolean
  now: Date
}) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const barColor = color ?? assetColor(asset.symbol) ?? 'var(--chart-other)'
  const where =
    asset.places.length > 1
      ? plural(asset.places.length, 'compte')
      : asset.places[0]?.name
  const subtitle = [`${formatQuantity(asset.quantity)} ${asset.symbol}`, where]
    .filter(Boolean)
    .join(' · ')
  const change = asset.change24hPercent
  const label = [
    asset.name,
    asset.valueCents === null ? 'sans cours' : formatCents(asset.valueCents),
    subtitle,
    change !== null && `${changePercentText(change)} sur 24 h`,
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
          'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 @min-[400px]:gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2',
          open && 'bg-muted/40',
        )}
      >
        <AssetBadge symbol={asset.symbol} color={color} />
        {/* The name and where it is on the left, the value and its change
            on the right, centred beside the chevron like the accounts of
            the dashboard. */}
        <span className="block min-w-0 flex-1 space-y-0.5">
          <span className="block truncate font-medium">{asset.name}</span>
          {/* Where it is only when the row has room: unfolded, it says. */}
          <span className="text-muted-foreground block text-xs break-normal tabular-nums">
            <span className="whitespace-nowrap">
              {formatQuantity(asset.quantity)} {asset.symbol}
            </span>
            {where && (
              <span className="hidden @min-[400px]:inline"> · {where}</span>
            )}
          </span>
        </span>
        <span className="shrink-0 space-y-0.5 text-right">
          {asset.valueCents === null ? (
            <span className="text-muted-foreground block text-xs">
              sans cours
            </span>
          ) : (
            <span className="block font-medium whitespace-nowrap tabular-nums">
              {formatCents(asset.valueCents)}
            </span>
          )}
          {change !== null && (
            <span
              className={cn(
                'block text-xs whitespace-nowrap tabular-nums',
                deltaTone(Number(change)),
              )}
            >
              {changePercentText(change)}
            </span>
          )}
        </span>
        {/* Says the row unfolds; turned over while it is open. */}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {/* Unfolded (owner, 20 Nov: « plus visuel »): each account as a bar
          of its share of the asset, then the price, what was invested and
          the result as tiles. */}
      <div
        id={detailsId}
        hidden={!open}
        className="mb-3 space-y-3 px-2 pt-1 text-xs @[12rem]:pl-[52px]"
      >
        <ul aria-label={`Où est ${asset.symbol}`} className="space-y-1">
          {asset.places.map((place) => {
            const share =
              asset.valueCents && place.valueCents !== null
                ? place.valueCents / asset.valueCents
                : null
            return (
              <li key={place.accountId}>
                <Link
                  to={ROUTES.account}
                  params={{ accountId: place.accountId }}
                  search={accountLinkSearch('crypto')}
                  className="hover:bg-muted/60 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2"
                >
                  <span className="block min-w-0 flex-1 space-y-1">
                    <span className="flex items-baseline gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {place.name}
                      </span>
                      <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
                        {place.valueCents === null
                          ? '—'
                          : formatCents(place.valueCents)}
                      </span>
                    </span>
                    {share !== null && asset.places.length > 1 && (
                      <span
                        aria-hidden
                        className="bg-muted block h-1.5 overflow-hidden rounded-full"
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(2, Math.round(share * 100))}%`,
                            background: barColor,
                          }}
                        />
                      </span>
                    )}
                    <span className="text-muted-foreground flex items-baseline gap-3 tabular-nums">
                      <span className="min-w-0 flex-1 whitespace-nowrap">
                        {formatQuantity(place.quantity)} {asset.symbol}
                      </span>
                      {share !== null && asset.places.length > 1 && (
                        <span className="shrink-0 whitespace-nowrap">
                          {shareText(place.valueCents!, asset.valueCents!)}
                          <span className="sr-only">
                            {' '}
                            de vos {asset.symbol}
                          </span>
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRightIcon
                    aria-hidden
                    className="text-muted-foreground size-4 shrink-0"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
        {asset.priceEur !== null && asset.priceFetchedAt !== null && (
          // One figure per line on a phone (amounts can be long), three
          // abreast once the row has room; what was invested first.
          <div className="grid grid-cols-1 gap-1.5 @min-[400px]:grid-cols-3 @min-[400px]:gap-2">
            {asset.investedCents !== null && asset.gainCents !== null ? (
              <>
                <Fact label="Investi">{formatCents(asset.investedCents)}</Fact>
                <Fact
                  label="Résultat"
                  tone={deltaTone(asset.gainCents)}
                  note={
                    asset.investedCents > 0 ? (
                      <span className={deltaTone(asset.gainCents)}>
                        {formatSignedPercent(
                          asset.gainCents / asset.investedCents,
                        )}
                      </span>
                    ) : undefined
                  }
                >
                  {asset.gainCents > 0 ? '+' : ''}
                  {formatCents(asset.gainCents)}
                </Fact>
              </>
            ) : (
              asset.valueCents !== null && (
                <p className="text-muted-foreground self-center @min-[400px]:col-span-2">
                  Coût inconnu : à préciser sur la page du compte.
                </p>
              )
            )}
            <Fact
              label="Cours"
              note={
                <>
                  {asset.priceSource === 'manual' ? 'manuel, ' : ''}
                  {formatPriceAge(asset.priceFetchedAt, now)}
                  {asset.priceStale && !settling && (
                    <Badge variant="warning" outline className="ml-1.5">
                      Non à jour
                    </Badge>
                  )}
                </>
              }
            >
              {formatPrice(asset.priceEur)}
            </Fact>
          </div>
        )}
        {asset.valueCents !== null &&
          asset.investedCents !== null &&
          /[1-9]/.test(asset.unknownQuantity) && (
            <p className="text-muted-foreground tabular-nums">
              Dont{' '}
              {coins({
                quantity: asset.unknownQuantity,
                symbol: asset.symbol,
              })}{' '}
              sans coût connu, hors résultat
            </p>
          )}
        {asset.valueCents === null && (
          <p className="text-muted-foreground">
            {asset.priceable
              ? 'Pas encore de cours : il ne compte pas dans le total.'
              : 'Jeton sans cours : il ne compte pas dans le total.'}
          </p>
        )}
      </div>
    </li>
  )
}

/** One row per asset across every account (#295), those without price last. */
function AssetsCard({
  data,
  settling,
  now,
}: {
  data: CryptoPortfolioDto
  settling: boolean
  now: Date
}) {
  const priced = data.assets.filter((asset) => asset.valueCents !== null)
  const unpriced = data.assets.filter((asset) => asset.valueCents === null)
  const colors = new Map(
    splitParts(data.assets).map((part) => [part.key, part.color]),
  )
  const held = data.accounts.filter((account) => account.holdingCount > 0)
  const status = [
    plural(data.assets.length, 'actif'),
    held.length > 1 && `sur ${plural(held.length, 'compte')}`,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Card role="region" aria-label="Actifs" className="min-w-0">
      <DashboardCardHeader title="Actifs" status={status} />
      <CardContent className="@container space-y-4">
        {priced.length > 0 && (
          <ul aria-label="Actifs" className="space-y-0.5">
            {priced.map((asset) => (
              <AssetRow
                key={asset.assetId}
                asset={asset}
                color={colors.get(asset.assetId)}
                settling={settling}
                now={now}
              />
            ))}
          </ul>
        )}
        {unpriced.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-muted-foreground px-2 text-sm font-medium">
              Sans cours
            </h3>
            <ul aria-label="Actifs sans cours" className="space-y-0.5">
              {unpriced.map((asset) => (
                <AssetRow
                  key={asset.assetId}
                  asset={asset}
                  settling={settling}
                  now={now}
                />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * One account: its name and value on one line, how fresh it is (and what
 * to do) on the next, at the card's full width so nothing is cut (#295).
 */
function AccountRow({
  account,
  now,
}: {
  account: PortfolioAccountDto
  now: Date
}) {
  const freshness = accountFreshness(account, now)
  return (
    <li>
      <Link
        to={ROUTES.account}
        params={{ accountId: account.accountId }}
        search={accountLinkSearch('crypto')}
        className="hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring flex min-h-11 items-center gap-2 @min-[400px]:gap-3 rounded-lg px-2 py-2 text-sm transition-colors outline-none focus-visible:ring-2"
      >
        <span
          aria-hidden
          // 32px whatever the root size; left out on the narrowest cards.
          className="bg-muted text-muted-foreground hidden size-[32px] shrink-0 items-center justify-center rounded-full @[12rem]:flex [&_svg]:size-[16px]"
        >
          {SOURCE_ICONS[account.source ?? 'manual']}
        </span>
        {/* The name and how it is fed on the left, the value (and what is
            wrong) on the right, centred beside the chevron. */}
        <span className="block min-w-0 flex-1 space-y-0.5">
          <span className="block truncate font-medium">{account.name}</span>
          {/* What happened as a small icon (owner, 20 Nov), then the full
              sentence when the row has room, only when on a phone. */}
          <span className="text-muted-foreground flex items-start gap-1 text-xs break-normal">
            <span
              aria-hidden
              className="flex h-[1.4em] shrink-0 items-center [&_svg]:size-[0.85em]"
            >
              {EVENT_ICONS[freshness.event]}
            </span>
            <span className="hidden @min-[400px]:inline">{freshness.text}</span>
            <span className="@min-[400px]:hidden">
              <span aria-hidden>{freshness.short}</span>
              <span className="sr-only">{freshness.text}</span>
            </span>
          </span>
        </span>
        <span className="shrink-0 space-y-0.5 text-right">
          <span className="block font-medium whitespace-nowrap tabular-nums">
            {account.holdingCount === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              formatCents(account.valueCents)
            )}
          </span>
          {freshness.warning && (
            <span className="text-warning-foreground dark:text-warning block text-xs whitespace-nowrap">
              {freshness.warning}
            </span>
          )}
        </span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </Link>
    </li>
  )
}

/**
 * « Où sont mes cryptos » (#295): the exchanges, wallets and manual accounts
 * as compact rows, how fresh each is, each opening its page.
 */
function AccountsCard({
  data,
  now,
  onAdd,
}: {
  data: CryptoPortfolioDto
  now: Date
  onAdd: () => void
}) {
  const inShell = useInShell()
  return (
    <Card role="region" aria-label="Où sont mes cryptos" className="min-w-0">
      <DashboardCardHeader title="Où sont mes cryptos" />
      <CardContent className="@container space-y-3">
        <ul aria-label="Comptes crypto" className="space-y-0.5">
          {data.accounts.map((account) => (
            <AccountRow key={account.accountId} account={account} now={now} />
          ))}
        </ul>
        {/* Inside the shell, « Ajouter des cryptos » of the page's « ⋮ »
            does it (#386). */}
        {!inShell && (
          <Button
            className="w-full"
            variant="secondary"
            outline
            iconStart={<PlusIcon />}
            onClick={onAdd}
          >
            Ajouter une plateforme ou un wallet
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Crypto (#295): the portfolio. What every crypto is worth together and how
 * it moved, the split by asset, one row per asset summed over every
 * exchange, wallet and manual account, then « Où sont mes cryptos ». One
 * « Actualiser » (the wallets' chains where the server reads them, then the
 * prices) and one « Ajouter » flow for every source.
 */
export function CryptoPage() {
  const queryClient = useQueryClient()
  // Stored values at once (#381; from the cache when coming back), then
  // the live step: due prices and wallet syncs, in place.
  const portfolio = useQuery(cryptoPortfolioQuery)
  const live = useLiveRefresh({
    target: 'portfolio',
    queryKey: cryptoKeys.portfolio,
    data: portfolio.data,
    run: () => refreshPortfolio('auto'),
  })
  const [adding, setAdding] = useState(false)
  const now = new Date()

  const refresh = useMutation({
    mutationFn: refreshPortfolio,
    onSuccess: async (result) => {
      queryClient.setQueryData(cryptoKeys.portfolio, result)
      const failedWallet = result.accounts.some(
        (account) => account.source === 'wallet' && account.sync?.failedAt,
      )
      if (result.refreshFailed) {
        toast.error('Cours non actualisés : le service ne répond pas.')
      } else if (failedWallet) {
        toast.error(
          'Un wallet n’a pas pu être lu : ses soldes précédents restent.',
        )
      } else toast.success('Cryptos actualisées')
      await afterHoldingsChanged(queryClient)
    },
    onError: (error) => toast.error(holdingErrorMessage(error)),
  })

  const data = portfolio.data
  const accounts = data?.accounts ?? []
  const canRefresh =
    data !== undefined &&
    (data.priceApiEnabled ||
      (data.walletSyncEnabled &&
        accounts.some((account) => account.source === 'wallet')))

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Crypto"
        description="Vos cryptos, toutes plateformes et wallets confondus."
        actions={
          // While the first answer comes, « Ajouter » is there already.
          data !== undefined && accounts.length === 0
            ? []
            : [
                ...(canRefresh
                  ? [
                      {
                        label: 'Actualiser',
                        icon: <RefreshCwIcon />,
                        loading: refresh.isPending,
                        onSelect: () => refresh.mutate(),
                      },
                    ]
                  : []),
                {
                  // Named in full: it is an item of the page's « ⋮ » (#386).
                  label: 'Ajouter des cryptos',
                  icon: <CoinsIcon />,
                  primary: true,
                  onSelect: () => setAdding(true),
                },
              ]
        }
      />

      {portfolio.isPending && <PortfolioSkeleton />}

      {portfolio.isError && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger vos cryptos.</AlertTitle>
          <AlertDescription>
            <Button size="sm" outline onClick={() => void portfolio.refetch()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {data && accounts.length === 0 && (
        <EmptyState
          variant="page"
          icon={<CoinsIcon />}
          title="Aucune crypto suivie"
          description="Ajoutez une plateforme, un wallet ou ce que vous détenez : sa valeur entre dans votre patrimoine."
          actions={
            <Button iconStart={<PlusIcon />} onClick={() => setAdding(true)}>
              Ajouter des cryptos
            </Button>
          }
        />
      )}

      {data && accounts.length > 0 && (
        <>
          {data.assets.length > 0 ? (
            <>
              <PortfolioSummary
                data={data}
                refreshing={refresh.isPending}
                live={live}
                now={now}
              />
              <AssetsCard
                data={data}
                settling={pricesSettling(data, live || refresh.isPending)}
                now={now}
              />
            </>
          ) : (
            <Card>
              <CardContent className="pt-5">
                <EmptyState
                  variant="inline"
                  icon={<CoinsIcon />}
                  title="Aucun avoir pour l’instant"
                  description="Importez l’export de la plateforme, actualisez le wallet ou saisissez ce que vous détenez, depuis la page du compte."
                />
              </CardContent>
            </Card>
          )}
          <AccountsCard data={data} now={now} onAdd={() => setAdding(true)} />
        </>
      )}

      {data && (
        <AddCryptoSheet
          open={adding}
          onOpenChange={setAdding}
          accounts={accounts}
          priceApiEnabled={data.priceApiEnabled}
        />
      )}
    </div>
  )
}
