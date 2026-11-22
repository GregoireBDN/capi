import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  SegmentedControl,
  SegmentedControlItem,
} from '@finances/ui'
import {
  ArrowLeftRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FileTextIcon,
  FileUpIcon,
  HistoryIcon,
  InfoIcon,
  KeyRoundIcon,
  RepeatIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * Prototypes of lighter account pages (#447): the first screen keeps what
 * is read every time, the rest moves one tap away, in one place shared by
 * every account. Clickable mockups with synthetic data, not app code.
 *
 * What stays on the first screen (a proposal, to confirm):
 * - PEA: the summary (with the ceiling and the 5 years), « Lignes »,
 *   « Évolution ». Moved: « Virements liés », « Relevés de portefeuille »,
 *   « Historique des valeurs ».
 * - Checking: « Solde » (with the month), « Évolution du solde »,
 *   « Dernières opérations ». Moved: « Imports », « Prélèvements »,
 *   « Soldes de relevés ».
 * - Wallet: the summary, « Avoirs », « Évolution ». Moved: « Mouvements »,
 *   « Clés et jetons ».
 *
 * A. Plus d’informations : one row at the end of the page opens a sub-page
 *    (« PEA › Plus d’informations ») with the moved panels one under the
 *    other.
 * B. Onglets : the same sub-page, one panel at a time behind a segmented
 *    control.
 * C. Lignes comme Réglages : the moved panels become rows at the end of the
 *    page (name and what it holds in a few words), each opening its own
 *    screen (full screen on a phone, a centred window on a computer).
 */
const meta: Meta<PageArgs> = {
  title: 'Prototypes/Pages de compte allégées (#447)',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

/* ---------------------------------------------------------------------------
 * Types and synthetic data
 * ------------------------------------------------------------------------- */

type Width = 320 | 390 | 1280
type Direction = 'A' | 'B' | 'C'
type AccountKind = 'pea' | 'courant' | 'wallet'
type View = 'page' | 'details'

interface PageArgs {
  direction: Direction
  compte: AccountKind
  width: Width
  /** What shows first: the account page, or its details already open. */
  vue: View
}

interface Row {
  title: string
  detail?: string
  amount: string
  tone?: 'good' | 'bad' | 'muted'
}

interface Panel {
  id: string
  title: string
  /** Its row's few words in C, and the segment's label in B. */
  summary: string
  short: string
  icon: LucideIcon
  rows: Row[]
  note?: string
}

interface Account {
  name: string
  institution: string
  crumb: string
  first: ReactNode
  panels: Panel[]
}

const PEA_PANELS: Panel[] = [
  {
    id: 'virements',
    title: 'Virements liés',
    short: 'Virements',
    summary: '3 · le dernier le 5 nov.',
    icon: ArrowLeftRightIcon,
    note: 'Les virements de vos comptes vers ce PEA, comptés dans « Investi ».',
    rows: [
      {
        title: 'Depuis Compte courant',
        detail: '5 nov. 2026',
        amount: '+500,00 €',
        tone: 'good',
      },
      {
        title: 'Depuis Compte courant',
        detail: '6 oct. 2026',
        amount: '+500,00 €',
        tone: 'good',
      },
      {
        title: 'Depuis Livret A',
        detail: '2 sept. 2026',
        amount: '+1 200,00 €',
        tone: 'good',
      },
    ],
  },
  {
    id: 'releves',
    title: 'Relevés de portefeuille',
    short: 'Relevés',
    summary: '6 · au 31 oct.',
    icon: FileTextIcon,
    rows: [
      {
        title: '31 oct. 2026',
        detail: '3 lignes · liquidités 482,24 €',
        amount: '33 812,40 €',
      },
      {
        title: '30 sept. 2026',
        detail: '3 lignes · liquidités 391,10 €',
        amount: '33 396,64 €',
      },
      {
        title: '31 août 2026',
        detail: '3 lignes · liquidités 391,10 €',
        amount: '32 908,02 €',
      },
    ],
  },
  {
    id: 'valeurs',
    title: 'Historique des valeurs',
    short: 'Valeurs',
    summary: '15 valeurs',
    icon: HistoryIcon,
    rows: [
      {
        title: '31 oct. 2026',
        detail: 'D’après vos lignes',
        amount: '33 812,40 €',
      },
      {
        title: '30 sept. 2026',
        detail: 'D’après vos lignes',
        amount: '33 396,64 €',
      },
      { title: '31 août 2026', detail: 'Relevé T3', amount: '32 908,02 €' },
    ],
  },
]

const COURANT_PANELS: Panel[] = [
  {
    id: 'imports',
    title: 'Imports',
    short: 'Imports',
    summary: 'à jour au 11 nov.',
    icon: FileUpIcon,
    rows: [
      {
        title: '20 ajoutées',
        detail: 'le 12 nov. · jusqu’au 11 nov.',
        amount: '',
      },
      {
        title: '34 ajoutées',
        detail: 'le 4 oct. · jusqu’au 3 oct.',
        amount: '',
      },
      {
        title: 'Entre le 10 et le 14 oct.',
        detail: 'opérations manquantes',
        amount: '−42,00 €',
        tone: 'bad',
      },
    ],
  },
  {
    id: 'prelevements',
    title: 'Prélèvements',
    short: 'Prélèvements',
    summary: '4 · 121,96 € / mois',
    icon: RepeatIcon,
    rows: [
      {
        title: 'Box internet',
        detail: 'prévu le 12 nov.',
        amount: '29,99 € / mois',
      },
      {
        title: 'Téléphone',
        detail: 'prévu le 18 nov.',
        amount: '14,99 € / mois',
      },
      {
        title: 'Assurance habitation',
        detail: 'prévu le 2 déc.',
        amount: '18,50 € / mois',
      },
    ],
  },
  {
    id: 'valeurs',
    title: 'Soldes de relevés',
    short: 'Soldes',
    summary: '1 solde',
    icon: HistoryIcon,
    note: 'Le solde indiqué sur un relevé, à sa date.',
    rows: [{ title: '31 déc. 2024', amount: '3 204,18 €' }],
  },
]

const WALLET_PANELS: Panel[] = [
  {
    id: 'mouvements',
    title: 'Mouvements',
    short: 'Mouvements',
    summary: '5 · le dernier le 2 nov.',
    icon: ArrowLeftRightIcon,
    rows: [
      {
        title: '0,05 BTC depuis Plateforme',
        detail: '2 nov. 2026',
        amount: 'coût 2 910,00 €',
        tone: 'muted',
      },
      {
        title: '0,4 ETH depuis Plateforme',
        detail: '14 oct. 2026',
        amount: 'coût 980,00 €',
        tone: 'muted',
      },
      {
        title: '0,02 BTC depuis Plateforme',
        detail: '3 sept. 2026',
        amount: 'coût 1 120,00 €',
        tone: 'muted',
      },
    ],
  },
  {
    id: 'cles',
    title: 'Clés et jetons',
    short: 'Clés',
    summary: '2 clés · 1 jeton',
    icon: KeyRoundIcon,
    rows: [
      { title: 'zpub6rFR…GutZYs', detail: '4 adresses utilisées', amount: '' },
      { title: '0x5aAe…eAeD', detail: 'Ethereum, Arbitrum', amount: '' },
      { title: 'Jetons lus', detail: 'USDC', amount: '' },
    ],
  },
]

/* ---------------------------------------------------------------------------
 * Shared pieces of the first screen
 * ------------------------------------------------------------------------- */

const toneClass = (tone?: Row['tone']) =>
  tone === 'good'
    ? 'text-chart-delta-good'
    : tone === 'bad'
      ? 'text-destructive'
      : tone === 'muted'
        ? 'text-muted-foreground'
        : undefined

function Sparkline({ up = true }: { up?: boolean }) {
  const points = up
    ? '0,70 40,62 80,66 120,52 160,48 200,40 240,44 280,30 320,26 360,18 400,14'
    : '0,30 40,38 80,20 120,44 160,36 200,52 240,28 280,46 320,34 360,40 400,22'
  return (
    <svg viewBox="0 0 400 80" className="text-primary h-24 w-full" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function SimpleCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

function Figure({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: Row['tone']
}) {
  return (
    <div className="bg-muted/60 min-w-0 rounded-md p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          'font-semibold whitespace-nowrap tabular-nums',
          toneClass(tone),
        )}
      >
        {value}
      </p>
      {sub && (
        <p className={cn('text-xs tabular-nums', toneClass(tone))}>{sub}</p>
      )}
    </div>
  )
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-border divide-y">
      {rows.map((row, i) => (
        <li
          key={i}
          className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm"
        >
          <div className="min-w-[6rem] flex-1">
            <p className="font-medium">{row.title}</p>
            {row.detail && (
              <p className="text-muted-foreground text-xs">{row.detail}</p>
            )}
          </div>
          {row.amount && (
            <p
              className={cn(
                'ml-auto font-medium whitespace-nowrap tabular-nums',
                toneClass(row.tone),
              )}
            >
              {row.amount}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

function PeaFirst() {
  return (
    <>
      <SimpleCard title="Valeur au 31 oct.">
        <p className="text-3xl font-semibold tabular-nums">33 812,40 €</p>
        <p className="text-chart-delta-good text-sm">+415,76 € en un mois</p>
        <div className="bg-muted/60 space-y-2 rounded-md p-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Investi</span>
            <span className="font-semibold tabular-nums">30 400 €</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full">
            <span className="bg-muted-foreground/40" style={{ width: '90%' }} />
            <span className="bg-chart-delta-good" style={{ width: '10%' }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Figure label="Résultat" value="+3 412 €" sub="+11,2 %" tone="good" />
          <Figure label="Sur 1 an" value="+3 980 €" sub="+13,3 %" tone="good" />
        </div>
      </SimpleCard>
      <SimpleCard title="Lignes">
        <Rows
          rows={[
            {
              title: 'ETF Monde Exemple',
              detail: '62 % · +14,1 %',
              amount: '20 663 €',
            },
            {
              title: 'ETF Europe Exemple',
              detail: '25 % · +6,3 %',
              amount: '8 497 €',
            },
            {
              title: 'ETF Émergents Exemple',
              detail: '12 % · +2,0 %',
              amount: '4 170 €',
            },
            { title: 'Liquidités', amount: '482,24 €' },
          ]}
        />
      </SimpleCard>
      <SimpleCard title="Évolution">
        <Sparkline />
      </SimpleCard>
    </>
  )
}

function CourantFirst() {
  return (
    <>
      <SimpleCard title="Solde">
        <p className="text-3xl font-semibold tabular-nums">4 916,94 €</p>
        <p className="text-muted-foreground text-sm">
          À jour au 11 nov. · importé il y a 9 jours
        </p>
        <div className="grid grid-cols-1 gap-2 @md:grid-cols-3">
          <Figure label="Entrées" value="+2 500,00 €" tone="good" />
          <Figure label="Sorties" value="−1 956,79 €" />
          <Figure label="Variation" value="+543,21 €" tone="good" />
        </div>
      </SimpleCard>
      <SimpleCard title="Évolution du solde">
        <Sparkline up={false} />
      </SimpleCard>
      <SimpleCard title="Dernières opérations">
        <Rows
          rows={[
            {
              title: 'Supermarché Exemple',
              detail: 'Courses · 10 nov.',
              amount: '−62,40 €',
            },
            {
              title: 'Salaire Exemple',
              detail: 'Salaire · 2 nov.',
              amount: '+2 500,00 €',
              tone: 'good',
            },
            {
              title: 'Boulangerie',
              detail: 'Restaurants · 1 nov.',
              amount: '−8,20 €',
            },
          ]}
        />
      </SimpleCard>
    </>
  )
}

function WalletFirst() {
  return (
    <>
      <SimpleCard title="Valeur du wallet">
        <p className="text-3xl font-semibold tabular-nums">7 214,08 €</p>
        <p className="text-chart-delta-good text-sm">+86,12 € depuis hier</p>
        <div className="grid grid-cols-2 gap-2">
          <Figure label="Résultat" value="+2 204 €" sub="+44,0 %" tone="good" />
          <Figure label="Sur 1 an" value="+1 980 €" sub="+37,8 %" tone="good" />
        </div>
      </SimpleCard>
      <SimpleCard title="Avoirs">
        <Rows
          rows={[
            { title: 'Bitcoin', detail: '0,07 BTC · 81 %', amount: '5 842 €' },
            { title: 'Ethereum', detail: '0,4 ETH · 19 %', amount: '1 372 €' },
          ]}
        />
      </SimpleCard>
      <SimpleCard title="Évolution">
        <Sparkline />
      </SimpleCard>
    </>
  )
}

const ACCOUNTS: Record<AccountKind, Account> = {
  pea: {
    name: 'PEA',
    institution: 'Banque Exemple',
    crumb: 'PEA',
    first: <PeaFirst />,
    panels: PEA_PANELS,
  },
  courant: {
    name: 'Compte courant',
    institution: 'Banque Exemple',
    crumb: 'Compte courant',
    first: <CourantFirst />,
    panels: COURANT_PANELS,
  },
  wallet: {
    name: 'Ledger',
    institution: 'Wallet crypto',
    crumb: 'Wallet crypto',
    first: <WalletFirst />,
    panels: WALLET_PANELS,
  },
}

/** A moved panel, as it reads once opened. */
function PanelCard({ panel, bare = false }: { panel: Panel; bare?: boolean }) {
  const body = (
    <>
      {panel.note && (
        <p className="text-muted-foreground text-sm">{panel.note}</p>
      )}
      <Rows rows={panel.rows} />
    </>
  )
  if (bare) return <div className="space-y-3">{body}</div>
  return <SimpleCard title={panel.title}>{body}</SimpleCard>
}

/* ---------------------------------------------------------------------------
 * The frame: header, sidebar on a computer, the page's title
 * ------------------------------------------------------------------------- */

function Frame({
  width,
  back,
  crumbs,
  title,
  description,
  children,
  overlay,
}: {
  width: Width
  back: string
  crumbs: string[]
  title: string
  description?: string
  children: ReactNode
  overlay?: ReactNode
}) {
  const computer = width >= 768
  return (
    <div
      className="bg-background text-foreground relative mx-auto min-h-screen overflow-hidden border-x"
      style={{ width }}
    >
      <header className="bg-background sticky top-0 z-10 flex h-12 items-center gap-2 border-b px-3">
        {computer && (
          <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md text-xs font-bold">
            F
          </span>
        )}
        {computer ? (
          <span className="text-muted-foreground text-sm">
            {crumbs.map((crumb, i) => (
              <span key={crumb}>
                {i > 0 && ' › '}
                <span
                  className={cn(i === crumbs.length - 1 && 'text-foreground')}
                >
                  {crumb}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-primary inline-flex items-center gap-0.5 text-sm">
            <ChevronLeftIcon className="size-4" aria-hidden /> {back}
          </span>
        )}
        <span className="ml-auto">
          <Button iconOnly variant="secondary" aria-label="Actions de la page">
            <EllipsisVerticalIcon />
          </Button>
        </span>
        <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-full text-xs font-semibold">
          CD
        </span>
      </header>
      <div className="flex">
        {computer && (
          <nav
            aria-hidden
            className="bg-sidebar text-muted-foreground w-56 shrink-0 space-y-1 border-r p-3 text-sm"
          >
            {[
              'Tableau de bord',
              'Mouvements',
              'Budget',
              'Bilan du mois',
              'Abonnements',
            ].map((item) => (
              <p key={item} className="px-2 py-1.5">
                {item}
              </p>
            ))}
            <p className="bg-primary/10 text-primary rounded-md px-2 py-1.5 font-medium">
              Comptes
            </p>
            {['Épargne', 'Crypto', 'Dépenses partagées'].map((item) => (
              <p key={item} className="px-2 py-1.5">
                {item}
              </p>
            ))}
          </nav>
        )}
        <main
          className={cn(
            '@container min-w-0 flex-1 space-y-6',
            computer ? 'p-6' : 'px-4 py-4',
          )}
        >
          <div>
            <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
            {description && (
              <p className="text-muted-foreground text-sm">{description}</p>
            )}
          </div>
          {children}
        </main>
      </div>
      {overlay}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * A and B: « Plus d'informations › » opening a sub-page
 * ------------------------------------------------------------------------- */

function MoreRow({
  account,
  onOpen,
}: {
  account: Account
  onOpen: () => void
}) {
  return (
    <Card size="sm" className="min-w-0 p-0">
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-muted/60 flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left"
      >
        <InfoIcon
          className="text-muted-foreground size-5 shrink-0"
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Plus d’informations</span>
          <span className="text-muted-foreground block text-sm">
            {account.panels.map((panel) => panel.title).join(', ')}
          </span>
        </span>
        <ChevronRightIcon
          className="text-muted-foreground size-5 shrink-0"
          aria-hidden
        />
      </button>
    </Card>
  )
}

function DetailsTabs({ account }: { account: Account }) {
  const [tab, setTab] = useState(account.panels[0].id)
  useEffect(() => setTab(account.panels[0].id), [account])
  const panel = account.panels.find((p) => p.id === tab) ?? account.panels[0]
  return (
    <div className="space-y-4">
      <SegmentedControl
        value={tab}
        onValueChange={setTab}
        fullWidth
        aria-label="Informations"
      >
        {account.panels.map((p) => (
          <SegmentedControlItem key={p.id} value={p.id}>
            {p.short}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <PanelCard panel={panel} />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * C: rows like Réglages, each opening its own screen
 * ------------------------------------------------------------------------- */

function SettingsRows({
  account,
  onOpen,
}: {
  account: Account
  onOpen: (panel: Panel) => void
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Plus d’informations</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="bg-muted/60 divide-border divide-y overflow-hidden rounded-md">
          {account.panels.map((panel) => (
            <li key={panel.id}>
              <button
                type="button"
                onClick={() => onOpen(panel)}
                className="hover:bg-muted flex min-h-11 w-full flex-wrap items-center gap-x-3 px-3 py-2 text-left text-sm"
              >
                <panel.icon
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <span className="font-medium break-normal">{panel.title}</span>
                <span className="text-muted-foreground ml-auto min-w-0 truncate">
                  {panel.summary}
                </span>
                <ChevronRightIcon
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** One panel's screen: the whole frame on a phone, a centred window on a computer. */
function PanelScreen({
  panel,
  width,
  onClose,
}: {
  panel: Panel
  width: Width
  onClose: () => void
}) {
  const computer = width >= 768
  const bar = (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <Button
        iconOnly
        variant="secondary"
        className="rounded-full"
        aria-label="Fermer"
        onClick={onClose}
      >
        <XIcon />
      </Button>
      <p className="flex-1 text-center font-semibold">{panel.title}</p>
      <span className="size-9" />
    </div>
  )
  const body = (
    <div className="px-4 py-4">
      <PanelCard panel={panel} bare />
    </div>
  )
  if (!computer)
    return (
      <div
        role="dialog"
        aria-label={panel.title}
        className="bg-background absolute inset-0 z-20"
      >
        {bar}
        {body}
      </div>
    )
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/40 p-6">
      <div
        role="dialog"
        aria-label={panel.title}
        className="bg-background w-full max-w-lg rounded-xl shadow-lg"
      >
        {bar}
        {body}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * The page
 * ------------------------------------------------------------------------- */

function Page({ direction, compte, width, vue }: PageArgs) {
  const account = ACCOUNTS[compte]
  const [details, setDetails] = useState(vue === 'details')
  const [panel, setPanel] = useState<Panel | null>(
    vue === 'details' && direction === 'C' ? account.panels[0] : null,
  )
  useEffect(() => {
    setDetails(vue === 'details')
    setPanel(vue === 'details' && direction === 'C' ? account.panels[0] : null)
  }, [vue, direction, account])

  if (direction !== 'C' && details)
    return (
      <Frame
        width={width}
        back={account.name}
        crumbs={['Comptes', account.name, 'Plus d’informations']}
        title="Plus d’informations"
        description={account.name}
      >
        <button
          type="button"
          onClick={() => setDetails(false)}
          className="text-primary -mt-4 inline-flex min-h-11 items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="size-4" aria-hidden /> Retour au compte
          (maquette)
        </button>
        {direction === 'A' ? (
          account.panels.map((p) => <PanelCard key={p.id} panel={p} />)
        ) : (
          <DetailsTabs account={account} />
        )}
      </Frame>
    )

  return (
    <Frame
      width={width}
      back="Comptes"
      crumbs={['Comptes', account.crumb]}
      title={account.name}
      description={account.institution}
      overlay={
        panel && (
          <PanelScreen
            panel={panel}
            width={width}
            onClose={() => setPanel(null)}
          />
        )
      }
    >
      {account.first}
      {direction === 'C' ? (
        <SettingsRows account={account} onOpen={setPanel} />
      ) : (
        <MoreRow account={account} onOpen={() => setDetails(true)} />
      )}
    </Frame>
  )
}

const argTypes = {
  direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
  compte: { control: 'inline-radio', options: ['pea', 'courant', 'wallet'] },
  width: { control: 'inline-radio', options: [320, 390, 1280] },
  vue: { control: 'inline-radio', options: ['page', 'details'] },
} as const

/**
 * One page: the direction, the account (a PEA, a checking account, a
 * wallet), the width, and whether the details show already open. Tap
 * « Plus d’informations » (A, B) or a row (C) to open them.
 */
export const UnePage: StoryObj<PageArgs> = {
  name: 'Une page',
  args: { direction: 'A', compte: 'pea', width: 390, vue: 'page' },
  argTypes,
  render: (args) => <Page {...args} />,
}

const LABELS: Record<Direction, string> = {
  A: 'A. Plus d’informations',
  B: 'B. Onglets',
  C: 'C. Lignes comme Réglages',
}

/** A, B and C at 390px, side by side, on the page or with the details open. */
export const CoteACote: StoryObj<PageArgs> = {
  name: 'Côte à côte',
  args: { compte: 'pea', vue: 'page' },
  argTypes: { compte: argTypes.compte, vue: argTypes.vue },
  render: ({ compte, vue }) => (
    <div className="flex items-start gap-6 p-6">
      {(['A', 'B', 'C'] as const).map((direction) => (
        <div key={direction} className="space-y-2">
          <p className="text-muted-foreground text-sm font-medium">
            {LABELS[direction]}
          </p>
          <Page direction={direction} compte={compte} width={390} vue={vue} />
        </div>
      ))}
    </div>
  ),
}
