import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  ItemListRow,
} from '@finances/ui'
import {
  BitcoinIcon,
  BriefcaseIcon,
  ChartCandlestickIcon,
  ChevronRightIcon,
  PiggyBankIcon,
  UmbrellaIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

/**
 * Prototypes of the account rows on phones (#344), shown to the owner before
 * one is built in `apps/web`. Synthetic data, not app code.
 *
 * The row before (#262, #267): badge, name and « institution · au 31 oct. »
 * on the left, the value and the gain with its rate on the right, never cut.
 * At 375px a five-digit value and a four-digit gain take most of the row, so
 * the name shrinks to « P… », « As… ».
 *
 * A. Gain sous le nom : the name and the value on the first line, the gain
 *    and its rate in their colour on the second, in place of « institution ·
 *    date » (kept by the rows without a gain).
 * B. Montants arrondis : the same two columns, with whole euros (`15 846 €`)
 *    and only the rate (`+14,8 %`) on the right; the gain in euros stays on
 *    the account page.
 * C. Empilé sur les lignes étroites : when the row is narrow (under 464px,
 *    every phone), the name (up to two lines) and « institution · date »
 *    take the whole width, and the value and the gain go on lines of their
 *    own under them; wide rows keep the two columns. Built (`ItemListRow`
 *    `stackWhenNarrow`).
 *
 * After seeing C in the app, the owner found four lines too many and too
 * much data, with the badge off centre. Three more directions, two lines
 * each, the badge centred, the gain in euros and « institution · date » left
 * to the account page (a stale account shows its value's date in the
 * warning colour instead of the rate), 8px gaps so a 20-character name fits:
 *
 * D. Nom puis chiffres : the name alone on the first line, the value and the
 *    rate after it on the second.
 * E. Taux aligné : as D, the value muted and the rate at the end of the line,
 *    so the rates line up from row to row.
 * F. Montant d’abord : the value in bold and the rate on the first line, the
 *    name small under it.
 *
 * Measured at 375px (22px root): the row's text column is 176px wide, a
 * 20-character name 186px, « 15 846,12 € » 95px and « +2 045,99 € · +14,8 % »
 * 148px, so A and B can't show such a name beside a figure: only C can.
 *
 * Every story shows the Comptes page's two cards at 320, 375 and 430px.
 * Switch the theme in the toolbar for dark.
 */
const meta: Meta = {
  title: 'Prototypes/Account rows (#344)',
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

type Kind = 'checking' | 'savings' | 'brokerage' | 'life' | 'pee' | 'crypto'

const BADGES: Record<Kind, { icon: LucideIcon; className: string }> = {
  checking: { icon: WalletIcon, className: 'bg-chart-1/15 text-chart-1' },
  savings: { icon: PiggyBankIcon, className: 'bg-chart-3/15 text-chart-3' },
  brokerage: {
    icon: ChartCandlestickIcon,
    className: 'bg-chart-7/15 text-chart-7',
  },
  life: { icon: UmbrellaIcon, className: 'bg-chart-5/15 text-chart-5' },
  pee: { icon: BriefcaseIcon, className: 'bg-chart-4/15 text-chart-4' },
  crypto: { icon: BitcoinIcon, className: 'bg-chart-2/15 text-chart-2' },
}

interface Row {
  name: string
  kind: Kind
  subtitle: string
  value: number
  gain?: number
  rate?: number
  stale?: boolean
}

const CASH: Row[] = [
  {
    name: 'Compte courant',
    kind: 'checking',
    subtitle: 'CIC · au 9 nov.',
    value: 234_156,
  },
  {
    name: 'Livret A',
    kind: 'savings',
    subtitle: 'CIC · au 9 nov.',
    value: 2_295_000,
  },
  {
    name: 'Livret Jeune',
    kind: 'savings',
    subtitle: 'CIC · au 9 nov.',
    value: 160_000,
  },
]

const INVESTMENTS: Row[] = [
  {
    name: 'PEA Boursorama',
    kind: 'brokerage',
    subtitle: 'Boursorama · au 31 oct.',
    value: 1_584_612,
    gain: 204_599,
    rate: 0.148,
  },
  {
    name: 'Assurance vie Linxea',
    kind: 'life',
    subtitle: 'Spirica · au 31 oct.',
    value: 2_341_055,
    gain: 121_040,
    rate: 0.0545,
  },
  {
    name: 'Compte-titres Trade Republic',
    kind: 'brokerage',
    subtitle: 'Trade Republic · au 31 oct.',
    value: 11_234_567,
    gain: 1_234_567,
    rate: 0.1236,
  },
  {
    name: 'Bitcoin Ledger',
    kind: 'crypto',
    subtitle: 'Ledger · au 19 nov.',
    value: 412_000,
    gain: -31_250,
    rate: -0.0705,
  },
  {
    name: 'Épargne salariale',
    kind: 'pee',
    subtitle: 'Amundi · au 30 sept.',
    value: 853_210,
    stale: true,
  },
]

const sum = (rows: Row[]) => rows.reduce((total, row) => total + row.value, 0)

/* ---------------------------------------------------------------------------
 * Formatting (as in the app: cents, then whole euros for B)
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
const pct = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})
const cents = (value: number) => eur.format(value / 100)
const whole = (value: number) => wholeEur.format(Math.round(value / 100))
const signed = (text: string, value: number) => (value > 0 ? `+${text}` : text)

/** The gain's colour, as `chart-delta-*` in the app. */
function tone(value: number) {
  return cn(
    value > 0 && 'text-chart-delta-good',
    value < 0 && 'text-chart-delta-bad',
    value === 0 && 'text-muted-foreground',
  )
}

const STALE = (
  <span className="text-warning-foreground dark:text-warning inline-flex items-center gap-1 font-medium whitespace-nowrap">
    <span aria-hidden className="bg-warning size-1.5 rounded-full" />à mettre à
    jour
  </span>
)

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

/** The app's 22px root, so rem-sized mockups look like the app. */
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

function Badge({ kind }: { kind: Kind }) {
  const { icon: Icon, className } = BADGES[kind]
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-[32px] shrink-0 items-center justify-center rounded-full [&_svg]:size-[16px]',
        className,
      )}
    >
      <Icon />
    </span>
  )
}

