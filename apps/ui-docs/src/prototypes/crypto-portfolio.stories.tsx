import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Input,
  ItemList,
  ItemListGroup,
  ItemListRow,
  SegmentedControl,
  SegmentedControlItem,
} from '@finances/ui'
import {
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileUpIcon,
  PencilLineIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  WalletIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

/**
 * Prototypes of the Crypto section as a portfolio (#295): the `/crypto` page
 * and the « Ajouter » flow, two directions each, shown to the owner before
 * one is built in `apps/web`. Clickable mockups with synthetic data (Bitcoin
 * and Ether held both on an exchange and on a Ledger, a token without a
 * price), not app code.
 *
 * Audit of the page before (390px):
 * - one card per account: BTC on Binance and BTC on the Ledger are two lines
 *   on two cards, with no total per asset and no allocation;
 * - three tiles (value, invested, gain) without the change of the day;
 * - five actions that do different things: « Ajouter un avoir », « Importer
 *   un export », « Relier à un wallet ou une plateforme », « Synchroniser »,
 *   « Actualiser les cours »;
 * - « Ajouter un avoir » asks for the account, the source, the provider, the
 *   keys and the holding on one long form.
 *
 * Portfolio
 * A. Actifs puis comptes : the value, its change of the day and the split by
 *    asset in one card; one row per asset summed over every account (tap:
 *    where it is held, its price, invested and gain); then « Où sont mes
 *    cryptos », the accounts as compact rows with their freshness.
 * B. Onglets : the same summary, then a segmented « Actifs | Comptes » that
 *    shows one list at a time.
 *
 * Add flow
 * A. Pas à pas : 1. « D’où viennent ces cryptos ? » (a tap moves on) → 2. the
 *    source's own step (the platform then its export, the wallet's keys, or
 *    the asset then the quantity) → 3. the summary and one button.
 * B. Une page : the source as a segmented control at the top, its fields
 *    under it, one button at the end.
 */
const meta: Meta = {
  title: 'Prototypes/Crypto portfolio (#295)',
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

interface Place {
  account: string
  quantity: string
  value: number | null
}

interface Asset {
  symbol: string
  name: string
  quantity: string
  price: string | null
  change: number | null
  value: number | null
  invested: number | null
  places: Place[]
}

const ASSETS: Asset[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    quantity: '0,0825',
    price: '82 500,00 €',
    change: 2.4,
    value: 680625,
    invested: 412000,
    places: [
      { account: 'Ledger', quantity: '0,06', value: 495000 },
      { account: 'Binance', quantity: '0,0225', value: 185625 },
    ],
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    quantity: '1,35',
    price: '2 950,00 €',
    change: -1.8,
    value: 398250,
    invested: 351000,
    places: [
      { account: 'Ledger', quantity: '1,05', value: 309750 },
      { account: 'Binance', quantity: '0,3', value: 88500 },
    ],
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    quantity: '12',
    price: '128,40 €',
    change: 5.1,
    value: 154080,
    invested: null,
    places: [{ account: 'Binance', quantity: '12', value: 154080 }],
  },
  {
    symbol: 'DEMO',
    name: 'Demo Token',
    quantity: '15 000',
    price: null,
    change: null,
    value: null,
    invested: null,
    places: [{ account: 'Ledger', quantity: '15 000', value: null }],
  },
]

const ACCOUNTS = [
  {
    name: 'Ledger',
    source: 'wallet' as const,
    detail: 'Wallet · lu il y a 6 min',
    value: 804750,
  },
  {
    name: 'Binance',
    source: 'exchange' as const,
    detail: 'Plateforme · export du 12 nov.',
    value: 428205,
    warning: 'Export de plus d’un mois',
  },
  {
    name: 'Kraken',
    source: 'manual' as const,
    detail: 'Saisie manuelle · modifié le 2 oct.',
    value: 0,
  },
]

const TOTAL = 1232955
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)']
const SOURCE_ICONS = {
  wallet: WalletIcon,
  exchange: Building2Icon,
  manual: PencilLineIcon,
}

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const fmt = (cents: number) => euros.format(cents / 100)
const signed = (cents: number) => `${cents > 0 ? '+' : ''}${fmt(cents)}`
const pct = (value: number) =>
  `${value > 0 ? '+' : ''}${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-svh">
      <div className="@container space-y-6 p-4">{children}</div>
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">Crypto</h1>
      <Button iconOnly outline variant="secondary" aria-label="Actualiser">
        <RefreshCwIcon />
      </Button>
      <Button iconOnly aria-label="Ajouter">
        <PlusIcon />
      </Button>
    </div>
  )
}

function Summary() {
  const priced = ASSETS.filter((asset) => asset.value !== null)
  return (
    <Card>
      <CardContent className="@container space-y-4 pt-5">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">
            Valeur du portefeuille
          </p>
          <p className="text-[clamp(1.5rem,12cqi,2.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
            {fmt(TOTAL)}
          </p>
          <p className="text-chart-delta-good text-sm tabular-nums">
            +178,40 € <span className="text-muted-foreground">sur 24 h</span>
          </p>
          <p className="text-muted-foreground text-sm tabular-nums">
            Investi 7 630,00 € ·{' '}
            <span className="text-chart-delta-good">
              plus-value +3 168,75 €
            </span>
          </p>
        </div>
        <p className="text-muted-foreground flex items-start gap-1.5 text-sm">
          <CheckIcon className="text-success-foreground dark:text-success mt-0.5 size-4 shrink-0" />
          Cours il y a 3 min · Ledger lu il y a 6 min
        </p>
        <div className="space-y-2">
          <div
            className="bg-muted flex h-3 overflow-hidden rounded-full"
            role="img"
            aria-label="Répartition : BTC 55 %, ETH 32 %, SOL 13 %"
          >
            {priced.map((asset, i) => (
              <span
                key={asset.symbol}
                style={{
                  width: `${((asset.value ?? 0) / TOTAL) * 100}%`,
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
                  {Math.round(((asset.value ?? 0) / TOTAL) * 100)} %
                </span>
              </li>
            ))}
          </ul>
        </div>
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

function AssetRow({ asset, color }: { asset: Asset; color?: string }) {
  const [open, setOpen] = useState(false)
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
            {asset.quantity} {asset.symbol}
            {asset.places.length > 1 && ` · ${asset.places.length} comptes`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-medium whitespace-nowrap tabular-nums">
            {asset.value === null ? 'sans cours' : fmt(asset.value)}
          </span>
          {asset.change !== null && (
            <span
              className={cn(
                'block text-xs tabular-nums',
                asset.change >= 0
                  ? 'text-chart-delta-good'
                  : 'text-chart-delta-bad',
              )}
            >
              {pct(asset.change)}
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
          {asset.places.map((place) => (
            <p
              key={place.account}
              className="flex justify-between gap-3 tabular-nums"
            >
              <span>
                {place.account} · {place.quantity} {asset.symbol}
              </span>
              <span>{place.value === null ? '—' : fmt(place.value)}</span>
            </p>
          ))}
          {asset.price && (
            <p>
              1 {asset.symbol} = {asset.price} · {pct(asset.change ?? 0)} sur 24
              h
            </p>
          )}
          <p>
            {asset.invested === null
              ? 'Investi inconnu'
              : `Investi ${fmt(asset.invested)} · plus-value ${signed((asset.value ?? 0) - asset.invested)}`}
          </p>
        </div>
      )}
    </li>
  )
}

function AssetList() {
  const priced = ASSETS.filter((asset) => asset.value !== null)
  const unpriced = ASSETS.filter((asset) => asset.value === null)
  return (
    <div className="space-y-4">
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
    </div>
  )
}

function AccountRows() {
  return (
    <ItemList>
      <ItemListGroup>
        {ACCOUNTS.map((account) => {
          const Icon = SOURCE_ICONS[account.source]
          return (
            <ItemListRow
              key={account.name}
              href="#"
              icon={<Icon />}
              title={account.name}
              subtitle={account.detail}
              value={fmt(account.value)}
              detail={
                account.warning ? (
                  <span className="text-warning-foreground dark:text-warning">
                    {account.warning}
                  </span>
                ) : undefined
              }
            />
          )
        })}
      </ItemListGroup>
    </ItemList>
  )
}

/* ---------------------------------------------------------------------------
 * Portfolio A. Actifs puis comptes
 * ------------------------------------------------------------------------- */

function PortfolioA() {
  return (
    <Page>
      <Header />
      <Summary />
      <Card>
        <CardHeader>
          <CardTitle>Actifs</CardTitle>
          <p className="text-muted-foreground mt-0.5 text-sm">
            4 actifs sur 3 comptes
          </p>
        </CardHeader>
        <CardContent>
          <AssetList />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Où sont mes cryptos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <AccountRows />
          <Button className="w-full" outline variant="secondary">
            <PlusIcon /> Ajouter une plateforme ou un wallet
          </Button>
        </CardContent>
      </Card>
    </Page>
  )
}

/* ---------------------------------------------------------------------------
 * Portfolio B. Onglets
 * ------------------------------------------------------------------------- */

function PortfolioB() {
  const [tab, setTab] = useState('assets')
  return (
    <Page>
      <Header />
      <Summary />
      <Card>
        <CardContent className="space-y-4 pt-5">
          <SegmentedControl value={tab} onValueChange={setTab} fullWidth>
            <SegmentedControlItem value="assets">Actifs</SegmentedControlItem>
            <SegmentedControlItem value="accounts">
              Comptes
            </SegmentedControlItem>
          </SegmentedControl>
          {tab === 'assets' ? <AssetList /> : <AccountRows />}
        </CardContent>
      </Card>
    </Page>
  )
}

export const PortefeuilleA: StoryObj = {
  name: 'Portefeuille A. Actifs puis comptes',
  render: () => <PortfolioA />,
}

export const PortefeuilleB: StoryObj = {
  name: 'Portefeuille B. Onglets',
  render: () => <PortfolioB />,
}

/* ---------------------------------------------------------------------------
 * Add flow
 * ------------------------------------------------------------------------- */

type Source = 'exchange' | 'wallet' | 'manual'

const SOURCES: {
  value: Source
  label: string
  description: string
  icon: typeof WalletIcon
}[] = [
  {
    value: 'exchange',
    label: 'Une plateforme',
    description: 'Binance, Coinbase… depuis son export',
    icon: Building2Icon,
  },
  {
    value: 'wallet',
    label: 'Un wallet',
    description: 'Ledger, MetaMask… lu avec ses clés publiques',
    icon: WalletIcon,
  },
  {
    value: 'manual',
    label: 'Saisie manuelle',
    description: 'Un actif et sa quantité, à mettre à jour vous-même',
    icon: PencilLineIcon,
  },
]

function Tile({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: typeof WalletIcon
  label: string
  description?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-muted/60 flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-3 text-left"
    >
      <Icon className="text-muted-foreground size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {description && (
          <span className="text-muted-foreground block text-sm">
            {description}
          </span>
        )}
      </span>
      <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
    </button>
  )
}

function Sheet({
  title,
  step,
  onBack,
  children,
  footer,
}: {
  title: string
  step: number
  onBack?: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="bg-background flex min-h-svh flex-col justify-end">
      <div className="bg-card flex h-[34rem] flex-col rounded-t-xl border-t">
        <div className="flex min-h-14 items-center gap-1 py-2 pr-4 pl-2">
          {onBack ? (
            <Button ghost variant="secondary" onClick={onBack}>
              <ChevronLeftIcon /> Retour
            </Button>
          ) : (
            <span className="w-2" />
          )}
          <h3 className="min-w-0 flex-1 truncate font-semibold">
            {title}
            <span className="text-muted-foreground ml-1.5 text-sm font-normal">
              {step}/3
            </span>
          </h3>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {children}
        </div>
        {footer && <div className="border-t px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

function Recap({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y rounded-lg border text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex min-h-11 items-center gap-3 px-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="ml-auto text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function FlowA() {
  const [source, setSource] = useState<Source | null>(null)
  const [step, setStep] = useState(1)
  const [provider, setProvider] = useState<string | null>(null)
  const back = () => {
    if (step === 3) setStep(2)
    else if (provider) setProvider(null)
    else {
      setSource(null)
      setStep(1)
    }
  }
  if (source === null) {
    return (
      <Sheet title="D’où viennent ces cryptos ?" step={1}>
        {SOURCES.map((option) => (
          <Tile
            key={option.value}
            {...option}
            onClick={() => {
              setSource(option.value)
              setStep(2)
            }}
          />
        ))}
      </Sheet>
    )
  }
  if (step === 3) {
    const rows: Record<Source, [string, string][]> = {
      exchange: [
        ['Plateforme', 'Binance'],
        ['Fichier', 'transactions-2026.csv'],
        ['Nouvelles lignes', '214'],
        ['Avoirs après l’import', 'BTC, ETH, SOL'],
      ],
      wallet: [
        ['Wallet', 'Ledger'],
        ['Clé Bitcoin', 'zpub6rFR…GutZYs'],
        ['Adresse EVM', '0x0000…dEaD · Ethereum, Arbitrum'],
      ],
      manual: [
        ['Actif', 'Bitcoin (BTC)'],
        ['Quantité', '0,05 BTC'],
        ['Valeur', '4 125,00 €'],
        ['Compte', 'Kraken'],
      ],
    }
    const labels: Record<Source, string> = {
      exchange: 'Importer 214 lignes',
      wallet: 'Ajouter le wallet',
      manual: 'Ajouter',
    }
    return (
      <Sheet
        title="Récapitulatif"
        step={3}
        onBack={back}
        footer={<Button className="w-full">{labels[source]}</Button>}
      >
        <Recap rows={rows[source]} />
        <p className="text-muted-foreground text-sm">
          {source === 'wallet'
            ? 'Les soldes sont lus juste après, sur la page du wallet.'
            : source === 'exchange'
              ? 'Les euros restés sur la plateforme ne sont pas comptés.'
              : 'Sa valeur suit le cours du jour.'}
        </p>
      </Sheet>
    )
  }
  if (source === 'exchange') {
    return provider === null ? (
      <Sheet title="Quelle plateforme ?" step={2} onBack={back}>
        <Tile
          icon={Building2Icon}
          label="Binance"
          description="Déjà suivie · ajouter un export"
          onClick={() => setProvider('Binance')}
        />
        {['Coinbase', 'Autre…'].map((name) => (
          <Tile
            key={name}
            icon={Building2Icon}
            label={name}
            onClick={() => setProvider(name)}
          />
        ))}
      </Sheet>
    ) : (
      <Sheet title="L’export de Binance" step={2} onBack={back}>
        <p className="text-muted-foreground text-sm">
          Binance › Portefeuille › Historique des transactions › Exporter, au
          format CSV.
        </p>
        <button
          type="button"
          onClick={() => setStep(3)}
          className="text-muted-foreground flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm"
        >
          <FileUpIcon className="size-6" />
          Choisir le fichier .csv
        </button>
      </Sheet>
    )
  }
  if (source === 'wallet') {
    return (
      <Sheet
        title="Les clés du wallet"
        step={2}
        onBack={back}
        footer={
          <Button className="w-full" onClick={() => setStep(3)}>
            Suivant <ChevronRightIcon />
          </Button>
        }
      >
        <SegmentedControl value="Ledger" onValueChange={() => {}} fullWidth>
          <SegmentedControlItem value="Ledger">Ledger</SegmentedControlItem>
          <SegmentedControlItem value="Trezor">Trezor</SegmentedControlItem>
          <SegmentedControlItem value="Autre">Autre</SegmentedControlItem>
        </SegmentedControl>
        <label className="block space-y-1 text-sm font-medium">
          Clé publique
          <Input placeholder="xpub, zpub, bc1… ou 0x…" />
        </label>
        <Button className="w-full" outline variant="secondary">
          <PlusIcon /> Ajouter une autre clé
        </Button>
        <p className="text-muted-foreground text-xs">
          Jamais votre phrase de récupération : seulement la clé publique.
        </p>
      </Sheet>
    )
  }
  return (
    <Sheet
      title="Quel actif ?"
      step={2}
      onBack={back}
      footer={
        <Button className="w-full" onClick={() => setStep(3)}>
          Suivant <ChevronRightIcon />
        </Button>
      }
    >
      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input className="pl-9" defaultValue="Bitcoin" />
      </div>
      <div className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm">
        <span className="font-medium">BTC</span>
        <span className="text-muted-foreground">Bitcoin</span>
        <CheckIcon className="text-primary ml-auto size-4" />
      </div>
      <label className="block space-y-1 text-sm font-medium">
        Quantité
        <Input inputMode="decimal" defaultValue="0,05" />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        Montant investi (facultatif)
        <Input inputMode="decimal" placeholder="1 500 €" />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        Où ?
        <Input defaultValue="Kraken" />
      </label>
    </Sheet>
  )
}

function FlowB() {
  const [source, setSource] = useState<Source>('exchange')
  return (
    <div className="bg-background flex min-h-svh flex-col justify-end">
      <div className="bg-card space-y-4 rounded-t-xl border-t p-4">
        <h3 className="font-semibold">Ajouter des cryptos</h3>
        <SegmentedControl
          value={source}
          onValueChange={(value) => setSource(value as Source)}
          fullWidth
        >
          <SegmentedControlItem value="exchange">
            Plateforme
          </SegmentedControlItem>
          <SegmentedControlItem value="wallet">Wallet</SegmentedControlItem>
          <SegmentedControlItem value="manual">Manuel</SegmentedControlItem>
        </SegmentedControl>
        {source === 'exchange' && (
          <>
            <SegmentedControl
              value="Binance"
              onValueChange={() => {}}
              fullWidth
            >
              <SegmentedControlItem value="Binance">
                Binance
              </SegmentedControlItem>
              <SegmentedControlItem value="Coinbase">
                Coinbase
              </SegmentedControlItem>
              <SegmentedControlItem value="Autre">Autre</SegmentedControlItem>
            </SegmentedControl>
            <div className="text-muted-foreground flex min-h-24 items-center justify-center rounded-lg border-2 border-dashed text-sm">
              <FileUpIcon className="mr-2 size-5" /> Choisir l’export .csv
            </div>
          </>
        )}
        {source === 'wallet' && (
          <label className="block space-y-1 text-sm font-medium">
            Clé publique
            <Input placeholder="xpub, zpub, bc1… ou 0x…" />
          </label>
        )}
        {source === 'manual' && (
          <>
            <Input placeholder="Actif : Bitcoin, ETH…" />
            <Input inputMode="decimal" placeholder="Quantité" />
          </>
        )}
        <Button className="w-full">Ajouter</Button>
      </div>
    </div>
  )
}

export const AjoutA: StoryObj = {
  name: 'Ajout A. Pas à pas',
  render: () => <FlowA />,
}

export const AjoutB: StoryObj = {
  name: 'Ajout B. Une page',
  render: () => <FlowB />,
}
