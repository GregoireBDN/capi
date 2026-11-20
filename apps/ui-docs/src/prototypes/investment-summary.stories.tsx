import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  AreaChart,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  SegmentedControl,
  SegmentedControlItem,
} from '@finances/ui'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  UploadIcon,
} from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

/**
 * Prototypes of one set of figures on every investment account (#360),
 * shown to the owner before one is built in `apps/web`. Clickable mockups
 * with synthetic data, not app code.
 *
 * Today an exchange account stacks two summaries (« Valeur des avoirs ·
 * Investi · Plus-value », then « Valeur · Versements · Plus-value ·
 * Rendement · Sur 1 an » with many « — ») and a note about « Versements »
 * that doesn't apply to crypto; a PEA has the five tiles; a wallet its own
 * summary. See the « Avant » story.
 *
 * Both directions share the rest:
 * - the same summary on a PEA, an exchange and a wallet: the value once,
 *   its date and its change since the previous value, then Investi,
 *   Résultat (€ and %) and Sur 1 an; one word, « Investi »;
 *   « Plus-value » goes too: it reads wrong when negative and is cut in a
 *   tile; the « Mot » chips compare « Résultat », « Gain » and « +/− value »;
 * - one short line saying where the invested amount comes from, and
 *   « Modifier » where it is typed (not on an exchange: its exports give it);
 * - an unknown figure is never a « — »: one line and one action,
 *   « Renseigner le montant investi » (the « Pas encore renseigné » chip);
 * - the same order on every page: summary, what the account holds (linked
 *   transfers, holdings), the evolution chart (value and invested), the
 *   values (folded);
 * - the invested amount typed in two steps (amount, then day), see the
 *   « Saisie du montant investi » story.
 *
 * A. Investi puis deux tuiles (the owner's choice after a first look at
 *    « Trois tuiles »): the value as a hero, then Investi on one line across
 *    the card (label, amount), then two tiles abreast, Résultat and Sur 1
 *    an, each with its rate under the euros; the same at every width.
 * B. Une ligne : the value as a hero, then one sentence « Investi … ·
 *    Résultat +… (…%) » and « Sur 1 an … » under it, the figures in their
 *    colour.
 *
 * The chips switch the account, the state (in gain, at a loss, not filled
 * yet), the word and the phone's width. Switch the
 * theme in the toolbar for dark.
 */
const meta: Meta = {
  title: 'Prototypes/Investment summary (#360)',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------- */

type AccountKey = 'pea' | 'exchange' | 'wallet'
type InvestedState = 'known' | 'loss' | 'missing'

/**
 * The word for value − invested. « Plus-value » reads wrong when it is
 * negative (« Plus-value −120 € ») and is cut in a tile at 375px: three
 * short words that hold either sign, the figure carrying it.
 */
const WORDS = [
  { value: 'Résultat', label: 'Résultat' },
  { value: 'Gain', label: 'Gain' },
  { value: '+/− value', label: '+/− value' },
]
const WordContext = createContext('Résultat')
const useWord = () => useContext(WordContext)

interface Holding {
  symbol: string
  name: string
  quantity: string
  value: number
  color: string
}

interface Linked {
  label: string
  date: string
  amount: number
}

interface Account {
  key: AccountKey
  chip: string
  name: string
  institution: string
  /** The page action shown in the top bar on phones. */
  action: { label: string; icon: ReactNode }
  valueDate: string
  value: number
  previousValue: number
  previousDate: string
  invested: number
  /** Where the invested amount comes from (one short line). */
  source: string
  /** Typed by the owner (PEA, wallet), not an exchange's exports. */
  typed: boolean
  /** The line and the action when the invested amount is unknown. */
  missing: { text: string; action: string; typed: boolean }
  yearChange: number
  yearRate: number
  holdings?: Holding[]
  linked?: Linked[]
  linkedTitle?: string
  /** Wallet: keys and tokens as settings rows, after the values. */
  keys?: boolean
}

const ACCOUNTS: Record<AccountKey, Account> = {
  pea: {
    key: 'pea',
    chip: 'PEA',
    name: 'PEA démo',
    institution: 'Banque démo',
    action: { label: 'Mettre à jour la valeur', icon: <PlusIcon /> },
    valueDate: '31 oct. 2026',
    value: 1_584_612,
    previousValue: 1_552_000,
    previousDate: '30 sept.',
    invested: 1_380_013,
    source: 'Saisi au 2 janv. 2026 + 3 virements liés',
    typed: true,
    missing: {
      text: 'Montant investi pas encore renseigné : le gain ou la perte s’affichera dès qu’il le sera.',
      action: 'Renseigner le montant investi',
      typed: true,
    },
    yearChange: 112_040,
    yearRate: 0.076,
    linkedTitle: 'Virements liés',
    linked: [
      { label: 'Vers PEA démo', date: '5 oct. 2026', amount: 30_000 },
      { label: 'Vers PEA démo', date: '5 sept. 2026', amount: 30_000 },
      { label: 'Vers PEA démo', date: '5 août 2026', amount: 30_000 },
    ],
  },
  exchange: {
    key: 'exchange',
    chip: 'Plateforme',
    name: 'Plateforme démo',
    institution: 'Coinbase',
    action: { label: 'Importer un export', icon: <UploadIcon /> },
    valueDate: 'à l’instant',
    value: 435_860,
    previousValue: 441_210,
    previousDate: '19 nov.',
    invested: 380_000,
    source: 'D’après vos exports, au prix d’achat',
    typed: false,
    missing: {
      text: 'Vos exports n’indiquent pas le prix d’achat : le gain ou la perte s’affichera avec un export qui le donne.',
      action: 'Importer un export',
      typed: false,
    },
    yearChange: 61_420,
    yearRate: 0.164,
    holdings: [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        quantity: '0,031 BTC',
        value: 255_750,
        color: '#f7931a',
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        quantity: '0,45 ETH',
        value: 132_750,
        color: '#627eea',
      },
      {
        symbol: 'SOL',
        name: 'Solana',
        quantity: '3,2 SOL',
        value: 47_360,
        color: '#9945ff',
      },
    ],
  },
  wallet: {
    key: 'wallet',
    chip: 'Wallet',
    name: 'Ledger démo',
    institution: 'Ledger',
    action: { label: 'Actualiser', icon: <RefreshCwIcon /> },
    valueDate: 'il y a 6 min',
    value: 738_750,
    previousValue: 732_110,
    previousDate: '19 nov.',
    invested: 610_000,
    source: 'Saisi au 1er mars 2025 + 2 retraits liés',
    typed: true,
    missing: {
      text: 'Montant investi pas encore renseigné : le gain ou la perte s’affichera dès qu’il le sera.',
      action: 'Renseigner le montant investi',
      typed: true,
    },
    yearChange: 95_300,
    yearRate: 0.148,
    holdings: [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        quantity: '0,052 BTC',
        value: 429_000,
        color: '#f7931a',
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        quantity: '1,05 ETH · 2 réseaux',
        value: 309_750,
        color: '#627eea',
      },
    ],
    keys: true,
  },
}