/** One row's frame: the whole row is the target, the chevron always last. */
function RowLink({
  kind,
  tight = false,
  children,
}: {
  kind: Kind
  /** D, E, F: 8px between badge, text and chevron, so a 20-character name fits at 375px. */
  tight?: boolean
  children: ReactNode
}) {
  return (
    <li>
      <a
        href="#"
        onClick={(event) => event.preventDefault()}
        className={cn(
          'hover:bg-muted/60 focus-visible:ring-ring flex min-h-11 items-center rounded-lg py-2 text-sm outline-none focus-visible:ring-2',
          tight ? 'gap-2 px-1.5' : 'gap-3 px-2',
        )}
      >
        <Badge kind={kind} />
        {children}
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </a>
    </li>
  )
}

type RowView = (props: { row: Row }) => ReactNode

/** Before: name and subtitle cut, the figures on the right never cut. */
function RowBefore({ row }: { row: Row }) {
  return (
    <RowLink kind={row.kind}>
      <span className="block min-w-0 flex-1">
        <span className="block truncate font-medium">{row.name}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {row.subtitle}
        </span>
      </span>
      <span className="block shrink-0 text-right">
        <span className="block font-medium whitespace-nowrap tabular-nums">
          {cents(row.value)}
        </span>
        <span className="block text-xs whitespace-nowrap tabular-nums">
          {row.stale
            ? STALE
            : row.gain != null && (
                <span className={tone(row.gain)}>
                  {signed(cents(row.gain), row.gain)}
                  {row.rate != null && ` · ${pct.format(row.rate)}`}
                </span>
              )}
        </span>
      </span>
    </RowLink>
  )
}

/** A: the name and the value, then the gain (or the subtitle) under the name. */
function RowA({ row }: { row: Row }) {
  return (
    <RowLink kind={row.kind}>
      <span className="block min-w-0 flex-1">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate font-medium">
            {row.name}
          </span>
          <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
            {cents(row.value)}
          </span>
        </span>
        <span className="text-muted-foreground block truncate text-xs tabular-nums">
          {row.stale ? (
            <>
              {STALE} · {row.subtitle}
            </>
          ) : row.gain != null ? (
            <span className={tone(row.gain)}>
              {signed(cents(row.gain), row.gain)}
              {row.rate != null && ` · ${pct.format(row.rate)}`}
            </span>
          ) : (
            row.subtitle
          )}
        </span>
      </span>
    </RowLink>
  )
}

