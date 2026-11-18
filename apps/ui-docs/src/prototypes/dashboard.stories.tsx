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
  ChartCandlestickIcon,
  ChevronRightIcon,
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
