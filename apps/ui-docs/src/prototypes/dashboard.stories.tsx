import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  ItemList,
  ItemListGroup,
  ItemListRow,
  PeriodStepper,
  PeriodStepperLabel,
  ProgressMeter,
  formatWholeEuros,
} from '@finances/ui'
import {
  ArrowLeftRightIcon,
  CalendarClockIcon,
  ChartCandlestickIcon,
  ChevronRightIcon,
  ShoppingCartIcon,
  TrainFrontIcon,
  UtensilsIcon,
  ListChecksIcon,
  PiggyBankIcon,
  PlusIcon,
  UmbrellaIcon,
  WalletIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * Prototypes of the dashboard rework (#262): three directions shown to the
 * owner before one is built in `apps/web`. Clickable mockups with synthetic
 * data, not app code: the month arrows and the buttons do nothing.
 *
 * The chips at the top switch the reviewed month between the cases the
 * audit lists: open with an account to update, closed, without investments
 * (the change of net worth equals what was saved), without a budget.
 *
 * A. Tuiles : the navigator heads the review card, the month's flow as three
 *    tiles, one action chosen from the month's state.
 * B. Relevé : the review reads like a statement, label and value side by
 *    side in a narrow column, net worth as its last line.
 * C. Trois questions : « Le mois dernier », « Ce mois-ci », « Où j'en suis » —
 *    net worth only in the last card, with its date and its chart.
 */
const meta: Meta = {
  title: 'Prototypes/Dashboard (#262)',
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

interface Review {
  /** « Octobre 2026 » */
  label: string
  short: string
  /** « 31 oct. » */
  end: string
  closed: boolean
  /** The next month already has its budget. */
  nextHasBudget: boolean
  netWorthEnd: number
  /** Saved = income + expenses (expenses negative). */
  income: number
  expenses: number
  /** Investments and anything else; 0 when nothing moved. */
  other: number
  budget: {
    spent: number
    target: number
    unbudgeted: number
    drift: { name: string; color: string; gap: number }[]
  } | null
  missing: { name: string; date: string; cash: boolean }[]
}

const OPEN: Review = {
  label: 'Octobre 2026',
  short: 'oct. 2026',
  end: '31 oct.',
  closed: false,
  nextHasBudget: true,
  netWorthEnd: 4_741_100,
  income: 320_000,
  expenses: -251_400,
  other: 11_800,
  budget: {
    spent: 207_100,
    target: 222_500,
    unbudgeted: 44_300,
    drift: [
      { name: 'Transport', color: '#3b82f6', gap: 6_800 },
      { name: 'Restaurants & cafés', color: '#eab308', gap: 1_000 },
      { name: 'Courses', color: '#f97316', gap: -8_200 },
    ],
  },
  missing: [{ name: 'PEA', date: '30 sept.', cash: false }],
}

const SCENARIOS = {
  open: { title: 'Mois ouvert', review: OPEN },
  closed: {
    title: 'Clôturé',
    review: {
      ...OPEN,
      label: 'Septembre 2026',
      short: 'sept. 2026',
      end: '30 sept.',
      closed: true,
      nextHasBudget: false,
      missing: [],
    },
  },
  noInvestments: {
    title: 'Sans placements',
    review: { ...OPEN, other: 0, missing: [] },
  },
  noBudget: {
    title: 'Sans budget',
    review: { ...OPEN, budget: null, missing: [] },
  },
} satisfies Record<string, { title: string; review: Review }>

type ScenarioKey = keyof typeof SCENARIOS

const ENVELOPES = [
  { name: 'Courses', spent: 7_589, target: 50_000, pace: 30_000 },
  { name: 'Restaurants & cafés', spent: 2_767, target: 18_000, pace: 10_800 },
  { name: 'Transport', spent: 0, target: 15_000, pace: 9_000 },
]

const ACCOUNTS = [
  {
    group: 'Liquidités',
    total: 1_426_379,
    rows: [
      {
        name: 'Compte courant',
        sub: 'Banque A · au 8 nov.',
        value: 344_529,
        icon: <WalletIcon />,
        tone: 'bg-chart-1/15 text-chart-1',
      },
      {
        name: 'Livret A',
        sub: 'Banque A · au 28 oct.',
        value: 1_081_850,
        icon: <PiggyBankIcon />,
        tone: 'bg-chart-3/15 text-chart-3',
      },
    ],
  },
  {
    group: 'Placements',
    total: 3_477_325,
    rows: [
      {
        name: 'PEA',
        sub: 'Courtier B · au 30 sept.',
        value: 1_543_023,
        stale: true,
        icon: <ChartCandlestickIcon />,
        tone: 'bg-chart-7/15 text-chart-7',
      },
      {
        name: 'Assurance vie',
        sub: 'Assureur C · au 31 oct.',
        value: 822_665,
        icon: <UmbrellaIcon />,
        tone: 'bg-chart-5/15 text-chart-5',
      },
    ],
  },
]

const TODAY_NET_WORTH = 4_903_704

/* ---------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------- */

const signed = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})
const euros = (cents: number) => formatWholeEuros(cents)
const signedEuros = (cents: number) => signed.format(cents / 100)
const percent = (ratio: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio)

const saved = (review: Review) => review.income + review.expenses
const change = (review: Review) => saved(review) + review.other

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

const CHIP = cn(
  'border-input inline-flex h-11 shrink-0 items-center rounded-full border px-3',
  'text-sm font-medium whitespace-nowrap transition-colors',
  'data-[on=true]:border-primary data-[on=true]:bg-primary/10 data-[on=true]:text-primary',
)

/** The prototype's own control (not part of the design): the case shown. */
function ScenarioChips({
  value,
  onChange,
}: {
  value: ScenarioKey
  onChange: (value: ScenarioKey) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Cas"
      className="bg-muted/60 -mx-4 flex gap-2 overflow-x-auto px-4 py-2"
    >
      {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          data-on={value === key}
          className={CHIP}
          onClick={() => onChange(key)}
        >
          {SCENARIOS[key].title}
        </button>
      ))}
    </div>
  )
}

/** The page, as in the app: title, then the cards. */
function Page({
  title,
  children,
  scenario,
  onScenario,
}: {
  title: string
  children: ReactNode
  scenario: ScenarioKey
  onScenario: (value: ScenarioKey) => void
}) {
  return (
    <AppScale>
      <div className="bg-background min-h-svh px-4 pb-10">
        <ScenarioChips value={scenario} onChange={onScenario} />
        <div className="@container mx-auto max-w-[80rem] space-y-6 pt-4">
          <div>
            <p className="text-muted-foreground text-xs">{title}</p>
            <h1 className="text-xl font-semibold md:text-2xl">
              Tableau de bord
            </h1>
          </div>
          {children}
        </div>
      </div>
    </AppScale>
  )
}

/** The month navigator (#263) with the month's status beside it. */
function MonthHeader({ review }: { review: Review }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <PeriodStepper
        aria-label="Mois du bilan"
        previous={{ label: 'Mois précédent', onClick: () => {} }}
        next={{
          label: 'Mois suivant',
          onClick: () => {},
          disabled: !review.closed,
        }}
      >
        <PeriodStepperLabel
          aria-label={`${review.label}, choisir un mois`}
          text={review.label}
          shortText={review.short}
          sizers={['Septembre 2026', 'Octobre 2026']}
          shortSizers={['sept. 2026', 'oct. 2026']}
        />
      </PeriodStepper>
      <Badge variant={review.closed ? 'success' : 'warning'} outline>
        {review.closed ? 'Clôturé' : 'À clôturer'}
      </Badge>
    </div>
  )
}

/** One header for every card: title, optional status, one « Voir … » link. */
function CardHead({
  title,
  status,
  link,
}: {
  title: ReactNode
  status?: ReactNode
  link?: string
}) {
  return (
    <CardHeader className="flex flex-row items-start gap-x-3">
      <div className="min-w-0 flex-1">
        <CardTitle>{title}</CardTitle>
        {status && (
          <p className="text-muted-foreground mt-0.5 text-sm">{status}</p>
        )}
      </div>
      {link && <SeeLink label={link} />}
    </CardHeader>
  )
}