/** B: as before, in whole euros, the rate alone on the right. */
function RowB({ row }: { row: Row }) {
  return (
    <RowLink kind={row.kind}>
      <span className="block min-w-0 flex-1">
        <span className="block truncate font-medium">{row.name}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {row.subtitle}
        </span>
      </span>
      <span className="block shrink-0 text-right">
        <span className="block font-medium whitespace-nowrap tabular-nums">
          {whole(row.value)}
        </span>
        <span className="block text-xs whitespace-nowrap tabular-nums">
          {row.stale
            ? STALE
            : row.rate != null &&
              row.gain != null && (
                <span className={tone(row.gain)}>{pct.format(row.rate)}</span>
              )}
        </span>
      </span>
    </RowLink>
  )
}

/**
 * C: the app's `ItemListRow` with `stackWhenNarrow` (what was built): on a
 * row under 464px, the name (up to two lines) and its subtitle take the whole
 * width, then the value and the gain flow on lines of their own.
 */
function RowC({ row }: { row: Row }) {
  const { icon: Icon, className } = BADGES[row.kind]
  const detail = row.stale
    ? STALE
    : row.gain != null && (
        <span className={tone(row.gain)}>
          {signed(cents(row.gain), row.gain)}
          {row.rate != null && ` · ${pct.format(row.rate)}`}
        </span>
      )
  return (
    <ItemListRow
      href="#"
      onClick={(event) => event.preventDefault()}
      stackWhenNarrow
      icon={<Icon />}
      iconClassName={className}
      title={row.name}
      subtitle={row.subtitle}
      value={cents(row.value)}
      detail={detail || undefined}
    />
  )
}

/** The value's date in the warning colour: the account is to update. */
function staleDate(row: Row) {
  return (
    <span className="text-warning-foreground dark:text-warning inline-flex items-center gap-1 font-medium whitespace-nowrap">
      <span aria-hidden className="bg-warning size-1.5 rounded-full" />
      {row.subtitle.split(' · ').pop()?.replace(/^au /, '')}
    </span>
  )
}

/** D, E, F: the rate alone in its colour, or the stale date, or nothing. */
function rateOrStale(row: Row) {
  if (row.stale) return staleDate(row)
  if (row.rate == null || row.gain == null) return null
  return (
    <span className={cn('whitespace-nowrap', tone(row.gain))}>
      {pct.format(row.rate)}
    </span>
  )
}

/** D: the name alone on its line, then the value and the rate after it. */
function RowD({ row }: { row: Row }) {
  const detail = rateOrStale(row)
  return (
    <RowLink kind={row.kind} tight>
      <span className="block min-w-0 flex-1">
        <span className="block truncate font-medium">{row.name}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="whitespace-nowrap tabular-nums">
            {cents(row.value)}
          </span>
          {detail && <span className="text-xs tabular-nums">{detail}</span>}
        </span>
      </span>
    </RowLink>
  )
}

/** E: as D, the rate at the end of the line, aligned from row to row. */
function RowE({ row }: { row: Row }) {
  const detail = rateOrStale(row)
  return (
    <RowLink kind={row.kind} tight>
      <span className="block min-w-0 flex-1">
        <span className="block truncate font-medium">{row.name}</span>
        <span className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="text-muted-foreground whitespace-nowrap tabular-nums">
            {cents(row.value)}
          </span>
          {detail && (
            <span className="ml-auto text-xs tabular-nums">{detail}</span>
          )}
        </span>
      </span>
    </RowLink>
  )
}

/** F: the value first, the rate at its end, the name small under it. */
function RowF({ row }: { row: Row }) {
  const detail = rateOrStale(row)
  return (
    <RowLink kind={row.kind} tight>
      <span className="block min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="font-semibold whitespace-nowrap tabular-nums">
            {cents(row.value)}
          </span>
          {detail && (
            <span className="ml-auto text-xs tabular-nums">{detail}</span>
          )}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {row.name}
        </span>
      </span>
    </RowLink>
  )
}

