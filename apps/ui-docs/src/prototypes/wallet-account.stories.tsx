import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  AreaChart,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  ItemList,
  ItemListGroup,
  ItemListRow,
  SegmentedControl,
  SegmentedControlItem,
} from '@finances/ui'
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CoinsIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  PencilIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

/**
 * Prototypes of the wallet account page rework (#294): two directions shown
 * to the owner before one is built in `apps/web`. Clickable mockups with
 * synthetic data (a Ledger with a Bitcoin key and an EVM address read on
 * Ethereum and Arbitrum), not app code: the buttons do nothing.
 *
 * The chips at the top switch the sync state: up to date, a chain not read
 * (its retry time), « Actualiser » running, a first scan, sync off.
 *
 * Audit of the page before (390px):
 * - the value has no label and no change; the status is a long sentence;
 * - holdings are one row per asset and chain, alphabetical (ETH twice,
 *   the token without a price in the middle), four lines each, the price
 *   age repeated on every row; nothing says what weighs most;
 * - « Clés et jetons » (trash icons, explanations) sits between the
 *   holdings and the history, as content;
 * - « Sur 1 an » is a lone tile repeated by its note; the chart says
 *   « Soldes de relevés » (a wallet has no statements); 14 editable values
 *   close the page, each on two lines.
 *
 * A. Par actif : what I own first: the value, its change and the split by
 *    asset in one card, then one row per asset (its networks folded under
 *    it, tokens without a price last), the evolution, and the keys and
 *    tokens as settings rows at the end.
 * B. Par réseau : one card per network (Bitcoin, Ethereum, Arbitrum) with
 *    its key, its total, its holdings and its failure; no split by asset.
 */
const meta: Meta = {
  title: 'Prototypes/Wallet account (#294)',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile' },
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------- */

type SyncState = 'fresh' | 'failed' | 'refreshing' | 'first' | 'off'

const SYNC_STATES: { value: SyncState; label: string }[] = [
  { value: 'fresh', label: 'À jour' },
  { value: 'failed', label: 'Chaîne en échec' },
  { value: 'refreshing', label: 'Actualisation' },
  { value: 'first', label: 'Premier scan' },
  { value: 'off', label: 'Synchro désactivée' },
]

interface Line {
  network: string
  quantity: string
  value: number | null
}

interface Asset {
  symbol: string
  name: string
  price: string | null
  lines: Line[]
}

const ASSETS: Asset[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    price: '82 500,00 €',
    lines: [{ network: 'Bitcoin', quantity: '0,052', value: 429000 }],
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    price: '2 950,00 €',
    lines: [
      { network: 'Ethereum', quantity: '0,9', value: 265500 },
      { network: 'Arbitrum', quantity: '0,15', value: 44250 },
    ],
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    price: '0,93 €',
    lines: [{ network: 'Arbitrum', quantity: '412,5', value: 38362 }],
  },
  {
    symbol: 'DEMO',
    name: 'Demo Token',
    price: null,
    lines: [{ network: 'Arbitrum', quantity: '15 000', value: null }],
  },
]

const TOTAL = 777112

const HISTORY = Array.from({ length: 13 }, (_, i) => {
  const date = new Date(Date.UTC(2025, 10 + i, 19))
  return {
    date: date.toISOString().slice(0, 10),
    value: Math.round(620000 + 90000 * Math.sin(i / 1.6) + i * 800),
  }
})

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const fmt = (cents: number) => euros.format(cents / 100)
const assetValue = (asset: Asset) =>
  asset.lines.reduce((sum, line) => sum + (line.value ?? 0), 0)
const assetQuantity = (asset: Asset) =>
  asset.symbol === 'ETH' ? '1,05' : asset.lines[0].quantity

/** One colour per priced asset, by weight. */
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)']

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

function Chips({
  value,
  onChange,
}: {
  value: SyncState
  onChange: (value: SyncState) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 px-4 pt-4">
      {SYNC_STATES.map((state) => (
        <button
          key={state.value}
          type="button"
          onClick={() => onChange(state.value)}
          className={cn(
            'min-h-11 rounded-full border px-3 text-sm',
            value === state.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card',
          )}
        >
          {state.label}
        </button>
      ))}
    </div>
  )
}