function SeeLink({ label }: { label: string }) {
  return (
    <a
      href="#"
      onClick={(event) => event.preventDefault()}
      className="text-muted-foreground hover:text-foreground relative inline-flex shrink-0 items-center gap-0.5 text-sm font-medium whitespace-nowrap pointer-coarse:touch-hitbox"
    >
      {label}
      <ChevronRightIcon aria-hidden className="size-4" />
    </a>
  )
}

/**
 * The one action of the review card, chosen from the month's state; the
 * month is not named again (the navigator says it).
 */
function ReviewAction({ review }: { review: Review }) {
  if (!review.closed) {
    return (
      <Button iconStart={<ListChecksIcon />} className="w-fit">
        Revue et clôture
      </Button>
    )
  }
  if (!review.nextHasBudget) {
    return (
      <Button outline variant="secondary" className="w-fit">
        Préparer le budget du mois suivant
      </Button>
    )
  }
  return <SeeLink label="Revoir le mois" />
}

/** Accounts not updated up to the month end: one target each. */
function Missing({ review }: { review: Review }) {
  if (review.missing.length === 0) return null
  return (
    <div className="bg-warning/10 rounded-lg p-2">
      <p className="text-warning-foreground dark:text-warning px-2 pt-1 text-sm font-medium">
        À mettre à jour avant de clôturer
      </p>
      <ItemList>
        <ItemListGroup>
          {review.missing.map((account) => (
            <ItemListRow
              key={account.name}
              href="#"
              title={account.name}
              subtitle={`Valeur au ${account.date} · ${account.cash ? 'importer un relevé' : 'mettre à jour'}`}
            />
          ))}
        </ItemListGroup>
      </ItemList>
    </div>
  )
}