function Group({
  title,
  total,
  rows,
  View,
  totalText,
}: {
  title: string
  total: number
  rows: Row[]
  View: RowView
  totalText: (value: number) => string
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-1">
        <CardTitle>{title}</CardTitle>
        <p className="text-2xl font-semibold whitespace-nowrap tabular-nums">
          {totalText(total)}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-0.5">
          {rows.map((row) => (
            <View key={row.name} row={row} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** The Comptes page's two cards in a phone-wide column. */
function Phone({
  width,
  View,
  totalText = cents,
}: {
  width: number
  View: RowView
  totalText?: (value: number) => string
}) {
  return (
    <div className="shrink-0" style={{ width }}>
      <p className="text-muted-foreground mb-2 px-4 text-xs">{width}px</p>
      <div className="bg-background space-y-4 border-x px-4 py-4">
        <Group
          title="Investissements"
          total={sum(INVESTMENTS)}
          rows={INVESTMENTS}
          View={View}
          totalText={totalText}
        />
        <Group
          title="Liquidités"
          total={sum(CASH)}
          rows={CASH}
          View={View}
          totalText={totalText}
        />
      </div>
    </div>
  )
}

function Widths({
  title,
  description,
  View,
  totalText,
}: {
  title: string
  description: string
  View: RowView
  totalText?: (value: number) => string
}) {
  return (
    <AppScale>
      <div className="bg-muted/40 text-foreground min-h-svh p-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-muted-foreground mb-4 max-w-[40rem] text-xs">
          {description}
        </p>
        <div className="flex gap-6 overflow-x-auto pb-4">
          {[320, 375, 430, 560].map((width) => (
            <Phone
              key={width}
              width={width}
              View={View}
              totalText={totalText}
            />
          ))}
        </div>
      </div>
    </AppScale>
  )
}

export const Avant: StoryObj = {
  name: 'Avant',
  render: () => (
    <Widths
      title="Avant (#262)"
      description="Les montants à droite ne sont jamais coupés : le nom et « institution · date » prennent ce qui reste."
      View={RowBefore}
    />
  ),
}

export const A_GainSousLeNom: StoryObj = {
  name: 'A. Gain sous le nom',
  render: () => (
    <Widths
      title="A. Gain sous le nom"
      description="Le nom et la valeur sur la première ligne ; la plus-value et son taux, en couleur, sur la deuxième à la place de « institution · date » (gardée par les comptes sans plus-value)."
      View={RowA}
    />
  ),
}

export const B_MontantsArrondis: StoryObj = {
  name: 'B. Montants arrondis',
  render: () => (
    <Widths
      title="B. Montants arrondis"
      description="Les deux colonnes d’avant, en euros entiers, et seulement le taux à droite ; la plus-value en euros reste sur la page du compte."
      View={RowB}
      totalText={whole}
    />
  ),
}

export const C_Empile: StoryObj = {
  name: 'C. Empilé sur les lignes étroites',
  render: () => (
    <Widths
      title="C. Empilé sur les lignes étroites"
      description="Sur une ligne étroite (< 464px, tous les téléphones), le nom (sur deux lignes au besoin) et « institution · date » prennent toute la largeur, la valeur et la plus-value passent dessous. Les lignes larges gardent les deux colonnes. C’est la version construite."
      View={RowC}
    />
  ),
}

export const D_NomPuisChiffres: StoryObj = {
  name: 'D. Nom puis chiffres',
  render: () => (
    <Widths
      title="D. Nom puis chiffres"
      description="Deux lignes, pastille centrée : le nom seul en haut, puis la valeur et le taux en couleur. Plus-value en euros et « institution · date » sur la page du compte ; un compte à mettre à jour montre la date de sa valeur en orange."
      View={RowD}
    />
  ),
}

export const E_TauxAligne: StoryObj = {
  name: 'E. Taux aligné',
  render: () => (
    <Widths
      title="E. Taux aligné"
      description="Comme D, la valeur en gris et le taux au bout de la ligne, aligné d’un compte à l’autre."
      View={RowE}
    />
  ),
}

export const F_MontantDabord: StoryObj = {
  name: 'F. Montant d’abord',
  render: () => (
    <Widths
      title="F. Montant d’abord"
      description="La valeur en gras et le taux sur la première ligne, le nom en petit dessous."
      View={RowF}
    />
  ),
}