/** Twelve monthly values and the invested amount, oldest first. */
function history(account: Account, withInvested: boolean) {
  return Array.from({ length: 13 }, (_, i) => {
    const date = new Date(Date.UTC(2025, 9 + i, 28))
    const ratio = i / 12
    const invested = Math.round(account.invested * (0.8 + 0.2 * ratio))
    const value = Math.round(
      account.value * (0.86 + 0.14 * ratio) +
        account.value * 0.03 * Math.sin(i / 1.4),
    )
    return {
      date: date.toISOString().slice(0, 10),
      value: i === 12 ? account.value : value,
      ...(withInvested && {
        invested: i === 12 ? account.invested : invested,
      }),
    }
  })
}

/* ---------------------------------------------------------------------------
 * Formatting (as in the app: integer cents, formatted at the edge)
 * ------------------------------------------------------------------------- */

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const wholeEur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const signedWholeEur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})
const signedEur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  signDisplay: 'exceptZero',
})
const pct = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})
const cents = (value: number) => eur.format(value / 100)
const whole = (value: number) => wholeEur.format(Math.round(value / 100))
const signedWhole = (value: number) =>
  signedWholeEur.format(Math.round(value / 100))
const signed = (value: number) => signedEur.format(value / 100)

function tone(value: number) {
  return cn(
    value > 0 && 'text-chart-delta-good',
    value < 0 && 'text-chart-delta-bad',
    value === 0 && 'text-muted-foreground',
  )
}

/* ---------------------------------------------------------------------------
 * Frame: the app's 22px root, a phone of the chosen width, the top bar
 * ------------------------------------------------------------------------- */

function AppScale({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    const before = root.style.fontSize
    root.style.fontSize = '22px'
    return () => {
      root.style.fontSize = before
    }
  }, [])
  return <>{children}</>
}

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-11 rounded-full border px-3 text-sm',
            value === option.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const WIDTHS = [
  { value: '320', label: '320 px' },
  { value: '375', label: '375 px' },
  { value: '430', label: '430 px' },
]

/** A phone: its own scroll, a sheet drawn over it when one is open. */
function Phone({
  width,
  sheet,
  children,
}: {
  width: string
  sheet?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className="bg-background relative h-[844px] shrink-0 overflow-hidden rounded-[28px] border shadow-sm"
      style={{ width: Number(width) }}
    >
      <div className="h-full overflow-x-hidden overflow-y-auto">{children}</div>
      {sheet}
    </div>
  )
}