/** Spending against the budget, label and figures stacked. */
function BudgetBlock({ review }: { review: Review }) {
  const { budget } = review
  if (!budget) {
    return (
      <p className="text-muted-foreground text-sm">
        Pas de budget fixé pour ce mois.
      </p>
    )
  }
  const left = budget.target - budget.spent
  return (
    <div className="space-y-2">
      <ProgressMeter
        label="Budget"
        value={budget.spent}
        target={budget.target}
        valueFormatter={formatWholeEuros}
        hideStatus
      />
      <p className="text-sm">
        <span className={cn('font-medium', left < 0 && 'text-chart-delta-bad')}>
          {left < 0 ? `Dépassé de ${euros(-left)}` : `Reste ${euros(left)}`}
        </span>
        {budget.unbudgeted > 0 && (
          <span className="text-muted-foreground">
            {' '}
            · {euros(budget.unbudgeted)} hors budget
          </span>
        )}
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Écarts au budget">
        {budget.drift.map((item) => (
          <li key={item.name}>
            <a
              href="#"
              onClick={(event) => event.preventDefault()}
              className="bg-muted/60 hover:bg-muted inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm"
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
              <span
                className={cn(
                  'font-medium whitespace-nowrap tabular-nums',
                  item.gap > 0
                    ? 'text-chart-delta-bad'
                    : 'text-chart-delta-good',
                )}
              >
                {item.gap > 0 ? `+${euros(item.gap)}` : `−${euros(-item.gap)}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** « Ce mois-ci »: envelopes, one target per row, one primary action. */
function EnvelopesCard() {
  return (
    <Card className="min-w-0">
      <CardHead title="Ce mois-ci" status="jour 18 sur 30" link="Budget" />
      <CardContent className="space-y-3">
        <ul className="space-y-1">
          {ENVELOPES.map((item) => (
            <li key={item.name}>
              <a
                href="#"
                onClick={(event) => event.preventDefault()}
                className="hover:bg-muted/60 -mx-2 block space-y-1 rounded-lg px-2 py-2"
              >
                <ProgressMeter
                  label={item.name}
                  value={item.spent}
                  target={item.target}
                  valueFormatter={formatWholeEuros}
                  hideStatus
                  marker={{ value: item.pace, label: 'rythme du mois' }}
                />
                <span className="text-muted-foreground block text-xs">
                  Reste {euros(item.target - item.spent)}
                </span>
              </a>
            </li>
          ))}
        </ul>
        <Button iconStart={<PlusIcon />} className="w-fit">
          Ajouter une dépense
        </Button>
      </CardContent>
    </Card>
  )
}

function AccountRows() {
  return (
    <ItemList>
      {ACCOUNTS.map((group) => (
        <ItemListGroup
          key={group.group}
          title={group.group}
          total={euros(group.total)}
        >
          {group.rows.map((row) => (
            <ItemListRow
              key={row.name}
              href="#"
              icon={row.icon}
              iconClassName={row.tone}
              title={row.name}
              subtitle={row.sub}
              value={euros(row.value)}
              detail={
                'stale' in row && row.stale ? (
                  <span className="text-warning-foreground dark:text-warning font-medium">
                    ● à mettre à jour
                  </span>
                ) : undefined
              }
            />
          ))}
        </ItemListGroup>
      ))}
    </ItemList>
  )
}

function ForecastCard() {
  return (
    <Card size="sm" className="min-w-0">
      <CardHead title="Fin de mois" link="Prévision" />
      <CardContent className="space-y-1">
        <p className="text-muted-foreground text-sm">Solde prévu au 30 nov.</p>
        <p className="text-2xl font-semibold tabular-nums">5 561 €</p>
        <p className="text-muted-foreground text-sm">
          Point bas 2 729 € le 26 nov. · indicatif, relevés au 8 nov.
        </p>
      </CardContent>
    </Card>
  )
}

/** Chart placeholder: the charts themselves are not part of the prototype. */
function ChartStub({ title, link }: { title: string; link?: string }) {
  return (
    <Card className="min-w-0">
      <CardHead title={title} link={link} />
      <CardContent>
        <div className="bg-muted/60 text-muted-foreground flex h-40 items-center justify-center rounded-lg text-sm">
          graphique
        </div>
      </CardContent>
    </Card>
  )
}

/** A figure with its label right above it. */
function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'good' | 'bad'
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          'text-[clamp(1rem,6cqi,1.3rem)] font-semibold whitespace-nowrap tabular-nums',
          tone === 'good' && 'text-chart-delta-good',
          tone === 'bad' && 'text-chart-delta-bad',
        )}
      >
        {value}
      </p>
      {note && (
        <p className="text-muted-foreground text-xs whitespace-nowrap">
          {note}
        </p>
      )}
    </div>
  )
}

function useScenario() {
  return useState<ScenarioKey>('open')
}

/* ---------------------------------------------------------------------------
 * A. Tuiles
 * ------------------------------------------------------------------------- */

function ReviewTiles({ review }: { review: Review }) {
  const rate = review.income > 0 ? saved(review) / review.income : null
  return (
    <Card className="min-w-0">
      <CardHeader>
        <MonthHeader review={review} />
      </CardHeader>
      <CardContent className="space-y-5">
        <Missing review={review} />
        <div className="@container grid grid-cols-3 gap-3">
          <Figure label="Revenus" value={euros(review.income)} />
          <Figure label="Dépenses" value={euros(-review.expenses)} />
          <Figure
            label="Épargné"
            value={signedEuros(saved(review))}
            note={rate === null ? undefined : `${percent(rate)}`}
            tone={saved(review) >= 0 ? 'good' : 'bad'}
          />
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            Patrimoine au {review.end}
          </p>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-semibold tabular-nums">
              {euros(review.netWorthEnd)}
            </span>
            {/* Without investments the change is what was saved: once. */}
            {review.other !== 0 && (
              <span className="text-muted-foreground text-sm">
                {signedEuros(change(review))} sur le mois, dont{' '}
                {signedEuros(review.other)} de placements
              </span>
            )}
          </p>
        </div>
        <BudgetBlock review={review} />
        <ReviewAction review={review} />
      </CardContent>
    </Card>
  )
}

export const A_Tuiles: StoryObj = {
  name: 'A. Tuiles',
  render: function Render() {
    const [scenario, setScenario] = useScenario()
    const review = SCENARIOS[scenario].review
    return (
      <Page title="A. Tuiles" scenario={scenario} onScenario={setScenario}>
        <div className="grid items-start gap-4 @[48rem]:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <ReviewTiles review={review} />
            <ForecastCard />
          </div>
          <div className="min-w-0 space-y-4">
            <EnvelopesCard />
            <Card className="min-w-0">
              <CardHead
                title="Comptes"
                status={`Patrimoine ${euros(TODAY_NET_WORTH)} aujourd’hui`}
                link="Évolution"
              />
              <CardContent>
                <AccountRows />
              </CardContent>
            </Card>
          </div>
        </div>
        <ChartStub title="Revenus et dépenses" />
      </Page>
    )
  },
}

/* ---------------------------------------------------------------------------
 * B. Relevé
 * ------------------------------------------------------------------------- */

function Line({
  label,
  value,
  note,
  strong,
  tone,
}: {
  label: string
  value: string
  note?: string
  strong?: boolean
  tone?: 'good' | 'bad'
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 py-1">
      <dt className={cn('min-w-[7rem] flex-1', strong && 'font-medium')}>
        {label}
        {note && (
          <span className="text-muted-foreground block text-xs">{note}</span>
        )}
      </dt>
      <dd
        className={cn(
          'ml-auto whitespace-nowrap tabular-nums',
          strong && 'text-lg font-semibold',
          tone === 'good' && 'text-chart-delta-good',
          tone === 'bad' && 'text-chart-delta-bad',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function ReviewStatement({ review }: { review: Review }) {
  const rate = review.income > 0 ? saved(review) / review.income : null
  const budget = review.budget
  return (
    <Card className="min-w-0">
      <CardHeader>
        <MonthHeader review={review} />
      </CardHeader>
      <CardContent className="space-y-5">
        <Missing review={review} />
        {/* A narrow column: each label stays close to its value. */}
        <dl className="max-w-[26rem] text-sm">
          <Line label="Revenus" value={euros(review.income)} />
          <Line
            label="Dépenses"
            value={`−${euros(-review.expenses)}`}
            note={
              budget
                ? `${euros(budget.spent)} sur ${euros(budget.target)} budgétés · ${euros(budget.unbudgeted)} hors budget`
                : 'pas de budget fixé'
            }
          />
          <div className="border-border my-1 border-t" />
          <Line
            label="Épargné"
            value={signedEuros(saved(review))}
            note={rate === null ? undefined : `${percent(rate)} des revenus`}
            strong
            tone={saved(review) >= 0 ? 'good' : 'bad'}
          />
          {review.other !== 0 && (
            <Line
              label="Placements et autres"
              value={signedEuros(review.other)}
            />
          )}
          <Line
            label={`Patrimoine au ${review.end}`}
            value={euros(review.netWorthEnd)}
            note={
              review.other !== 0
                ? `${signedEuros(change(review))} sur le mois`
                : undefined
            }
          />
        </dl>
        {budget && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Écarts au budget">
            {budget.drift.map((item) => (
              <li
                key={item.name}
                className="bg-muted/60 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm"
              >
                {item.name}
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    item.gap > 0
                      ? 'text-chart-delta-bad'
                      : 'text-chart-delta-good',
                  )}
                >
                  {item.gap > 0
                    ? `+${euros(item.gap)}`
                    : `−${euros(-item.gap)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ReviewAction review={review} />
      </CardContent>
    </Card>
  )
}

export const B_Releve: StoryObj = {
  name: 'B. Relevé',
  render: function Render() {
    const [scenario, setScenario] = useScenario()
    const review = SCENARIOS[scenario].review
    return (
      <Page title="B. Relevé" scenario={scenario} onScenario={setScenario}>
        <div className="grid items-start gap-4 @[48rem]:grid-cols-2">
          <ReviewStatement review={review} />
          <div className="min-w-0 space-y-4">
            <EnvelopesCard />
            <ForecastCard />
          </div>
        </div>
        <Card className="min-w-0">
          <CardHead
            title="Comptes"
            status={`Patrimoine ${euros(TODAY_NET_WORTH)} aujourd’hui`}
            link="Évolution"
          />
          <CardContent>
            <AccountRows />
          </CardContent>
        </Card>
      </Page>
    )
  },
}

/* ---------------------------------------------------------------------------
 * C. Trois questions
 * ------------------------------------------------------------------------- */

function ReviewQuestion({ review }: { review: Review }) {
  const rate = review.income > 0 ? saved(review) / review.income : null
  return (
    <Card className="min-w-0">
      <CardHeader className="space-y-2">
        <p className="text-muted-foreground text-sm font-medium">
          Le mois dernier
        </p>
        <MonthHeader review={review} />
      </CardHeader>
      <CardContent className="space-y-5">
        <Missing review={review} />
        {/* One line: income · expenses · saved, wrapping as a whole. */}
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">Revenus </span>
            <span className="font-semibold tabular-nums">
              {euros(review.income)}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Dépenses </span>
            <span className="font-semibold tabular-nums">
              {euros(-review.expenses)}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Épargné </span>
            <span className="text-chart-delta-good font-semibold tabular-nums">
              {signedEuros(saved(review))}
            </span>
            {rate !== null && (
              <span className="text-muted-foreground"> · {percent(rate)}</span>
            )}
          </span>
        </p>
        {review.other !== 0 && (
          <p className="text-muted-foreground -mt-3 text-sm">
            Placements et autres{' '}
            <span className="text-foreground font-medium tabular-nums">
              {signedEuros(review.other)}
            </span>
          </p>
        )}
        <BudgetBlock review={review} />
        <ReviewAction review={review} />
      </CardContent>
    </Card>
  )
}

function WhereIStand({ review }: { review: Review }) {
  return (
    <Card className="min-w-0">
      <CardHead title="Où j’en suis" link="Évolution" />
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-muted-foreground text-xs">
              Patrimoine aujourd’hui
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {euros(TODAY_NET_WORTH)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">au {review.end}</p>
            <p className="font-medium tabular-nums">
              {euros(review.netWorthEnd)}
            </p>
          </div>
        </div>
        <div
          aria-hidden
          className="bg-muted/60 text-muted-foreground flex h-16 items-center justify-center rounded-lg text-xs"
        >
          courbe du patrimoine
        </div>
        <AccountRows />
      </CardContent>
    </Card>
  )
}

export const C_TroisQuestions: StoryObj = {
  name: 'C. Trois questions',
  render: function Render() {
    const [scenario, setScenario] = useScenario()
    const review = SCENARIOS[scenario].review
    return (
      <Page
        title="C. Trois questions"
        scenario={scenario}
        onScenario={setScenario}
      >
        <div className="grid items-start gap-4 @[48rem]:grid-cols-2 @[72rem]:grid-cols-3">
          <ReviewQuestion review={review} />
          <div className="min-w-0 space-y-4">
            <EnvelopesCard />
            <ForecastCard />
          </div>
          <WhereIStand review={review} />
        </div>
        <ChartStub title="Revenus et dépenses" />
      </Page>
    )
  },
}

/* ===========================================================================
 * Wide layouts without two columns (owner feedback on A, #262)
 *
 * The owner kept « A. Tuiles » but not its two columns inside the cards on
 * a wide screen (Bilan, Ce mois-ci, Comptes). Three ways to use the width
 * without them, shown at a desktop width (the app's page beside the
 * sidebar is about 1 000 px wide on a 1 440 px screen):
 *
 * Large 1. Bandeaux : every card reads top to bottom in full-width strips —
 *          the month's four figures in one row, the budget as one long bar
 *          with its figures on the same line, one envelope per line with a
 *          long bar, the accounts as one list whose value sits right after
 *          the name.
 * Large 2. Tableau : the same strips for the review, the envelopes and the
 *          accounts as aligned columns (name, date, value, gain), read
 *          across like a statement.
 * Large 3. Colonne : the dashboard keeps its phone layout in a centred
 *          column about 700 px wide; the rest of the screen stays empty.
 * ======================================================================== */

const WIDE_GAINS: Record<string, string | undefined> = {
  'Assurance vie': '+726 € · +9,7 %',
}

/** A desktop-wide page: about the app's page width beside the sidebar. */
function WidePage({
  title,
  width = 'max-w-[46rem]',
  children,
}: {
  title: string
  width?: string
  children: (review: Review) => ReactNode
}) {
  const [scenario, setScenario] = useScenario()
  const review = SCENARIOS[scenario].review
  return (
    <Page title={title} scenario={scenario} onScenario={setScenario}>
      <div className={cn('@container mx-auto space-y-4', width)}>
        {children(review)}
      </div>
    </Page>
  )
}

/** The month's four figures in one row (two on a narrow card). */
function FigureStrip({ review }: { review: Review }) {
  const rate = review.income > 0 ? saved(review) / review.income : null
  return (
    <div className="@container grid grid-cols-2 gap-x-6 gap-y-3 @[30rem]:grid-cols-4">
      <Figure label="Revenus" value={euros(review.income)} />
      <Figure label="Dépenses" value={euros(-review.expenses)} />
      <Figure
        label="Épargné"
        value={signedEuros(saved(review))}
        note={rate === null ? undefined : percent(rate)}
        tone={saved(review) >= 0 ? 'good' : 'bad'}
      />
      <Figure
        label={`Patrimoine au ${review.end}`}
        value={euros(review.netWorthEnd)}
        note={
          review.other !== 0
            ? `${signedEuros(change(review))}, dont ${signedEuros(review.other)} placements`
            : undefined
        }
      />
    </div>
  )
}

/** The budget on one line: its target, a long bar, what's left. */
function BudgetStrip({ review }: { review: Review }) {
  const { budget } = review
  if (!budget) {
    return (
      <p className="text-muted-foreground text-sm">
        Pas de budget fixé pour ce mois.
      </p>
    )
  }
  const left = budget.target - budget.spent
  const ratio = budget.spent / budget.target
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">
          Budget{' '}
          <span className="text-muted-foreground font-normal tabular-nums">
            {euros(budget.target)}
          </span>
        </span>
        <div className="bg-muted h-2 min-w-[8rem] flex-1 overflow-hidden rounded-full">
          <div
            className={cn(
              'h-full rounded-full',
              ratio > 1
                ? 'bg-chart-over'
                : ratio >= 0.9
                  ? 'bg-chart-warning'
                  : 'bg-primary',
            )}
            style={{ width: `${Math.min(ratio, 1) * 100}%` }}
          />
        </div>
        <span className="whitespace-nowrap">
          <span
            className={cn('font-medium', left < 0 && 'text-chart-delta-bad')}
          >
            {left < 0 ? `Dépassé de ${euros(-left)}` : `Reste ${euros(left)}`}
          </span>
          {budget.unbudgeted > 0 && (
            <span className="text-muted-foreground">
              {' '}
              · {euros(budget.unbudgeted)} hors budget
            </span>
          )}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Écarts au budget">
        {budget.drift.map((item) => (
          <li
            key={item.name}
            className="bg-muted/60 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm"
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.name}
            <span
              className={cn(
                'font-medium tabular-nums',
                item.gap > 0 ? 'text-chart-delta-bad' : 'text-chart-delta-good',
              )}
            >
              {item.gap > 0 ? `+${euros(item.gap)}` : `−${euros(-item.gap)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ReviewStrips({ review }: { review: Review }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <MonthHeader review={review} />
      </CardHeader>
      <CardContent className="space-y-5">
        <Missing review={review} />
        <FigureStrip review={review} />
        <BudgetStrip review={review} />
        <ReviewAction review={review} />
      </CardContent>
    </Card>
  )
}

/** One envelope per line: name, a long bar with the pace mark, figures. */
function EnvelopeLines() {
  return (
    <Card className="min-w-0">
      <CardHead title="Ce mois-ci" status="jour 18 sur 30" link="Budget" />
      <CardContent className="space-y-3">
        <ul className="space-y-1">
          {ENVELOPES.map((item) => {
            const ratio = item.spent / item.target
            return (
              <li key={item.name}>
                <a
                  href="#"
                  onClick={(event) => event.preventDefault()}
                  className="hover:bg-muted/60 -mx-2 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2 text-sm"
                >
                  <span className="w-40 font-medium">{item.name}</span>
                  <span className="bg-muted relative h-2 min-w-[8rem] flex-1 rounded-full">
                    <span
                      className="bg-primary absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                    />
                    <span
                      aria-hidden
                      className="bg-foreground absolute -inset-y-1 w-0.5 rounded"
                      style={{ left: `${(item.pace / item.target) * 100}%` }}
                    />
                  </span>
                  <span className="w-28 text-right whitespace-nowrap tabular-nums">
                    <span className="font-medium">{euros(item.spent)}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      / {euros(item.target)}
                    </span>
                  </span>
                  <span className="text-muted-foreground w-24 text-right whitespace-nowrap">
                    reste {euros(item.target - item.spent)}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
        <Button iconStart={<PlusIcon />} className="w-fit">
          Ajouter une dépense
        </Button>
      </CardContent>
    </Card>
  )
}

/** The accounts as one list, groups one under the other. */
function AccountsOneList() {
  return (
    <Card className="min-w-0">
      <CardHead title="Comptes" link="Évolution" />
      <CardContent className="space-y-4">
        <div>
          <p className="text-muted-foreground text-xs">Patrimoine à ce jour</p>
          <p className="text-2xl font-semibold tabular-nums">
            {euros(TODAY_NET_WORTH)}
          </p>
        </div>
        {/* A readable width: the value stays near the name. */}
        <div className="max-w-[30rem]">
          <AccountRows />
        </div>
        <AddButtons />
      </CardContent>
    </Card>
  )
}

function AddButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button iconStart={<WalletIcon />}>Ajouter un compte</Button>
      <Button outline variant="secondary" iconStart={<ChartCandlestickIcon />}>
        Ajouter un placement
      </Button>
    </div>
  )
}

/** The accounts as aligned columns: name, institution, date, value, gain. */
function AccountsTable() {
  return (
    <Card className="min-w-0">
      <CardHead title="Comptes" link="Évolution" />
      <CardContent className="space-y-4">
        <div>
          <p className="text-muted-foreground text-xs">Patrimoine à ce jour</p>
          <p className="text-2xl font-semibold tabular-nums">
            {euros(TODAY_NET_WORTH)}
          </p>
        </div>
        <div className="space-y-4 text-sm">
          {ACCOUNTS.map((group) => (
            <section key={group.group} className="space-y-1">
              <div className="text-muted-foreground grid grid-cols-[minmax(10rem,1.5fr)_1fr_6rem_7rem_9rem_1rem] items-baseline gap-x-4 px-2 text-xs">
                <span className="font-medium">{group.group}</span>
                <span>Établissement</span>
                <span>Valeur au</span>
                <span className="text-foreground text-right text-sm font-semibold tabular-nums">
                  {euros(group.total)}
                </span>
                <span className="text-right">Plus-value</span>
                <span />
              </div>
              {group.rows.map((row) => {
                const [institution, date] = row.sub.split(' · ')
                const stale = 'stale' in row && row.stale
                return (
                  <a
                    key={row.name}
                    href="#"
                    onClick={(event) => event.preventDefault()}
                    className="hover:bg-muted/60 grid min-h-11 grid-cols-[minmax(10rem,1.5fr)_1fr_6rem_7rem_9rem_1rem] items-center gap-x-4 rounded-lg px-2 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-[32px] shrink-0 items-center justify-center rounded-full [&_svg]:size-[16px]',
                          row.tone,
                        )}
                      >
                        {row.icon}
                      </span>
                      <span className="truncate font-medium">{row.name}</span>
                    </span>
                    <span className="text-muted-foreground truncate">
                      {institution}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {date?.replace('au ', '')}
                    </span>
                    <span className="text-right font-medium whitespace-nowrap tabular-nums">
                      {euros(row.value)}
                    </span>
                    <span className="text-right whitespace-nowrap tabular-nums">
                      {stale ? (
                        <span className="text-warning-foreground dark:text-warning font-medium">
                          ● à mettre à jour
                        </span>
                      ) : (
                        <span className="text-chart-delta-good">
                          {WIDE_GAINS[row.name] ?? ''}
                        </span>
                      )}
                    </span>
                    <ChevronRightIcon
                      aria-hidden
                      className="text-muted-foreground size-4"
                    />
                  </a>
                )
              })}
            </section>
          ))}
        </div>
        <AddButtons />
      </CardContent>
    </Card>
  )
}

export const Large1_Bandeaux: StoryObj = {
  name: 'Large 1. Bandeaux',
  parameters: { viewport: { defaultViewport: 'desktop' } },
  render: () => (
    <WidePage title="Large 1. Bandeaux">
      {(review) => (
        <>
          <ReviewStrips review={review} />
          <EnvelopeLines />
          <ForecastCard />
          <AccountsOneList />
        </>
      )}
    </WidePage>
  ),
}

export const Large2_Tableau: StoryObj = {
  name: 'Large 2. Tableau',
  parameters: { viewport: { defaultViewport: 'desktop' } },
  render: () => (
    <WidePage title="Large 2. Tableau">
      {(review) => (
        <>
          <ReviewStrips review={review} />
          <EnvelopeLines />
          <ForecastCard />
          <AccountsTable />
        </>
      )}
    </WidePage>
  ),
}

export const Large3_Colonne: StoryObj = {
  name: 'Large 3. Colonne',
  parameters: { viewport: { defaultViewport: 'desktop' } },
  render: () => (
    <WidePage title="Large 3. Colonne" width="max-w-[32rem]">
      {(review) => (
        <>
          <ReviewTiles review={review} />
          <EnvelopesCard />
          <ForecastCard />
          <Card className="min-w-0">
            <CardHead title="Comptes" link="Évolution" />
            <CardContent className="space-y-4">
              <div>
                <p className="text-muted-foreground text-xs">
                  Patrimoine à ce jour
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {euros(TODAY_NET_WORTH)}
                </p>
              </div>
              <AccountRows />
              <AddButtons />
            </CardContent>
          </Card>
        </>
      )}
    </WidePage>
  ),
}

/* ===========================================================================
 * Budget graph proposals (owner feedback on #262: « on ne comprend pas très
 * bien le hors budget, rends le graphe plus clair »)
 *
 * Same synthetic month: 2 071 € spent in the budgeted categories for a
 * budget of 2 225 €, plus 443 € in categories without a target, 2 514 € of
 * expenses in all.
 *
 * Budget 1. Barre empilée : one bar for all the month's expenses, the
 *           budgeted part and the « hors budget » part in two colours, the
 *           budget as a mark on it; a legend names each part.
 * Budget 2. Deux barres : the budgeted categories against their budget,
 *           then the categories without a budget on their own short line,
 *           each said in words.
 * Budget 3. Total vs budget : the month's whole expenses against the
 *           budget, how much over or under, the « hors budget » part as a
 *           plain sentence under it.
 * ======================================================================== */

const BUDGET = { spent: 207_100, target: 222_500, unbudgeted: 44_300 }

function Legend({
  swatch,
  label,
  value,
}: {
  swatch: string
  label: string
  value: string
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn('size-2.5 shrink-0 rounded-sm', swatch)}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium whitespace-nowrap tabular-nums">
        {value}
      </span>
    </li>
  )
}

/** 1. One stacked bar for every expense, the budget as a mark. */
function BudgetStacked() {
  const total = BUDGET.spent + BUDGET.unbudgeted
  const scale = Math.max(total, BUDGET.target)
  const pct = (cents: number) => `${(cents / scale) * 100}%`
  const left = BUDGET.target - BUDGET.spent
  return (
    <div className="space-y-2 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">Dépenses du mois</span>
        <span className="font-semibold tabular-nums">{euros(total)}</span>
      </p>
      <div className="relative">
        <div className="bg-muted flex h-3 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full"
            style={{ width: pct(BUDGET.spent) }}
          />
          <div
            className="h-full bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_3px,transparent_3px_6px)] opacity-60"
            style={{ width: pct(BUDGET.unbudgeted) }}
          />
        </div>
        {/* The budget, as a mark on the bar. */}
        <div
          aria-hidden
          className="bg-foreground absolute -top-1 -bottom-1 w-0.5 rounded"
          style={{ left: pct(BUDGET.target) }}
        />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Legend
          swatch="bg-primary"
          label="Avec budget"
          value={euros(BUDGET.spent)}
        />
        <Legend
          swatch="bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_2px,transparent_2px_4px)]"
          label="Sans budget"
          value={euros(BUDGET.unbudgeted)}
        />
        <Legend
          swatch="bg-foreground w-0.5"
          label="Budget"
          value={euros(BUDGET.target)}
        />
      </ul>
      <p className="text-xs">
        <span className="font-medium">Reste {euros(left)}</span>
        <span className="text-muted-foreground">
          {' '}
          sur les catégories budgétées
        </span>
      </p>
    </div>
  )
}

/** 2. The budgeted categories, then those without a budget, apart. */
function BudgetTwoBars() {
  const left = BUDGET.target - BUDGET.spent
  const ratio = BUDGET.spent / BUDGET.target
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">Catégories avec un budget</span>
          <span className="tabular-nums">
            <span className="font-semibold">{euros(BUDGET.spent)}</span>
            <span className="text-muted-foreground">
              {' '}
              / {euros(BUDGET.target)}
            </span>
          </span>
        </p>
        <div className="bg-muted h-2.5 overflow-hidden rounded-full">
          <div
            className={cn(
              'h-full rounded-full',
              ratio >= 0.9 ? 'bg-chart-warning' : 'bg-primary',
            )}
            style={{ width: `${Math.min(ratio, 1) * 100}%` }}
          />
        </div>
        <p className="text-xs font-medium">Reste {euros(left)}</p>
      </div>
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">Catégories sans budget</span>
          <span className="font-semibold tabular-nums">
            {euros(BUDGET.unbudgeted)}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          Dépenses dans des catégories sans objectif ce mois-ci : à budgéter
          pour le mois suivant ?
        </p>
      </div>
    </div>
  )
}

/** 3. All the month's expenses against the budget. */
function BudgetTotal() {
  const total = BUDGET.spent + BUDGET.unbudgeted
  const over = total - BUDGET.target
  const scale = Math.max(total, BUDGET.target)
  return (
    <div className="space-y-2 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span>
          <span className="font-semibold tabular-nums">{euros(total)}</span>{' '}
          <span className="text-muted-foreground">
            dépensés pour un budget de {euros(BUDGET.target)}
          </span>
        </span>
        <span
          className={cn(
            'font-medium whitespace-nowrap tabular-nums',
            over > 0 ? 'text-chart-delta-bad' : 'text-chart-delta-good',
          )}
        >
          {over > 0 ? `${euros(over)} au-dessus` : `${euros(-over)} en dessous`}
        </span>
      </p>
      <div className="bg-muted relative flex h-3 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full"
          style={{
            width: `${(Math.min(total, BUDGET.target) / scale) * 100}%`,
          }}
        />
        {over > 0 && (
          <div
            className="bg-chart-over h-full"
            style={{ width: `${(over / scale) * 100}%` }}
          />
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        Dont {euros(BUDGET.unbudgeted)} dans des catégories sans budget (hors
        budget). Sans elles, il reste {euros(BUDGET.target - BUDGET.spent)}.
      </p>
    </div>
  )
}

export const BudgetProposals: StoryObj = {
  name: 'Budget : propositions',
  render: () => (
    <AppScale>
      <div className="bg-background min-h-svh space-y-4 p-4">
        <p className="text-muted-foreground text-xs">
          Même mois : 2 071 € dépensés dans les catégories budgétées (budget 2
          225 €) + 443 € dans des catégories sans budget = 2 514 € de dépenses.
        </p>
        {(
          [
            ['Budget 1. Barre empilée', <BudgetStacked key="1" />],
            ['Budget 2. Deux barres', <BudgetTwoBars key="2" />],
            ['Budget 3. Total vs budget', <BudgetTotal key="3" />],
          ] as const
        ).map(([title, body]) => (
          <Card key={title} className="@container mx-auto max-w-[46rem]">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>{body}</CardContent>
          </Card>
        ))}
      </div>
    </AppScale>
  ),
}

/* ===========================================================================
 * « Ce mois-ci » proposals (owner feedback on #262): a tap on an envelope's
 * bar opened its transactions (unexpected), the « + » of each envelope sat
 * apart from it, the forecast tiles were links that looked like plain
 * figures, and « Ajouter une dépense » did not take the card's width.
 *
 * Mois 1. Appuyer = ajouter : each envelope is one button that notes an
 *         expense in it (its « + » inside, at the end); the forecast is one
 *         row with a chevron, clearly a way to the forecast page.
 * Mois 2. Appuyer = choisir : each envelope is one row with a chevron; a tap
 *         opens a short menu « Ajouter une dépense » / « Voir les
 *         opérations ». The figures are plain figures, not buttons.
 * Mois 3. Saisie d'abord : the envelopes as tiles « Courses · reste 421 € »
 *         with their bar inside and a « + », a tap notes an expense; the
 *         forecast as a sentence; the transactions behind the header link.
 * ======================================================================== */

const MONTH_ENVELOPES = [
  {
    name: 'Courses',
    icon: <ShoppingCartIcon />,
    color: '#d97706',
    spent: 7_889,
    target: 50_000,
    pace: 31_667,
    manual: 2_640,
  },
  {
    name: 'Restaurants & cafés',
    icon: <UtensilsIcon />,
    color: '#ca8a04',
    spent: 2_767,
    target: 18_000,
    pace: 11_400,
    manual: 0,
  },
  {
    name: 'Transport',
    icon: <TrainFrontIcon />,
    color: '#0e7490',
    spent: 0,
    target: 15_000,
    pace: 9_500,
    manual: 0,
  },
]

const cents = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const money = (value: number) => cents.format(value / 100)

/** A bar with the even-pace mark. */
function PaceBar({
  spent,
  target,
  pace,
  className,
}: {
  spent: number
  target: number
  pace: number
  className?: string
}) {
  const ratio = spent / target
  return (
    <span className={cn('bg-muted relative block h-2 rounded-full', className)}>
      <span
        className={cn(
          'absolute inset-y-0 left-0 rounded-full',
          ratio > 1
            ? 'bg-chart-over'
            : ratio >= 0.8
              ? 'bg-chart-warning'
              : 'bg-primary',
        )}
        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
      />
      <span
        aria-hidden
        className="bg-foreground absolute -inset-y-1 w-0.5 rounded"
        style={{ left: `${(pace / target) * 100}%` }}
      />
    </span>
  )
}

function FullWidthAdd({ label = 'Ajouter une dépense' }: { label?: string }) {
  return (
    <Button iconStart={<PlusIcon />} className="w-full">
      {label}
    </Button>
  )
}

function MonthHead() {
  return (
    <CardHead
      title="Ce mois-ci"
      status="Jour 19 sur 30 · le trait marque le rythme"
      link="Budget"
    />
  )
}

/** 1. Each envelope is one button that notes an expense in it. */
function MonthTapToAdd() {
  const [noted, setNoted] = useState<string | null>(null)
  return (
    <Card className="@container min-w-0">
      <MonthHead />
      <CardContent className="mb-0 space-y-4">
        {/* The forecast: a row with a chevron, plainly a way somewhere. */}
        <a
          href="#"
          onClick={(event) => event.preventDefault()}
          className="bg-muted/50 hover:bg-muted flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm"
        >
          <CalendarClockIcon
            aria-hidden
            className="text-muted-foreground size-4 shrink-0"
          />
          <span className="min-w-0 flex-1">
            <span className="block">
              Fin de mois prévue{' '}
              <span className="font-semibold whitespace-nowrap tabular-nums">
                5 560,60 €
              </span>
            </span>
            <span className="text-muted-foreground block text-xs">
              Point bas 2 728,80 € le 26 nov. · indicatif, relevés au 8 nov.
            </span>
          </span>
          <ChevronRightIcon
            aria-hidden
            className="text-muted-foreground size-4 shrink-0"
          />
        </a>
        <ul className="space-y-1.5">
          {MONTH_ENVELOPES.map((item) => (
            <li key={item.name}>
              <button
                type="button"
                onClick={() => setNoted(item.name)}
                aria-label={`Ajouter une dépense ${item.name}`}
                className="hover:bg-muted/60 border-border flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm"
              >
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{item.name}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold">{money(item.spent)}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        / {money(item.target)}
                      </span>
                    </span>
                  </span>
                  <PaceBar {...item} />
                  <span className="text-muted-foreground block text-xs">
                    Reste {money(item.target - item.spent)}
                    {item.manual > 0 &&
                      ` · dont ${money(item.manual)} noté à la main`}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="bg-primary text-primary-foreground flex size-[40px] shrink-0 items-center justify-center rounded-full"
                >
                  <PlusIcon className="size-[22px]" strokeWidth={2.5} />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {noted && (
          <p className="text-muted-foreground text-xs">
            (Prototype) La saisie s’ouvrirait sur « {noted} », au montant.
          </p>
        )}
        <FullWidthAdd label="Ajouter une autre dépense" />
      </CardContent>
    </Card>
  )
}

/** 2. Each envelope is a row with a chevron; a tap offers the two actions. */
function MonthTapToChoose() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Card className="@container min-w-0">
      <MonthHead />
      <CardContent className="mb-0 space-y-4">
        {/* Plain figures, then one link to the page. */}
        <div className="space-y-1">
          <dl className="grid grid-cols-2 gap-2">
            <div className="bg-muted/50 rounded-xl px-3 py-2.5">
              <dt className="text-muted-foreground text-xs">
                Solde prévu au 30 nov.
              </dt>
              <dd className="text-base font-semibold whitespace-nowrap tabular-nums">
                5 560,60 €
              </dd>
            </div>
            <div className="bg-muted/50 rounded-xl px-3 py-2.5">
              <dt className="text-muted-foreground text-xs">
                Point bas le 26 nov.
              </dt>
              <dd className="text-base font-semibold whitespace-nowrap tabular-nums">
                2 728,80 €
              </dd>
            </div>
          </dl>
          <p className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
            <span className="text-muted-foreground">
              Indicatif : relevés au 8 nov.
            </span>
            <SeeLink label="Prévision" />
          </p>
        </div>
        <ul className="space-y-1">
          {MONTH_ENVELOPES.map((item) => (
            <li key={item.name} className="relative">
              <button
                type="button"
                onClick={() => setOpen(open === item.name ? null : item.name)}
                aria-expanded={open === item.name}
                className="hover:bg-muted/60 -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left text-sm"
              >
                <span
                  aria-hidden
                  className="flex size-[32px] shrink-0 items-center justify-center rounded-full text-white [&_svg]:size-[16px]"
                  style={{ backgroundColor: item.color }}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      reste {money(item.target - item.spent)}
                    </span>
                  </span>
                  <PaceBar {...item} />
                </span>
                <ChevronRightIcon
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
              </button>
              {open === item.name && (
                <div className="bg-popover text-popover-foreground border-border mt-1 grid gap-1 rounded-xl border p-1 shadow-md">
                  <Button
                    iconStart={<PlusIcon />}
                    className="w-full justify-start"
                    ghost
                  >
                    Ajouter une dépense {item.name}
                  </Button>
                  <Button
                    iconStart={<ArrowLeftRightIcon />}
                    className="w-full justify-start"
                    ghost
                    variant="secondary"
                  >
                    Voir les opérations ({money(item.spent)})
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <FullWidthAdd />
      </CardContent>
    </Card>
  )
}

/** 3. Envelope tiles to tap to note an expense. */
function MonthEntryFirst() {
  return (
    <Card className="@container min-w-0">
      <CardHead title="Ce mois-ci" status="Jour 19 sur 30" link="Opérations" />
      <CardContent className="mb-0 space-y-4">
        <p className="text-sm">
          Fin de mois prévue{' '}
          <span className="font-semibold whitespace-nowrap tabular-nums">
            5 560,60 €
          </span>
          <span className="text-muted-foreground">
            {' '}
            · point bas 2 728,80 € le 26 nov.
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          Noter une dépense dans une enveloppe :
        </p>
        <ul className="grid grid-cols-1 gap-2 @[28rem]:grid-cols-3">
          {MONTH_ENVELOPES.map((item) => (
            <li key={item.name}>
              <button
                type="button"
                aria-label={`Ajouter une dépense ${item.name}`}
                className="hover:brightness-95 flex w-full flex-col gap-2 rounded-xl px-3 py-2.5 text-left text-sm"
                style={{
                  backgroundColor: `color-mix(in srgb, ${item.color} 14%, transparent)`,
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="flex size-[28px] shrink-0 items-center justify-center rounded-full text-white [&_svg]:size-[14px]"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {item.name}
                  </span>
                  <span
                    aria-hidden
                    className="bg-primary text-primary-foreground flex size-[40px] shrink-0 items-center justify-center rounded-full"
                  >
                    <PlusIcon className="size-[22px]" strokeWidth={2.5} />
                  </span>
                </span>
                <PaceBar {...item} className="bg-background/70" />
                <span className="flex justify-between text-xs tabular-nums">
                  <span>reste {money(item.target - item.spent)}</span>
                  <span className="text-muted-foreground">
                    / {money(item.target)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <FullWidthAdd label="Ajouter une autre dépense" />
      </CardContent>
    </Card>
  )
}

export const MonthProposals: StoryObj = {
  name: 'Ce mois-ci : propositions',
  render: () => (
    <AppScale>
      <div className="bg-background min-h-svh space-y-4 p-4">
        {(
          [
            ['Mois 1. Appuyer = ajouter', <MonthTapToAdd key="1" />],
            ['Mois 2. Appuyer = choisir', <MonthTapToChoose key="2" />],
            ['Mois 3. Saisie d’abord', <MonthEntryFirst key="3" />],
          ] as const
        ).map(([title, body]) => (
          <section key={title} className="mx-auto max-w-[46rem] space-y-1.5">
            <h2 className="text-muted-foreground text-sm font-medium">
              {title}
            </h2>
            {body}
          </section>
        ))}
      </div>
    </AppScale>
  ),
}

/* ===========================================================================
 * Budget bar on a phone (owner feedback on #262: « le graphe est bien mais
 * en téléphone c'est un peu bizarre »: a legend on three lines, then « Reste
 * 154 € sur les catégories avec budget » wrapping).
 *
 * Tél. 1. Tableau : the legend as a two-column list, label left, amount
 *         right, what's left as its last line.
 * Tél. 2. Sur la barre : the two amounts above the bar, over their part;
 *         the budget and what's left under it, one line.
 * Tél. 3. Deux phrases : « 2 071 € avec budget + 443 € sans budget », then
 *         « Budget 2 225 € · reste 154 € », the swatches inline.
 * Tél. 4. Tuiles : the budget in the heading, then three small tiles: avec
 *         budget, sans budget, reste.
 * ======================================================================== */

const HATCH =
  'bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_3px,transparent_3px_6px)] opacity-60'

function StackedBar() {
  const total = BUDGET.spent + BUDGET.unbudgeted
  const scale = Math.max(total, BUDGET.target)
  const pct = (value: number) => `${(value / scale) * 100}%`
  return (
    <div className="relative">
      <div className="bg-muted flex h-3 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full"
          style={{ width: pct(BUDGET.spent) }}
        />
        <div
          className={cn('h-full', HATCH)}
          style={{ width: pct(BUDGET.unbudgeted) }}
        />
      </div>
      <div
        aria-hidden
        className="bg-foreground absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded"
        style={{ left: pct(BUDGET.target) }}
      />
    </div>
  )
}

function Swatch({ kind }: { kind: 'with' | 'without' | 'mark' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block shrink-0 align-middle',
        kind === 'with' && 'bg-primary size-2.5 rounded-sm',
        kind === 'without' && cn('size-2.5 rounded-sm', HATCH),
        kind === 'mark' && 'bg-foreground mx-1 h-3 w-0.5 rounded',
      )}
    />
  )
}

const LEFT = BUDGET.target - BUDGET.spent

/** 1. The legend as a two-column list. */
function PhoneTable() {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Budget</p>
      <StackedBar />
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground flex items-center gap-1.5">
          <Swatch kind="with" /> Avec budget
        </dt>
        <dd className="text-right font-medium tabular-nums">
          {euros(BUDGET.spent)}
        </dd>
        <dt className="text-muted-foreground flex items-center gap-1.5">
          <Swatch kind="without" /> Sans budget
        </dt>
        <dd className="text-right font-medium tabular-nums">
          {euros(BUDGET.unbudgeted)}
        </dd>
        <dt className="text-muted-foreground flex items-center gap-1.5">
          <Swatch kind="mark" /> Budget
        </dt>
        <dd className="text-right font-medium tabular-nums">
          {euros(BUDGET.target)}
        </dd>
        <div aria-hidden className="border-border col-span-2 my-0.5 border-t" />
        <dt className="font-medium">Reste</dt>
        <dd className="text-right font-semibold tabular-nums">{euros(LEFT)}</dd>
      </dl>
    </div>
  )
}

/** 2. The amounts above their part of the bar. */
function PhoneOnBar() {
  const total = BUDGET.spent + BUDGET.unbudgeted
  const scale = Math.max(total, BUDGET.target)
  return (
    <div className="space-y-1.5 text-sm">
      <p className="font-medium">Budget</p>
      <div className="flex text-xs tabular-nums">
        <span
          className="min-w-0"
          style={{ width: `${(BUDGET.spent / scale) * 100}%` }}
        >
          <span className="font-medium">{euros(BUDGET.spent)}</span>{' '}
          <span className="text-muted-foreground">avec budget</span>
        </span>
        <span className="flex-1 text-right whitespace-nowrap">
          <span className="font-medium">{euros(BUDGET.unbudgeted)}</span>{' '}
          <span className="text-muted-foreground">sans</span>
        </span>
      </div>
      <StackedBar />
      <p className="flex justify-between gap-x-3 text-xs">
        <span className="text-muted-foreground">
          <Swatch kind="mark" />
          Budget {euros(BUDGET.target)}
        </span>
        <span className="font-medium">Reste {euros(LEFT)}</span>
      </p>
    </div>
  )
}

/** 3. Two short sentences. */
function PhoneSentences() {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Budget</p>
      <StackedBar />
      <p className="text-xs leading-relaxed">
        <Swatch kind="with" />{' '}
        <span className="font-medium tabular-nums">{euros(BUDGET.spent)}</span>{' '}
        <span className="text-muted-foreground">avec budget</span>
        {' + '}
        <Swatch kind="without" />{' '}
        <span className="font-medium tabular-nums">
          {euros(BUDGET.unbudgeted)}
        </span>{' '}
        <span className="text-muted-foreground">sans budget</span>
      </p>
      <p className="text-xs">
        <Swatch kind="mark" />
        <span className="text-muted-foreground">Budget</span>{' '}
        <span className="font-medium tabular-nums">{euros(BUDGET.target)}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="font-medium">reste {euros(LEFT)}</span>
      </p>
    </div>
  )
}

/** 4. The budget in the heading, three small tiles under the bar. */
function PhoneTiles() {
  const tiles: [ReactNode, string, string][] = [
    [<Swatch key="w" kind="with" />, 'Avec', euros(BUDGET.spent)],
    [<Swatch key="o" kind="without" />, 'Sans', euros(BUDGET.unbudgeted)],
    [null, 'Reste', euros(LEFT)],
  ]
  return (
    <div className="space-y-2 text-sm">
      <p className="flex items-baseline justify-between">
        <span className="font-medium">Budget</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          <Swatch kind="mark" />
          {euros(BUDGET.target)}
        </span>
      </p>
      <StackedBar />
      <div className="grid grid-cols-3 gap-1.5 pt-1">
        {tiles.map(([swatch, label, value]) => (
          <div
            key={label}
            className="bg-muted/50 min-w-0 rounded-lg px-2 py-1.5"
          >
            <p className="text-muted-foreground flex items-center gap-1 truncate text-[0.7rem]">
              {swatch}
              {label}
            </p>
            <p className="text-sm font-semibold whitespace-nowrap tabular-nums">
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export const BudgetPhoneProposals: StoryObj = {
  name: 'Budget téléphone : propositions',
  parameters: { viewport: { defaultViewport: 'mobile' } },
  render: () => (
    <AppScale>
      <div className="bg-background min-h-svh space-y-4 p-4">
        {(
          [
            ['Tél. 1. Tableau', <PhoneTable key="1" />],
            ['Tél. 2. Sur la barre', <PhoneOnBar key="2" />],
            ['Tél. 3. Deux phrases', <PhoneSentences key="3" />],
            ['Tél. 4. Tuiles', <PhoneTiles key="4" />],
          ] as const
        ).map(([title, body]) => (
          <section key={title} className="mx-auto max-w-[24rem] space-y-1.5">
            <h2 className="text-muted-foreground text-sm font-medium">
              {title}
            </h2>
            <Card className="min-w-0">
              <CardContent className="mb-0">{body}</CardContent>
            </Card>
          </section>
        ))}
      </div>
    </AppScale>
  ),
}

/* ===========================================================================
 * Account rows on a phone (owner feedback on #262: « problème d'affichage
 * dans les comptes en mode téléphone »: the amount drops to a third line,
 * right-aligned under the date, far from the name).
 *
 * Comptes 1. Montant à droite du nom : name and amount on the first line
 *            (the name cut with … when needed), institution · date and the
 *            gain or « à mettre à jour » on the second.
 * Comptes 2. Sans pastille : the same two lines, without the type badge on
 *            a phone, so the name has room.
 * Comptes 3. Montant sous le nom : name, then the amount in bold, then the
 *            date; everything left-aligned, nothing far right but the ›.
 * Comptes 4. Pastille + montant : the badge, the name with its date under
 *            it, the amount on the right, centred on the two lines.
 * ======================================================================== */

const PHONE_ACCOUNTS = [
  {
    name: 'Compte courant',
    meta: 'Banque A · au 8 nov.',
    value: '3 442,29 €',
    icon: <WalletIcon />,
    tone: 'bg-chart-1/15 text-chart-1',
  },
  {
    name: 'Livret A',
    meta: 'Banque A · au 28 oct.',
    value: '10 818,50 €',
    icon: <PiggyBankIcon />,
    tone: 'bg-chart-3/15 text-chart-3',
  },
  {
    name: 'PEA',
    meta: 'Courtier B · au 30 sept.',
    value: '15 430,23 €',
    detail: 'stale' as const,
    icon: <ChartCandlestickIcon />,
    tone: 'bg-chart-7/15 text-chart-7',
  },
  {
    name: 'Assurance vie Horizon Patrimoine',
    meta: 'Assureur C · au 31 oct.',
    value: '8 226,65 €',
    detail: '+726,65 € · +9,7 %',
    icon: <UmbrellaIcon />,
    tone: 'bg-chart-5/15 text-chart-5',
  },
]

type PhoneAccount = (typeof PHONE_ACCOUNTS)[number]

function AccountDetail({ account }: { account: PhoneAccount }) {
  if (!('detail' in account) || !account.detail) return null
  return account.detail === 'stale' ? (
    <span className="text-warning-foreground dark:text-warning font-medium whitespace-nowrap">
      ● à mettre à jour
    </span>
  ) : (
    <span className="text-chart-delta-good whitespace-nowrap tabular-nums">
      {account.detail}
    </span>
  )
}

function Badge32({ account }: { account: PhoneAccount }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-[32px] shrink-0 items-center justify-center rounded-full [&_svg]:size-[16px]',
        account.tone,
      )}
    >
      {account.icon}
    </span>
  )
}

function RowShell({ children }: { children: ReactNode }) {
  return (
    <a
      href="#"
      onClick={(event) => event.preventDefault()}
      className="hover:bg-muted/60 flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm"
    >
      {children}
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </a>
  )
}

/** 1 & 2. Name and amount on one line, meta and detail on the next. */
function RowsTwoLines({ badge }: { badge: boolean }) {
  return (
    <ul className="space-y-0.5">
      {PHONE_ACCOUNTS.map((account) => (
        <li key={account.name}>
          <RowShell>
            {badge && <Badge32 account={account} />}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {account.name}
                </span>
                <span className="font-medium whitespace-nowrap tabular-nums">
                  {account.value}
                </span>
              </span>
              <span className="flex items-baseline gap-3 text-xs">
                <span className="text-muted-foreground min-w-0 flex-1 truncate">
                  {account.meta}
                </span>
                <AccountDetail account={account} />
              </span>
            </span>
          </RowShell>
        </li>
      ))}
    </ul>
  )
}

/** 3. Everything stacked on the left. */
function RowsStacked() {
  return (
    <ul className="space-y-0.5">
      {PHONE_ACCOUNTS.map((account) => (
        <li key={account.name}>
          <RowShell>
            <Badge32 account={account} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{account.name}</span>
              <span className="block font-semibold tabular-nums">
                {account.value}
              </span>
              <span className="flex flex-wrap gap-x-2 text-xs">
                <span className="text-muted-foreground">{account.meta}</span>
                <AccountDetail account={account} />
              </span>
            </span>
          </RowShell>
        </li>
      ))}
    </ul>
  )
}

/** 4. The amount on the right, centred on the name and its date. */
function RowsAmountRight() {
  return (
    <ul className="space-y-0.5">
      {PHONE_ACCOUNTS.map((account) => (
        <li key={account.name}>
          <RowShell>
            <Badge32 account={account} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{account.name}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {account.meta}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-medium whitespace-nowrap tabular-nums">
                {account.value}
              </span>
              <span className="block text-xs">
                <AccountDetail account={account} />
              </span>
            </span>
          </RowShell>
        </li>
      ))}
    </ul>
  )
}

export const AccountsPhoneProposals: StoryObj = {
  name: 'Comptes téléphone : propositions',
  parameters: { viewport: { defaultViewport: 'mobile' } },
  render: () => (
    <AppScale>
      <div className="bg-background min-h-svh space-y-4 p-4">
        {(
          [
            [
              'Comptes 1. Montant à droite du nom',
              <RowsTwoLines key="1" badge />,
            ],
            [
              'Comptes 2. Sans pastille',
              <RowsTwoLines key="2" badge={false} />,
            ],
            ['Comptes 3. Montant sous le nom', <RowsStacked key="3" />],
            ['Comptes 4. Pastille + montant', <RowsAmountRight key="4" />],
          ] as const
        ).map(([title, body]) => (
          <section key={title} className="mx-auto max-w-[24rem] space-y-1.5">
            <h2 className="text-muted-foreground text-sm font-medium">
              {title}
            </h2>
            <Card className="min-w-0">
              <CardContent className="mb-0">
                <p className="text-muted-foreground px-2 pb-1 text-sm font-medium">
                  Liquidités · Placements
                </p>
                {body}
              </CardContent>
            </Card>
          </section>
        ))}
      </div>
    </AppScale>
  ),
}