function Header({ sync }: { sync: SyncState }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" /> Comptes
      </p>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">Ledger démo</h1>
          <p className="text-muted-foreground text-sm">Ledger</p>
        </div>
        <Button
          iconOnly
          aria-label="Actualiser"
          loading={sync === 'refreshing' || sync === 'first'}
          disabled={sync === 'off'}
        >
          <RefreshCwIcon />
        </Button>
      </div>
    </div>
  )
}

/** One line per status, never an alert block. */
function StatusLines({ sync }: { sync: SyncState }) {
  const line = 'flex items-start gap-1.5 text-sm'
  const warn = 'text-warning-foreground dark:text-warning'
  if (sync === 'refreshing') {
    return (
      <p className={cn(line, 'text-muted-foreground')}>
        <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin" />
        Lecture des chaînes…
      </p>
    )
  }
  if (sync === 'first') {
    return (
      <p className={cn(line, 'text-muted-foreground')}>
        <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin" />
        Premier scan de la clé Bitcoin : il peut prendre quelques minutes.
      </p>
    )
  }
  if (sync === 'off') {
    return (
      <p className={cn(line, 'text-muted-foreground')}>
        Soldes lus il y a 2 j · synchronisation désactivée sur ce serveur
      </p>
    )
  }
  return (
    <div className="space-y-0.5">
      <p className={cn(line, 'text-muted-foreground')}>
        <CheckIcon className="text-success-foreground dark:text-success mt-0.5 size-4 shrink-0" />
        {sync === 'failed'
          ? 'Bitcoin et Ethereum lus il y a 6 min'
          : 'Soldes lus il y a 6 min · cours il y a 3 min'}
      </p>
      {sync === 'failed' && (
        <p className={cn(line, warn)}>
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          Arbitrum non lu (trop de requêtes) : soldes d’il y a 2 j, nouvel essai
          possible à 10:31
        </p>
      )}
    </div>
  )
}

