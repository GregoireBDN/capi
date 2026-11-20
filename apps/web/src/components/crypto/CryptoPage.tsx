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
  Skeleton,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Building2Icon,
  CheckIcon,
  ChevronRightIcon,
  CoinsIcon,
  LoaderCircleIcon,
  PencilLineIcon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  WalletIcon,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type {
  CryptoPortfolioDto,
  PortfolioAccountDto,
  PortfolioAssetDto,
} from '#/api/types.gen'
import { afterSnapshotsChanged } from '#/components/accounts/queries'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { DashboardCardHeader } from '#/components/dashboard/DashboardCardHeader'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { ROUTES } from '#/lib/routes'
import { accountLinkSearch } from '#/components/accounts/account-origin'
import { AddCryptoSheet } from './AddCryptoSheet'
import { AssetBadge } from './AssetBadge'
import { holdingErrorMessage } from './errors'
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
import { shareText, splitParts } from './wallet-assets'
import { SplitBar, StatusLine } from './WalletAccount'

const SOURCE_ICONS = {
  exchange: <Building2Icon />,
  wallet: <WalletIcon />,
  manual: <PencilLineIcon />,
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

/** « hors SOL, ADA », « hors 4 actifs »: priced assets of unknown cost. */
function withoutCostText(symbols: readonly string[]): string | null {
  if (symbols.length === 0) return null
  return symbols.length <= 3
    ? `hors ${symbols.join(', ')}`
    : `hors ${plural(symbols.length, 'actif')}`
}

/**
 * How fresh the portfolio is, in one line, then one line per thing that went
 * wrong: a wallet not read, prices not refreshed, an asset without a price.
 */
function PortfolioStatus({
  data,
  refreshing,
  now,
}: {
  data: CryptoPortfolioDto
  refreshing: boolean
  now: Date
}) {
  const failedWallets = data.accounts.filter(
    (account) => account.source === 'wallet' && account.sync?.failedAt,
  )
  const { totals } = data
  return (
    <div className="space-y-0.5">
      {refreshing ? (
        <StatusLine icon={<LoaderCircleIcon className="animate-spin" />}>
          {data.walletSyncEnabled &&
          data.accounts.some((account) => account.source === 'wallet')
            ? 'Lecture des wallets et des cours…'
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
      {(data.refreshFailed || totals.staleCount > 0) && (
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
  now,
}: {
  data: CryptoPortfolioDto
  refreshing: boolean
  now: Date
}) {
  const id = useId()
  const { totals } = data
  const parts = splitParts(data.assets)
  const splitTotal = parts.reduce((sum, part) => sum + part.valueCents, 0)
  const without = withoutCostText(totals.withoutInvestedSymbols)
  return (
    <Card role="region" aria-labelledby={id} className="min-w-0">
      <CardContent className="@container space-y-4 pt-5">
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
          {totals.investedCents !== null && totals.gainCents !== null && (
            <p className="text-muted-foreground text-sm tabular-nums">
              Investi {formatCents(totals.investedCents)} ·{' '}
              <span className="whitespace-nowrap">plus-value</span>{' '}
              <SignedCents cents={totals.gainCents} />
              {without && ` (${without})`}
            </p>
          )}
        </div>
        <PortfolioStatus data={data} refreshing={refreshing} now={now} />
        {parts.length > 1 && splitTotal > 0 && (
          <SplitBar parts={parts} totalCents={splitTotal} />
        )}
      </CardContent>
    </Card>
  )
}

/** One asset across accounts; its accounts, price and cost fold under it. */
function AssetRow({
  asset,
  color,
  totalCents,
  now,
}: {
  asset: PortfolioAssetDto
  color?: string
  totalCents: number
  now: Date
}) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
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
          'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2',
          open && 'bg-muted/40',
        )}
      >
        <AssetBadge symbol={asset.symbol} color={color} />
        {/* Name and value on one line, quantity and change on the next. */}
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
            {change !== null && (
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap',
                  deltaTone(Number(change)),
                )}
              >
                {changePercentText(change)}
              </span>
            )}
          </span>
        </span>
      </button>
      <div
        id={detailsId}
        hidden={!open}
        className="text-muted-foreground mb-2 space-y-1 px-2 text-xs @[12rem]:pl-[52px]"
      >
        <ul aria-label={`Où est ${asset.symbol}`}>
          {asset.places.map((place) => (
            <li key={place.accountId}>
              <Link
                to={ROUTES.account}
                params={{ accountId: place.accountId }}
                search={accountLinkSearch('crypto')}
                className="hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-sm outline-none focus-visible:ring-2"
              >
                <span className="min-w-0 flex-1 tabular-nums">
                  <span className="text-foreground font-medium underline-offset-2 hover:underline">
                    {place.name}
                  </span>
                  {' · '}
                  <span className="whitespace-nowrap">
                    {formatQuantity(place.quantity)} {asset.symbol}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">
                  {place.valueCents === null
                    ? '—'
                    : formatCents(place.valueCents)}
                  {totalCents > 0 && place.valueCents !== null && (
                    <span className="sr-only">
                      , {shareText(place.valueCents, totalCents)} du total
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {asset.priceEur !== null && asset.priceFetchedAt !== null && (
          <p className="flex flex-wrap items-center gap-1.5 tabular-nums">
            {`1 ${asset.symbol} = ${formatPrice(asset.priceEur)} · ${
              asset.priceSource === 'manual' ? 'cours manuel, ' : 'cours '
            }${formatPriceAge(asset.priceFetchedAt, now)}`}
            {change !== null && ` · ${changePercentText(change)} sur 24 h`}
            {asset.priceStale && (
              <Badge variant="warning" outline>
                Non à jour
              </Badge>
            )}
          </p>
        )}
        {asset.valueCents !== null && (
          <p className="tabular-nums">
            {asset.investedCents === null || asset.gainCents === null ? (
              'Coût inconnu : pas de plus-value calculée.'
            ) : (
              <>
                Investi {formatCents(asset.investedCents)} ·{' '}
                <span className="whitespace-nowrap">plus-value</span>{' '}
                <SignedCents cents={asset.gainCents} />
              </>
            )}
          </p>
        )}
        {asset.valueCents === null && (
          <p>
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
function AssetsCard({ data, now }: { data: CryptoPortfolioDto; now: Date }) {
  const priced = data.assets.filter((asset) => asset.valueCents !== null)
  const unpriced = data.assets.filter((asset) => asset.valueCents === null)
  const total = priced.reduce((sum, asset) => sum + (asset.valueCents ?? 0), 0)
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
                totalCents={total}
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
                  totalCents={total}
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
        className="hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors outline-none focus-visible:ring-2"
      >
        <span
          aria-hidden
          // 32px whatever the root size; left out on the narrowest cards.
          className="bg-muted text-muted-foreground hidden size-[32px] shrink-0 items-center justify-center rounded-full @[12rem]:flex [&_svg]:size-[16px]"
        >
          {SOURCE_ICONS[account.source ?? 'manual']}
        </span>
        <span className="block min-w-0 flex-1 space-y-0.5">
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate font-medium">
              {account.name}
            </span>
            <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
              {account.holdingCount === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                formatCents(account.valueCents)
              )}
            </span>
          </span>
          <span className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 text-xs">
            <span className="min-w-0 flex-1">{freshness.text}</span>
            {freshness.warning && (
              <span className="text-warning-foreground dark:text-warning shrink-0 whitespace-nowrap">
                {freshness.warning}
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
  return (
    <Card role="region" aria-label="Où sont mes cryptos" className="min-w-0">
      <DashboardCardHeader title="Où sont mes cryptos" />
      <CardContent className="@container space-y-3">
        <ul aria-label="Comptes crypto" className="space-y-0.5">
          {data.accounts.map((account) => (
            <AccountRow key={account.accountId} account={account} now={now} />
          ))}
        </ul>
        <Button
          className="w-full"
          variant="secondary"
          outline
          iconStart={<PlusIcon />}
          onClick={onAdd}
        >
          Ajouter une plateforme ou un wallet
        </Button>
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
  const portfolio = useQuery(cryptoPortfolioQuery)
  const [adding, setAdding] = useState(false)
  const now = new Date()

  // A valuation wrote today's values: balances and net worth follow.
  const valued = portfolio.data?.valued
  useEffect(() => {
    if (valued) void afterSnapshotsChanged(queryClient)
  }, [valued, portfolio.dataUpdatedAt, queryClient])

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
          accounts.length === 0
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
                  label: 'Ajouter',
                  icon: <PlusIcon />,
                  primary: true,
                  onSelect: () => setAdding(true),
                },
              ]
        }
      />

      {portfolio.isPending && (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

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
                now={now}
              />
              <AssetsCard data={data} now={now} />
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