function TopBar({ account }: { account: Account }) {
  return (
    <div className="bg-background/95 sticky top-0 z-10 flex h-12 items-center gap-2 border-b px-2">
      <Button
        size="sm"
        variant="secondary"
        ghost
        iconStart={<ChevronLeftIcon />}
      >
        Comptes
      </Button>
      <span className="flex-1" />
      <Button
        iconOnly
        variant="secondary"
        ghost
        aria-label={account.action.label}
        title={account.action.label}
      >
        {account.action.icon}
      </Button>
    </div>
  )
}

function Title({ account }: { account: Account }) {
  return (
    <div>
      <h1 className="truncate text-xl font-semibold">{account.name}</h1>
      <p className="text-muted-foreground text-sm">{account.institution}</p>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * The summary's shared pieces
 * ------------------------------------------------------------------------- */

/** The value once, its date and its change since the previous value. */
function ValueHero({ account }: { account: Account }) {
  const change = account.value - account.previousValue
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-sm">
        Valeur · {account.valueDate}
      </p>
      <p className="text-[clamp(1.5rem,12cqi,2.1rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
        {cents(account.value)}
      </p>
      <p className="text-sm tabular-nums">
        <span className={tone(change)}>{signed(change)}</span>{' '}
        <span className="text-muted-foreground">
          depuis le {account.previousDate}
        </span>
      </p>
    </div>
  )
}

/** Where the invested amount comes from, and « Modifier » where it is typed. */
function SourceLine({
  account,
  onEdit,
}: {
  account: Account
  onEdit: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p className="text-muted-foreground min-w-[9rem] flex-1 text-xs">
        {account.source}
      </p>
      {account.typed && (
        <Button
          size="sm"
          variant="secondary"
          ghost
          iconStart={<PencilIcon />}
          onClick={onEdit}
          className="ml-auto shrink-0"
        >
          Modifier
        </Button>
      )}
    </div>
  )
}

/** No « — »: one line and the action that fills the invested amount. */
function MissingInvested({
  account,
  onEdit,
}: {
  account: Account
  onEdit: () => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">{account.missing.text}</p>
      <Button
        className="w-full"
        outline
        variant="secondary"
        iconStart={account.missing.typed ? <PencilIcon /> : <UploadIcon />}
        onClick={account.missing.typed ? onEdit : undefined}
      >
        {account.missing.action}
      </Button>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * A. Investi puis deux tuiles
 * ------------------------------------------------------------------------- */

function Tile({
  label,
  value,
  sub,
  valueClassName,
  className,
}: {
  label: string
  value: string
  sub?: ReactNode
  valueClassName?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-muted/50 @container min-w-0 rounded-lg px-3 py-2',
        className,
      )}
    >
      <p className="text-muted-foreground truncate text-xs">{label}</p>
      <p
        className={cn(
          'text-[clamp(0.75rem,14cqi,1.15rem)] font-semibold whitespace-nowrap tabular-nums',
          valueClassName,
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs whitespace-nowrap tabular-nums">{sub}</p>}
    </div>
  )
}

/**
 * Proposals for the Investi block of A (the owner was not convinced by the
 * first line): switched with the « Bloc Investi » chips.
 * - Ligne: label left, amount right, on a muted band.
 * - Centrée: « Investi 13 800 € » centred on the band.
 * - Tuile: a tile like the two under it (label, amount, then where it
 *   comes from), with a pencil to change it.
 * - Ligne à modifier: a settings row (label and where it comes from, the
 *   amount, ›), the whole row opening the editor.
 * - Barre (the owner's choice, 20/11): the amount, then a bar of the value split into what was put in
 *   and what it made (or lost).
 */
type InvestedVariant = 'line' | 'centred' | 'tile' | 'row' | 'bar'

const INVESTED_VARIANTS: { value: InvestedVariant; label: string }[] = [
  { value: 'line', label: 'Ligne' },
  { value: 'centred', label: 'Centrée' },
  { value: 'tile', label: 'Tuile' },
  { value: 'row', label: 'Ligne à modifier' },
  { value: 'bar', label: 'Barre (choisie)' },
]
const InvestedVariantContext = createContext<InvestedVariant>('bar')

/** The variants that say where the amount comes from themselves. */
const WITH_SOURCE: InvestedVariant[] = ['tile', 'row']

function InvestedBlock({
  account,
  onEdit,
}: {
  account: Account
  onEdit: () => void
}) {
  const variant = useContext(InvestedVariantContext)
  const amount = whole(account.invested)
  const band = 'bg-muted/50 flex min-h-11 items-center rounded-lg px-3 py-2'
  if (variant === 'centred') {
    return (
      <div className={cn(band, 'justify-center gap-2')}>
        <span className="text-muted-foreground text-sm">Investi</span>
        <span className="text-base font-semibold whitespace-nowrap tabular-nums">
          {amount}
        </span>
      </div>
    )
  }
  if (variant === 'tile') {
    return (
      <div className="bg-muted/50 flex items-start gap-2 rounded-lg py-2 pr-1 pl-3">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs">Investi</p>
          <p className="text-[1.15rem] font-semibold whitespace-nowrap tabular-nums">
            {amount}
          </p>
          <p className="text-muted-foreground text-xs">{account.source}</p>
        </div>
        {account.typed && (
          <Button
            iconOnly
            variant="secondary"
            ghost
            aria-label="Modifier le montant investi"
            onClick={onEdit}
          >
            <PencilIcon />
          </Button>
        )}
      </div>
    )
  }
  if (variant === 'row') {
    // The label, the amount and › on the first line; where it comes from
    // across the whole row under them.
    const content = (
      <>
        <span className="flex items-center gap-3">
          <span className="text-sm font-medium">Investi</span>
          <span className="ml-auto text-base font-semibold whitespace-nowrap tabular-nums">
            {amount}
          </span>
          {account.typed && (
            <ChevronRightIcon
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
          )}
        </span>
        <span className="text-muted-foreground block text-xs">
          {account.source}
        </span>
      </>
    )
    const row = 'bg-muted/50 block min-h-11 w-full rounded-lg px-3 py-2'
    return account.typed ? (
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Investi ${amount}, ${account.source} : modifier`}
        className={cn(row, 'hover:bg-muted text-left')}
      >
        {content}
      </button>
    ) : (
      <div className={row}>{content}</div>
    )
  }
  if (variant === 'bar') {
    const gain = account.value - account.invested
    const total = Math.max(account.value, account.invested)
    const base = Math.min(account.value, account.invested)
    return (
      <div className="bg-muted/50 space-y-2 rounded-lg px-3 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="text-muted-foreground text-sm">Investi</span>
          <span className="ml-auto text-base font-semibold whitespace-nowrap tabular-nums">
            {amount}
          </span>
        </div>
        <div
          role="img"
          aria-label={
            gain >= 0
              ? `La valeur : ${amount} investis et ${signedWhole(gain)} de résultat`
              : `La valeur : ${amount} investis, dont ${signedWhole(gain)} perdus`
          }
          className="bg-background flex h-2.5 overflow-hidden rounded-full"
        >
          <span
            className="bg-muted-foreground/40 h-full"
            style={{ width: `${(base / total) * 100}%` }}
          />
          <span
            className={cn(
              'border-background h-full border-l-2',
              gain >= 0 ? 'bg-chart-delta-good' : 'bg-chart-delta-bad/60',
            )}
            style={{ width: `${(Math.abs(gain) / total) * 100}%` }}
          />
        </div>
      </div>
    )
  }
  return (
    <div className={cn(band, 'gap-3')}>
      <span className="text-muted-foreground text-sm">Investi</span>
      <span className="ml-auto text-base font-semibold whitespace-nowrap tabular-nums">
        {amount}
      </span>
    </div>
  )
}

function SummaryA({
  account,
  state,
  onEdit,
}: {
  account: Account
  state: InvestedState
  onEdit: () => void
}) {
  const gain = account.value - account.invested
  const known = state === 'known'
  const word = useWord()
  const variant = useContext(InvestedVariantContext)
  return (
    <Card>
      <CardContent className="@container space-y-4 pt-5">
        <ValueHero account={account} />
        <div className="space-y-2">
          {/* The amount put in first, on one line; the two results under
              it, each with its rate. Without it, its line and its action
              take its place. */}
          {known ? (
            <InvestedBlock account={account} onEdit={onEdit} />
          ) : (
            <MissingInvested account={account} onEdit={onEdit} />
          )}
          <div className="grid grid-cols-2 gap-2">
            {known && (
              <Tile
                label={word}
                value={signedWhole(gain)}
                valueClassName={tone(gain)}
                sub={
                  <span className={tone(gain)}>
                    {pct.format(gain / account.invested)}
                  </span>
                }
              />
            )}
            <Tile
              label="Sur 1 an"
              value={signedWhole(account.yearChange)}
              valueClassName={tone(account.yearChange)}
              sub={
                <span className={tone(account.yearChange)}>
                  {pct.format(account.yearRate)}
                </span>
              }
              className={known ? undefined : 'col-span-2'}
            />
          </div>
        </div>
        {known && !WITH_SOURCE.includes(variant) && (
          <SourceLine account={account} onEdit={onEdit} />
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * B. Une ligne
 * ------------------------------------------------------------------------- */

/** One figure of the sentence, never broken inside. */
function Part({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap tabular-nums">{children}</span>
}

function SummaryB({
  account,
  state,
  onEdit,
}: {
  account: Account
  state: InvestedState
  onEdit: () => void
}) {
  const gain = account.value - account.invested
  const known = state === 'known'
  const word = useWord()
  return (
    <Card>
      <CardContent className="@container space-y-3 pt-5">
        <ValueHero account={account} />
        <div className="space-y-1 border-t pt-3 text-sm">
          {known && (
            <p>
              <Part>
                <span className="text-muted-foreground">Investi</span>{' '}
                <span className="font-medium">{whole(account.invested)}</span>
              </Part>
              <span className="text-muted-foreground"> · </span>
              <Part>
                <span className="text-muted-foreground">{word}</span>{' '}
                <span className={cn('font-medium', tone(gain))}>
                  {signedWhole(gain)} ({pct.format(gain / account.invested)})
                </span>
              </Part>
            </p>
          )}
          <p>
            <Part>
              <span className="text-muted-foreground">Sur 1 an</span>{' '}
              <span className={cn('font-medium', tone(account.yearChange))}>
                {signedWhole(account.yearChange)} (
                {pct.format(account.yearRate)})
              </span>
            </Part>
          </p>
        </div>
        {known ? (
          <SourceLine account={account} onEdit={onEdit} />
        ) : (
          <MissingInvested account={account} onEdit={onEdit} />
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * The rest of the page, the same in A and B
 * ------------------------------------------------------------------------- */

function AssetBadge({ holding }: { holding: Holding }) {
  return (
    <span
      aria-hidden
      className="flex size-[32px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
      style={{
        background: `color-mix(in oklab, ${holding.color} 18%, transparent)`,
        color: holding.color,
      }}
    >
      {holding.symbol}
    </span>
  )
}

/** Holdings by asset, the split as one bar above them. */
function Holdings({ account }: { account: Account }) {
  const holdings = account.holdings ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>Avoirs</CardTitle>
        <CardDescription>Cours il y a 3 min</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          role="img"
          aria-label={`Répartition : ${holdings
            .map(
              (h) =>
                `${h.name} ${Math.round((h.value / account.value) * 100)} %`,
            )
            .join(', ')}`}
          className="bg-muted flex h-3 overflow-hidden rounded-full"
        >
          {holdings.map((holding) => (
            <span
              key={holding.symbol}
              className="border-card h-full border-r-2 last:border-r-0"
              style={{
                width: `${(holding.value / account.value) * 100}%`,
                background: holding.color,
              }}
            />
          ))}
        </div>
        <ul className="space-y-0.5">
          {holdings.map((holding) => (
            <li key={holding.symbol}>
              <button
                type="button"
                className="hover:bg-muted/60 flex min-h-11 w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left text-sm"
              >
                <AssetBadge holding={holding} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {holding.name}
                    </span>
                    <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
                      {whole(holding.value)}
                    </span>
                  </span>
                  <span className="text-muted-foreground flex gap-2 text-xs tabular-nums">
                    <span className="min-w-0 flex-1 truncate">
                      {holding.quantity}
                    </span>
                    <span className="shrink-0">
                      {Math.round((holding.value / account.value) * 100)} %
                    </span>
                  </span>
                </span>
                <ChevronDownIcon
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function LinkedTransfers({ account }: { account: Account }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{account.linkedTitle}</CardTitle>
        <CardDescription>
          Les virements du compte courant vers ce compte, comptés dans
          l’investi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {account.linked?.map((transfer) => (
            <li
              key={transfer.date}
              className="flex min-h-11 items-center gap-3 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{transfer.label}</span>
                <span className="text-muted-foreground block text-xs">
                  {transfer.date}
                </span>
              </span>
              <span className="font-medium whitespace-nowrap tabular-nums">
                {cents(transfer.amount)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function Evolution({
  account,
  state,
}: {
  account: Account
  state: InvestedState
}) {
  const [range, setRange] = useState('1y')
  const withInvested = state === 'known'
  return (
    <Card>
      <CardHeader>
        <CardTitle>Évolution</CardTitle>
        <CardDescription>
          {withInvested
            ? 'La valeur et le montant investi, chaque mois.'
            : 'La valeur, chaque mois.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SegmentedControl value={range} onValueChange={setRange} fullWidth>
          <SegmentedControlItem value="6m">6 mois</SegmentedControlItem>
          <SegmentedControlItem value="1y">1 an</SegmentedControlItem>
          <SegmentedControlItem value="all">Tout</SegmentedControlItem>
        </SegmentedControl>
        <AreaChart
          data={history(account, withInvested)}
          index="date"
          indexScale="time"
          config={{
            value: { label: 'Valeur', color: 'var(--chart-1)' },
            ...(withInvested && {
              invested: { label: 'Investi', color: 'var(--chart-2)' },
            }),
          }}
          label={
            withInvested
              ? 'Valeur et montant investi du compte'
              : 'Valeur du compte'
          }
          height={200}
        />
      </CardContent>
    </Card>
  )
}

const VALUES = [
  { date: '31 oct. 2026', value: 1_584_612, invested: 1_380_013 },
  { date: '30 sept. 2026', value: 1_552_000, invested: 1_350_013 },
  { date: '31 août 2026', value: 1_519_870, invested: 1_320_013 },
]

/** The values, folded; « Investi » beside each one when it is known. */
function Values({
  account,
  state,
}: {
  account: Account
  state: InvestedState
}) {
  const [open, setOpen] = useState(false)
  const scale = account.value / VALUES[0].value
  const investedScale = account.invested / VALUES[0].invested
  return (
    <Card>
      <CardContent className="pt-3 pb-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center justify-between text-sm font-medium"
        >
          Valeurs enregistrées (14)
          <ChevronDownIcon
            aria-hidden
            className={cn(
              'text-muted-foreground size-4 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
        {open && (
          <ul className="divide-y">
            {VALUES.map((row) => (
              <li key={row.date}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block">{row.date}</span>
                    {state === 'known' && account.typed && (
                      <span className="text-muted-foreground block text-xs tabular-nums">
                        Investi{' '}
                        {whole(Math.round(row.invested * investedScale))}
                      </span>
                    )}
                  </span>
                  <span className="font-medium whitespace-nowrap tabular-nums">
                    {cents(Math.round(row.value * scale))}
                  </span>
                  <ChevronRightIcon
                    aria-hidden
                    className="text-muted-foreground size-4 shrink-0"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** A wallet's keys and tokens, as settings rows at the end (#294). */
function Keys() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clés et jetons</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {['zpub6rFR…GutZYs · 4 adresses utilisées', 'Jetons lus (USDC)'].map(
            (row) => (
              <li key={row}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left text-sm"
                >
                  <KeyRoundIcon
                    aria-hidden
                    className="text-muted-foreground size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{row}</span>
                  <ChevronRightIcon
                    aria-hidden
                    className="text-muted-foreground size-4 shrink-0"
                  />
                </button>
              </li>
            ),
          )}
        </ul>
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * The invested amount, typed in two steps
 * ------------------------------------------------------------------------- */

/** Exact text, at most two decimals (as `AmountField`, never a float). */
const AMOUNT = /^\d{0,7}(?:[,.]\d{0,2})?$/

function InvestedEditor({
  account,
  onClose,
}: {
  account: Account
  onClose?: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [amount, setAmount] = useState(account.key === 'wallet' ? '' : '13 800')
  const [day, setDay] = useState<'last' | 'today' | 'other'>('last')
  const digits = amount.replace(/\s/g, '')
  const valid =
    digits !== '' && AMOUNT.test(digits) && Number.parseInt(digits, 10) > 0
  const crypto = account.key === 'wallet'
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-3">
        {step === 2 ? (
          <Button
            size="sm"
            variant="secondary"
            ghost
            iconStart={<ArrowLeftIcon />}
            onClick={() => setStep(1)}
          >
            Retour
          </Button>
        ) : (
          <span className="h-11" />
        )}
        <span className="text-muted-foreground ml-auto text-xs">
          Étape {step} sur 2
        </span>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-2 pb-4">
        {step === 1 ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                Combien avez-vous investi ?
              </h2>
              <p className="text-muted-foreground text-sm">
                {crypto
                  ? 'Ce que vous ont coûté les cryptos de ce wallet, en euros. Les retraits liés d’une plateforme s’y ajoutent ensuite.'
                  : 'Le total versé sur ce compte, moins les retraits : « versements nets » ou « cumul des versements » sur un relevé.'}
              </p>
            </div>
            <InputGroup>
              <InputGroupInput
                inputMode="decimal"
                autoComplete="off"
                aria-label="Montant investi"
                placeholder="0"
                value={amount}
                onChange={(event) => {
                  const next = event.target.value
                  if (AMOUNT.test(next.replace(/\s/g, ''))) setAmount(next)
                }}
                className="text-lg tabular-nums"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>€</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">À quelle date ?</h2>
              <p className="text-muted-foreground text-sm">
                Le jour où ce montant était juste.{' '}
                {account.linked
                  ? 'Les virements liés après ce jour s’y ajoutent.'
                  : 'Les retraits liés après ce jour s’y ajoutent.'}
              </p>
            </div>
            <Chips
              label="Jour"
              value={day}
              onChange={setDay}
              options={[
                { value: 'last', label: 'Dernière valeur (31 oct.)' },
                { value: 'today', label: 'Aujourd’hui' },
                { value: 'other', label: 'Autre date' },
              ]}
            />
            {day === 'other' && (
              <InputGroup>
                <InputGroupInput
                  type="date"
                  aria-label="Date"
                  defaultValue="2026-01-02"
                />
              </InputGroup>
            )}
            <p className="bg-muted/50 rounded-lg p-3 text-sm">
              Investi <strong className="tabular-nums">{amount} €</strong> au{' '}
              {day === 'last'
                ? '31 oct. 2026'
                : day === 'today'
                  ? '20 nov. 2026'
                  : '2 janv. 2026'}
              {account.linked && ', + 3 virements liés depuis'}.
            </p>
          </>
        )}
      </div>
      <div className="border-t px-4 pt-3 pb-4">
        {step === 1 ? (
          <Button
            className="w-full"
            disabled={!valid}
            onClick={() => setStep(2)}
          >
            Suivant
          </Button>
        ) : (
          <Button className="w-full" onClick={onClose}>
            Enregistrer
          </Button>
        )}
      </div>
    </div>
  )
}

/** The editor as the app's bottom sheet, drawn inside the phone. */
function SheetOver({
  account,
  onClose,
}: {
  account: Account
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={account.missing.action}
        className="bg-background relative h-[min(32rem,92%)] rounded-t-xl border-t"
      >
        <InvestedEditor account={account} onClose={onClose} />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Pages
 * ------------------------------------------------------------------------- */

type Direction = 'A' | 'B'

function AccountPage({
  account,
  state,
  direction,
  onEdit,
}: {
  account: Account
  state: InvestedState
  direction: Direction
  onEdit: () => void
}) {
  const Summary = direction === 'A' ? SummaryA : SummaryB
  // « En perte »: more invested than the value, and a year down.
  const shown: Account =
    state === 'loss'
      ? {
          ...account,
          invested: Math.round(account.value * 1.09),
          yearChange: -Math.round(account.yearChange * 0.4),
          yearRate: -account.yearRate * 0.4,
        }
      : account
  const figures: InvestedState = state === 'loss' ? 'known' : state
  return (
    <>
      <TopBar account={shown} />
      <div className="@container space-y-6 p-4">
        <Title account={shown} />
        <Summary account={shown} state={figures} onEdit={onEdit} />
        {shown.holdings && <Holdings account={shown} />}
        {shown.linked && <LinkedTransfers account={shown} />}
        <Evolution account={shown} state={figures} />
        <Values account={shown} state={figures} />
        {account.keys && <Keys />}
      </div>
    </>
  )
}

const ACCOUNT_OPTIONS = (Object.values(ACCOUNTS) as Account[]).map((a) => ({
  value: a.key,
  label: a.chip,
}))

const STATE_OPTIONS: { value: InvestedState; label: string }[] = [
  { value: 'known', label: 'En gain' },
  { value: 'loss', label: 'En perte' },
  { value: 'missing', label: 'Pas encore renseigné' },
]

function Direction({
  direction,
  title,
  description,
}: {
  direction: Direction
  title: string
  description: string
}) {
  const [key, setKey] = useState<AccountKey>('pea')
  const [state, setState] = useState<InvestedState>('known')
  const [width, setWidth] = useState('375')
  const [word, setWord] = useState('Résultat')
  const [investedVariant, setInvestedVariant] = useState<InvestedVariant>('bar')
  const [editing, setEditing] = useState(false)
  const account = ACCOUNTS[key]
  return (
    <AppScale>
      <WordContext.Provider value={word}>
        <InvestedVariantContext.Provider value={investedVariant}>
          <div className="bg-muted/40 text-foreground min-h-svh space-y-3 p-4">
            <div>
              <h1 className="text-lg font-semibold">{title}</h1>
              <p className="text-muted-foreground max-w-[40rem] text-xs">
                {description}
              </p>
            </div>
            <Chips
              label="Compte"
              options={ACCOUNT_OPTIONS}
              value={key}
              onChange={(next) => {
                setKey(next)
                setEditing(false)
              }}
            />
            <Chips
              label="Montant investi"
              options={STATE_OPTIONS}
              value={state}
              onChange={setState}
            />
            {direction === 'A' && (
              <Chips
                label="Bloc Investi"
                options={INVESTED_VARIANTS}
                value={investedVariant}
                onChange={setInvestedVariant}
              />
            )}
            <Chips
              label="Mot"
              options={WORDS}
              value={word}
              onChange={setWord}
            />
            <Chips
              label="Largeur"
              options={WIDTHS}
              value={width}
              onChange={setWidth}
            />
            <Phone
              width={width}
              sheet={
                editing && (
                  <SheetOver
                    account={account}
                    onClose={() => setEditing(false)}
                  />
                )
              }
            >
              <AccountPage
                account={account}
                state={state}
                direction={direction}
                onEdit={() => setEditing(true)}
              />
            </Phone>
          </div>
        </InvestedVariantContext.Provider>
      </WordContext.Provider>
    </AppScale>
  )
}

/* ---------------------------------------------------------------------------
 * Before: an exchange account's summary on main
 * ------------------------------------------------------------------------- */

function BeforeTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Before() {
  const account = ACCOUNTS.exchange
  return (
    <AppScale>
      <div className="bg-muted/40 text-foreground min-h-svh space-y-3 p-4">
        <div>
          <h1 className="text-lg font-semibold">Avant (main)</h1>
          <p className="text-muted-foreground max-w-[40rem] text-xs">
            Une plateforme : la valeur deux fois, l’investi sous deux noms («
            Investi », « Versements ») et deux sources, la plus-value deux fois,
            des tuiles « — » et une note sur les versements qui ne concerne pas
            la crypto.
          </p>
        </div>
        <Phone width="375">
          <TopBar account={account} />
          <div className="space-y-4 p-4">
            <Title account={account} />
            <div className="grid grid-cols-1 gap-2">
              <BeforeTile
                label="Valeur des avoirs"
                value={cents(account.value)}
              />
              <BeforeTile label="Investi" value={cents(account.invested)} />
              <BeforeTile
                label="Plus-value"
                value={signed(account.value - account.invested)}
              />
            </div>
            <Holdings account={account} />
            <div className="grid grid-cols-1 gap-2">
              <BeforeTile label="Valeur" value={cents(account.value)} />
              <BeforeTile label="Versements" value="—" />
              <BeforeTile label="Plus-value" value="—" />
              <BeforeTile label="Rendement" value="—" />
              <BeforeTile
                label="Sur 1 an"
                value={signedWhole(account.yearChange)}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Versements inconnus : renseignez-les sur une valeur, ou liez à ce
              compte les virements qui l’alimentent (Opérations, « Vers »), pour
              calculer la plus-value.
            </p>
          </div>
        </Phone>
      </div>
    </AppScale>
  )
}

/* ---------------------------------------------------------------------------
 * The editor on its own, for the PEA and the wallet
 * ------------------------------------------------------------------------- */

function Editors() {
  const [width, setWidth] = useState('375')
  return (
    <AppScale>
      <div className="bg-muted/40 text-foreground min-h-svh space-y-3 p-4">
        <div>
          <h1 className="text-lg font-semibold">Saisie du montant investi</h1>
          <p className="text-muted-foreground max-w-[40rem] text-xs">
            Une seule saisie pour tous les comptes où l’investi se tape (pas une
            plateforme : ses exports le donnent). Deux étapes : le montant (pavé
            décimal, « Suivant » grisé tant qu’il est vide), puis le jour. Elle
            remplace « Versements nets » sur chaque valeur ; le champ reste sous
            « Plus d’options » d’une valeur pour les relevés qui l’impriment.
          </p>
        </div>
        <Chips
          label="Largeur"
          options={WIDTHS}
          value={width}
          onChange={setWidth}
        />
        <div className="flex flex-wrap gap-6">
          {(['pea', 'wallet'] as const).map((key) => (
            <div key={key} className="space-y-2">
              <p className="text-sm font-medium">{ACCOUNTS[key].name}</p>
              <Phone
                width={width}
                sheet={<SheetOver account={ACCOUNTS[key]} onClose={() => {}} />}
              >
                <AccountPage
                  account={ACCOUNTS[key]}
                  state="missing"
                  direction="A"
                  onEdit={() => {}}
                />
              </Phone>
            </div>
          ))}
        </div>
      </div>
    </AppScale>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const Avant: StoryObj = {
  name: 'Avant',
  render: () => <Before />,
}

export const A_InvestiPuisDeuxTuiles: StoryObj = {
  name: 'A. Investi puis deux tuiles',
  render: () => (
    <Direction
      direction="A"
      title="A. Investi puis deux tuiles"
      description="La valeur en grand, sa date et son évolution, puis « Investi » sur une ligne de toute la largeur, puis deux tuiles côte à côte : Résultat et Sur 1 an, chacune avec son pourcentage. Les puces « Bloc Investi » comparent cinq façons de montrer l’investi : Ligne, Centrée, Tuile (avec son origine et un crayon), Ligne à modifier (toute la ligne ouvre la saisie) et Barre (la valeur en investi + résultat). Sans investi : à sa place une ligne et « Renseigner le montant investi », puis la tuile Sur 1 an."
    />
  ),
}

export const B_UneLigne: StoryObj = {
  name: 'B. Une ligne',
  render: () => (
    <Direction
      direction="B"
      title="B. Une ligne"
      description="La valeur en grand, sa date et son évolution, puis une phrase : « Investi 13 800 € · Résultat +2 046 € (+14,8 %) », et « Sur 1 an » dessous, les chiffres dans leur couleur. Même ligne d’origine et même action « Renseigner le montant investi » que A."
    />
  ),
}

export const Saisie: StoryObj = {
  name: 'Saisie du montant investi',
  render: () => <Editors />,
}
