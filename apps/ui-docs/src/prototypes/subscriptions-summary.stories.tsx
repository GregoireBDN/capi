import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Card,
  CardContent,
  cn,
  SegmentedControl,
  SegmentedControlItem,
} from '@finances/ui'
import {
  ChevronRightIcon,
  PinIcon,
  RepeatIcon,
  WavesIcon,
  WalletIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * Prototypes of the Abonnements summary card: four directions shown to the
 * owner before one is built in `apps/web`. Mockups with synthetic data, not
 * app code.
 *
 * Today's card puts six figures of equal weight in a grid (« Actuel »). Some
 * repeat each other (per year = per month × 12, fixed + variable = total),
 * get cut on a phone (« 1 195,99 € / m… »), and they don't add up with the
 * lists below: « Charges fixes » counts the subscriptions again, while the
 * page lists them apart. Every direction uses the page's own split:
 * Abonnements · Autres charges fixes · Charges variables, which add up to the
 * total and match the section headers.
 *
 * A. Un total, une barre : the monthly total alone, the three parts as one
 *    stacked bar and a legend; incomes leave the card (their section below).
 * B. Relevé : a statement, label left and amount right, « Par mois / Par
 *    an » switching every figure, then incomes and what is left.
 * C. Ce qui reste : read from the recurring income: how much of it the
 *    charges take every month, and what is left.
 * D. Sommaire : no figures card; one line of totals, then the sections as
 *    four rows that lead to them (each section header has its total).
 */
const meta: Meta = {
  title: 'Prototypes/Abonnements summary',
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

const DATA = {
  subscriptions: { monthly: 3_948, count: 4 },
  otherFixed: { monthly: 115_651, count: 6 },
  variable: { monthly: 31_269, count: 5 },
  incomes: { monthly: 318_300, count: 2 },
  /** What the summary API gives today (fixed includes subscriptions). */
  fixedWithSubscriptions: 119_599,
}
const TOTAL =
  DATA.subscriptions.monthly + DATA.otherFixed.monthly + DATA.variable.monthly
const LEFT = DATA.incomes.monthly - TOTAL

const PARTS = [
  {
    key: 'subscriptions',
    label: 'Abonnements',
    icon: RepeatIcon,
    color: 'bg-chart-1',
    ...DATA.subscriptions,
  },
  {
    key: 'fixed',
    label: 'Autres charges fixes',
    icon: PinIcon,
    color: 'bg-chart-2',
    ...DATA.otherFixed,
  },
  {
    key: 'variable',
    label: 'Charges variables',
    icon: WavesIcon,
    color: 'bg-chart-3',
    ...DATA.variable,
  },
] as const

const eurosFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const wholeFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const percentFormat = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
})
const euros = (cents: number) => eurosFormat.format(cents / 100)
const whole = (cents: number) => wholeFormat.format(Math.round(cents / 100))
const percent = (ratio: number) => percentFormat.format(ratio)
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n > 1 ? many : one}`

/* ---------------------------------------------------------------------------
 * Page frame: the header and the start of the first list, for context
 * ------------------------------------------------------------------------- */

function Page({ title, children }: { title: string; children: ReactNode }) {
  // The app's 22px root (apps/web globals.css), so sizes read as in the app.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.fontSize
    root.style.fontSize = '22px'
    return () => {
      root.style.fontSize = previous
    }
  }, [])
  return (
    <div className="bg-background text-foreground min-h-svh">
      <div className="@container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Proposition {title}
          </p>
          <h1 className="text-xl font-semibold md:text-2xl">Abonnements</h1>
          <p className="text-muted-foreground text-sm">
            Abonnements, charges fixes et revenus qui reviennent chaque semaine,
            mois ou année.
          </p>
        </div>
        {children}
        <section className="space-y-2 opacity-60" aria-hidden="true">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">Abonnements</h3>
            <span className="text-muted-foreground text-sm tabular-nums">
              {euros(DATA.subscriptions.monthly)} / mois
            </span>
          </div>
          <div className="bg-card h-16 rounded-xl border" />
        </section>
      </div>
    </div>
  )
}

/** The legend's marker: a small square in the part's colour. */
function Swatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-[3px]',
        color,
        className,
      )}
    />
  )
}

/** One stacked bar of the three parts, each as wide as its share. */
function StackedBar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-muted flex h-3 gap-0.5 overflow-hidden rounded-full',
        className,
      )}
    >
      {PARTS.map((part) => (
        <span
          key={part.key}
          className={part.color}
          style={{ width: `${(part.monthly / TOTAL) * 100}%` }}
        />
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Actuel
 * ------------------------------------------------------------------------- */

function Stat({
  label,
  value,
  detail,
  className,
}: {
  label: string
  value: string
  detail?: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-muted-foreground truncate text-xs">{label}</dt>
      <dd className="truncate font-semibold tabular-nums">{value}</dd>
      {detail && (
        <dd className="text-muted-foreground truncate text-xs">{detail}</dd>
      )}
    </div>
  )
}

export const Actuel: StoryObj = {
  name: '0. Actuel',
  render: () => (
    <Page title="actuelle">
      <Card size="sm">
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-4 @2xl:grid-cols-3">
            <Stat
              className="col-span-2 @2xl:col-span-1"
              label="Charges récurrentes par mois"
              value={euros(TOTAL)}
              detail="15 charges"
            />
            <Stat label="Par an" value={euros(TOTAL * 12)} />
            <Stat
              label="Abonnements"
              value={`${euros(DATA.subscriptions.monthly)} / mois`}
              detail="4 abonnements"
            />
            <Stat
              label="Charges fixes"
              value={`${euros(DATA.fixedWithSubscriptions)} / mois`}
              detail={`${percent(DATA.fixedWithSubscriptions / TOTAL)} du total`}
            />
            <Stat
              label="Charges variables"
              value={`${euros(DATA.variable.monthly)} / mois`}
              detail={`${percent(DATA.variable.monthly / TOTAL)} du total`}
            />
            <Stat
              className="col-span-2 @2xl:col-span-1"
              label="Revenus récurrents"
              value={`${euros(DATA.incomes.monthly)} / mois`}
              detail={`${euros(DATA.incomes.monthly * 12)} par an`}
            />
          </dl>
        </CardContent>
      </Card>
    </Page>
  ),
}

/* ---------------------------------------------------------------------------
 * A. Un total, une barre
 * ------------------------------------------------------------------------- */

export const A_TotalBarre: StoryObj = {
  name: 'A. Un total, une barre',
  render: () => (
    <Page title="A · Un total, une barre">
      <Card size="sm">
        <CardContent className="space-y-4">
          <div>
            <p className="text-muted-foreground text-sm">Charges récurrentes</p>
            <p className="text-3xl font-semibold tabular-nums">
              {euros(TOTAL)}
              <span className="text-muted-foreground text-base font-normal">
                {' '}
                / mois
              </span>
            </p>
            <p className="text-muted-foreground text-sm tabular-nums">
              {whole(TOTAL * 12)} par an · 15 charges
            </p>
          </div>
          <StackedBar />
          <ul className="space-y-2.5">
            {PARTS.map((part) => (
              <li key={part.key} className="flex items-start gap-2 text-sm">
                <Swatch color={part.color} className="mt-1.5" />
                <span className="min-w-0 flex-1 break-normal">
                  {part.label}
                  <span className="text-muted-foreground block text-xs">
                    {plural(part.count, 'élément')}
                  </span>
                </span>
                <span className="text-right whitespace-nowrap tabular-nums">
                  <span className="font-medium">{euros(part.monthly)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {percent(part.monthly / TOTAL)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Page>
  ),
}

/* ---------------------------------------------------------------------------
 * B. Relevé
 * ------------------------------------------------------------------------- */

function StatementRow({
  label,
  detail,
  value,
  strong = false,
  tone,
}: {
  label: string
  detail?: string
  value: string
  strong?: boolean
  tone?: 'good'
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-3 py-2.5 text-sm',
        strong && 'font-semibold',
      )}
    >
      <span className="min-w-0 flex-1">
        {label}
        {detail && (
          <span className="text-muted-foreground font-normal"> · {detail}</span>
        )}
      </span>
      <span
        className={cn(
          'whitespace-nowrap tabular-nums',
          tone === 'good' && 'text-success-foreground dark:text-success',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export const B_Releve: StoryObj = {
  name: 'B. Relevé',
  render: function Render() {
    const [period, setPeriod] = useState<'month' | 'year'>('month')
    const k = period === 'month' ? 1 : 12
    return (
      <Page title="B · Relevé">
        <Card size="sm">
          <CardContent className="space-y-3">
            <SegmentedControl
              aria-label="Période"
              fullWidth
              value={period}
              onValueChange={setPeriod}
            >
              <SegmentedControlItem value="month">
                Par mois
              </SegmentedControlItem>
              <SegmentedControlItem value="year">Par an</SegmentedControlItem>
            </SegmentedControl>
            <div className="divide-y">
              {PARTS.map((part) => (
                <StatementRow
                  key={part.key}
                  label={part.label}
                  detail={String(part.count)}
                  value={euros(part.monthly * k)}
                />
              ))}
              <StatementRow
                label="Charges récurrentes"
                value={euros(TOTAL * k)}
                strong
              />
            </div>
            <div className="divide-y border-t-2">
              <StatementRow
                label="Revenus récurrents"
                value={`+${euros(DATA.incomes.monthly * k)}`}
              />
              <StatementRow
                label="Reste chaque mois"
                value={`+${euros(LEFT * k)}`}
                strong
                tone="good"
              />
            </div>
          </CardContent>
        </Card>
      </Page>
    )
  },
}

/* ---------------------------------------------------------------------------
 * C. Ce qui reste
 * ------------------------------------------------------------------------- */

export const C_CeQuiReste: StoryObj = {
  name: 'C. Ce qui reste',
  render: () => {
    const taken = TOTAL / DATA.incomes.monthly
    return (
      <Page title="C · Ce qui reste">
        <Card size="sm">
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground text-sm">
                Chaque mois, après les charges récurrentes
              </p>
              <p className="text-success-foreground dark:text-success text-3xl font-semibold tabular-nums">
                +{euros(LEFT)}
              </p>
              <p className="text-muted-foreground text-sm">
                Elles prennent {percent(taken)} des{' '}
                {whole(DATA.incomes.monthly)} de revenus récurrents.
              </p>
            </div>
            {/* The income as a whole: the charges, then what is left. */}
            <div>
              <div
                aria-hidden="true"
                className="bg-muted flex h-4 gap-0.5 overflow-hidden rounded-full"
              >
                {PARTS.map((part) => (
                  <span
                    key={part.key}
                    className={part.color}
                    style={{
                      width: `${(part.monthly / DATA.incomes.monthly) * 100}%`,
                    }}
                  />
                ))}
                <span
                  className="bg-chart-savings/30 flex-1"
                  style={{ width: `${(LEFT / DATA.incomes.monthly) * 100}%` }}
                />
              </div>
              <div className="text-muted-foreground mt-1 flex justify-between text-xs tabular-nums">
                <span>Charges {whole(TOTAL)}</span>
                <span>Revenus {whole(DATA.incomes.monthly)}</span>
              </div>
            </div>
            <ul className="space-y-1.5 text-sm">
              {PARTS.map((part) => (
                <li key={part.key} className="flex items-baseline gap-2">
                  <Swatch color={part.color} />
                  <span className="min-w-0 flex-1">{part.label}</span>
                  <span className="font-medium whitespace-nowrap tabular-nums">
                    {euros(part.monthly)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs tabular-nums">
              Soit {whole(TOTAL * 12)} de charges par an.
            </p>
          </CardContent>
        </Card>
      </Page>
    )
  },
}

/* ---------------------------------------------------------------------------
 * D. Sommaire
 * ------------------------------------------------------------------------- */

export const D_Sommaire: StoryObj = {
  name: 'D. Sommaire',
  render: () => (
    <Page title="D · Sommaire">
      <div className="space-y-3">
        <p className="text-lg">
          <span className="font-semibold tabular-nums">{euros(TOTAL)}</span> de
          charges par mois
          <span className="text-muted-foreground block text-sm tabular-nums">
            {whole(TOTAL * 12)} par an · {plural(15, 'charge')}
          </span>
        </p>
        <StackedBar className="h-2" />
        <ul className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
          {[
            ...PARTS,
            {
              key: 'incomes',
              label: 'Revenus récurrents',
              icon: WalletIcon,
              color: 'bg-chart-income',
              ...DATA.incomes,
            },
          ].map((part) => {
            const Icon = part.icon
            const income = part.key === 'incomes'
            return (
              <li key={part.key} className="min-w-0">
                <a
                  href={`#${part.key}`}
                  className="bg-card hover:bg-muted/50 flex h-full flex-col gap-1.5 rounded-xl border p-3"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg text-white',
                        part.color,
                      )}
                    >
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  </span>
                  <span className="text-muted-foreground text-xs break-normal">
                    {part.label} · {part.count}
                  </span>
                  <span
                    className={cn(
                      'mt-auto font-semibold whitespace-nowrap tabular-nums',
                      income && 'text-success-foreground dark:text-success',
                    )}
                  >
                    {income ? '+' : ''}
                    {euros(part.monthly)}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </Page>
  ),
}