function Summary({ sync, split }: { sync: SyncState; split: boolean }) {
  const priced = ASSETS.filter((asset) => asset.price !== null)
  return (
    <Card>
      <CardContent className="@container space-y-4 pt-5">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">Valeur</p>
          <p className="text-[clamp(1.5rem,12cqi,2.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
            {sync === 'first' ? '—' : fmt(TOTAL)}
          </p>
          {sync !== 'first' && (
            <p className="text-chart-delta-good text-sm tabular-nums">
              +643,53 €{' '}
              <span className="text-muted-foreground">depuis le 19 oct.</span>
            </p>
          )}
        </div>
        <StatusLines sync={sync} />
        {split && sync !== 'first' && (
          <div className="space-y-2">
            <div
              className="bg-muted flex h-3 overflow-hidden rounded-full"
              role="img"
              aria-label="Répartition : Bitcoin 55 %, Ethereum 40 %, USD Coin 5 %"
            >
              {priced.map((asset, i) => (
                <span
                  key={asset.symbol}
                  style={{
                    width: `${(assetValue(asset) / TOTAL) * 100}%`,
                    background: COLORS[i],
                  }}
                  className="border-card h-full border-r-2 last:border-r-0"
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {priced.map((asset, i) => (
                <li
                  key={asset.symbol}
                  className="inline-flex items-center gap-1.5"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: COLORS[i] }}
                  />
                  {asset.symbol}
                  <span className="text-muted-foreground tabular-nums">
                    {Math.round((assetValue(asset) / TOTAL) * 100)} %
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AssetBadge({ symbol, color }: { symbol: string; color?: string }) {
  return (
    <span
      aria-hidden
      className="bg-muted text-muted-foreground flex size-[32px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
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

function Evolution() {
  const [range, setRange] = useState('1y')
  return (
    <Card>
      <CardHeader>
        <CardTitle>Évolution</CardTitle>
        <p className="text-muted-foreground mt-0.5 text-sm">
          <span className="text-chart-delta-good tabular-nums">+772 €</span> sur
          1 an (+11 %)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <SegmentedControl value={range} onValueChange={setRange} fullWidth>
          <SegmentedControlItem value="6m">6 mois</SegmentedControlItem>
          <SegmentedControlItem value="1y">1 an</SegmentedControlItem>
          <SegmentedControlItem value="all">Tout</SegmentedControlItem>
        </SegmentedControl>
        <AreaChart
          data={HISTORY}
          index="date"
          indexScale="time"
          config={{ value: { label: 'Valeur', color: 'var(--chart-1)' } }}
          label="Valeur du wallet"
          height={200}
        />
        <button
          type="button"
          className="text-muted-foreground flex min-h-11 w-full items-center justify-between text-sm"
        >
          Valeurs enregistrées (14)
          <ChevronDownIcon className="size-4" />
        </button>
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * A. Par actif
 * ------------------------------------------------------------------------- */

function AssetRow({ asset, color }: { asset: Asset; color?: string }) {
  const [open, setOpen] = useState(false)
  const several = asset.lines.length > 1
  const value = assetValue(asset)
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="hover:bg-muted/60 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm"
      >
        <AssetBadge symbol={asset.symbol} color={color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{asset.name}</span>
          <span className="text-muted-foreground block truncate text-xs tabular-nums">
            {assetQuantity(asset)} {asset.symbol} ·{' '}
            {several
              ? `${asset.lines.length} réseaux`
              : asset.price
                ? asset.price
                : asset.lines[0].network}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-medium whitespace-nowrap tabular-nums">
            {asset.price ? fmt(value) : 'sans cours'}
          </span>
          {asset.price && (
            <span className="text-muted-foreground block text-xs tabular-nums">
              {Math.round((value / TOTAL) * 100)} %
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="text-muted-foreground mb-2 ml-[52px] space-y-1 pr-8 text-xs">
          {asset.lines.map((line) => (
            <p
              key={line.network}
              className="flex justify-between gap-3 tabular-nums"
            >
              <span>
                {line.network} · {line.quantity} {asset.symbol}
              </span>
              <span>{line.value === null ? '—' : fmt(line.value)}</span>
            </p>
          ))}
          {asset.price && (
            <p>
              1 {asset.symbol} = {asset.price} · cours il y a 3 min
            </p>
          )}
        </div>
      )}
    </li>
  )
}

function KeysCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clés et jetons</CardTitle>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Ce que le wallet lit sur la blockchain.
        </p>
      </CardHeader>
      <CardContent>
        <ItemList>
          <ItemListGroup>
            <ItemListRow
              href="#"
              icon={<KeyRoundIcon />}
              title="Bitcoin"
              subtitle="zpub6rFR…GutZYs · 4 adresses utilisées"
            />
            <ItemListRow
              href="#"
              icon={<KeyRoundIcon />}
              title="Ethereum"
              subtitle="0x000000…00dEaD · Ethereum, Arbitrum"
            />
            <ItemListRow
              href="#"
              icon={<CoinsIcon />}
              title="Jetons lus"
              subtitle="USDC, DEMO"
            />
          </ItemListGroup>
        </ItemList>
      </CardContent>
    </Card>
  )
}

function DirectionA() {
  const [sync, setSync] = useState<SyncState>('fresh')
  const priced = ASSETS.filter((asset) => asset.price !== null)
  const unpriced = ASSETS.filter((asset) => asset.price === null)
  return (
    <Page>
      <Chips value={sync} onChange={setSync} />
      <div className="@container space-y-6 p-4">
        <Header sync={sync} />
        <Summary sync={sync} split />
        <Card>
          <CardHeader>
            <CardTitle>Avoirs</CardTitle>
            <p className="text-muted-foreground mt-0.5 text-sm">
              4 actifs sur 3 réseaux · cours il y a 3 min
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-0.5">
              {priced.map((asset, i) => (
                <AssetRow key={asset.symbol} asset={asset} color={COLORS[i]} />
              ))}
            </ul>
            <section className="space-y-1">
              <h3 className="text-muted-foreground px-2 text-sm font-medium">
                Sans cours
              </h3>
              <ul className="space-y-0.5">
                {unpriced.map((asset) => (
                  <AssetRow key={asset.symbol} asset={asset} />
                ))}
              </ul>
            </section>
          </CardContent>
        </Card>
        <Evolution />
        <KeysCard />
      </div>
    </Page>
  )
}

/* ---------------------------------------------------------------------------
 * B. Par réseau
 * ------------------------------------------------------------------------- */

const NETWORKS: {
  name: string
  key: string
  keyNote: string
  failed?: string
}[] = [
  {
    name: 'Bitcoin',
    key: 'zpub6rFR…GutZYs',
    keyNote: 'Native SegWit · 4 adresses utilisées',
  },
  { name: 'Ethereum', key: '0x000000…00dEaD', keyNote: 'Adresse EVM' },
  {
    name: 'Arbitrum',
    key: '0x000000…00dEaD',
    keyNote: 'Adresse EVM',
    failed:
      'Non lu (trop de requêtes) : soldes d’il y a 2 j, nouvel essai à 10:31',
  },
]

function NetworkCard({
  network,
  sync,
}: {
  network: (typeof NETWORKS)[number]
  sync: SyncState
}) {
  const lines = ASSETS.flatMap((asset) =>
    asset.lines
      .filter((line) => line.network === network.name)
      .map((line) => ({ asset, line })),
  )
  const total = lines.reduce((sum, { line }) => sum + (line.value ?? 0), 0)
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle>{network.name}</CardTitle>
          <p className="text-muted-foreground mt-0.5 truncate font-mono text-xs">
            {network.key}
          </p>
          <p className="text-muted-foreground text-xs">{network.keyNote}</p>
        </div>
        <p className="font-semibold whitespace-nowrap tabular-nums">
          {fmt(total)}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {sync === 'failed' && network.failed && (
          <p className="text-warning-foreground dark:text-warning flex items-start gap-1.5 text-sm">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            {network.failed}
          </p>
        )}
        <ul className="divide-y">
          {lines.map(({ asset, line }) => (
            <li
              key={asset.symbol}
              className="flex min-h-11 items-center gap-3 py-1.5 text-sm"
            >
              <AssetBadge symbol={asset.symbol} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{asset.symbol}</span>
                <span className="text-muted-foreground block text-xs tabular-nums">
                  {line.quantity} · {asset.price ?? 'sans cours'}
                </span>
              </span>
              <span className="font-medium whitespace-nowrap tabular-nums">
                {line.value === null ? '—' : fmt(line.value)}
              </span>
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          outline
          variant="secondary"
          iconStart={<PencilIcon />}
        >
          Gérer la clé
        </Button>
      </CardContent>
    </Card>
  )
}

function DirectionB() {
  const [sync, setSync] = useState<SyncState>('fresh')
  return (
    <Page>
      <Chips value={sync} onChange={setSync} />
      <div className="@container space-y-6 p-4">
        <Header sync={sync} />
        <Summary sync={sync} split={false} />
        {NETWORKS.map((network) => (
          <NetworkCard key={network.name} network={network} sync={sync} />
        ))}
        <Card>
          <CardContent className="space-y-2 pt-5">
            <Button className="w-full" outline variant="secondary">
              Ajouter une clé
            </Button>
            <Button className="w-full" outline variant="secondary">
              Jetons lus (USDC, DEMO)
            </Button>
          </CardContent>
        </Card>
        <Evolution />
      </div>
    </Page>
  )
}

function Page({ children }: { children: ReactNode }) {
  return <div className="bg-background min-h-svh">{children}</div>
}

export const ParActif: StoryObj = {
  name: 'A. Par actif',
  render: () => <DirectionA />,
}

export const ParReseau: StoryObj = {
  name: 'B. Par réseau',
  render: () => <DirectionB />,
}
