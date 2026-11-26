import type { Meta, StoryObj } from '@storybook/react-vite'
import { cn } from '@capi/ui'
import {
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowUpIcon,
  ChartPieIcon,
  CheckIcon,
  CircleAlertIcon,
  CompassIcon,
  GiftIcon,
  PiggyBankIcon,
  SearchIcon,
  TagIcon,
  TargetIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import {
  Bar,
  BUDGETED,
  Card,
  CATEGORIES,
  CATEGORY,
  CategoryDot,
  COLORS,
  Delta,
  ENVELOPE,
  euros,
  EXPENSE,
  Frame,
  GoTo,
  INCOME,
  KEPT_CENTS,
  KNOWN_DAY,
  LEFT_CENTS,
  MONTH_DAYS,
  OPERATION_COUNT,
  OPERATIONS,
  PLANNED_INCOME_CENTS,
  Question,
  REVIEW_COUNT,
  SAVINGS,
  STATUS_COLOR,
  statusOf,
  TARGET_CENTS,
  targetOf,
  UNBUDGETED,
  UNCATEGORIZED_COUNT,
  WIDTH_ARG,
  type Category,
  type Status,
  type Width,
} from './shared'

/**
 * Prototypes of « one question per page » (#434): Mouvements = where the
 * month's money went, Opérations = find and fix a transaction, Budget = am I
 * within my targets. A figure is shown once, on the page whose question it
 * answers. November 2026, statements known until the 22nd; synthetic data,
 * not app code.
 *
 * A. Le chiffre réponse : each page opens on one big figure that answers
 *    its question (« Gardé », « À revoir », « Reste »), the rest below.
 * B. Pastilles : coloured tiles and counts, read without words (green,
 *    orange, red), the amounts inside the tiles.
 * C. La liste d'abord : no block of figures; the totals sit in the tabs and
 *    the list headers, the page is its list.
 */
const meta: Meta<PageArgs> = {
  title: 'Prototypes/Une question par page (#434)',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
  argTypes: {
    direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
    width: WIDTH_ARG,
    filtered: { control: 'boolean' },
  },
  args: { direction: 'A', width: 390, filtered: false },
}

export default meta

type Direction = 'A' | 'B' | 'C'

interface PageArgs {
  direction: Direction
  width: Width
  /** Opérations: a search is typed (« carrefour »), its sum shows. */
  filtered?: boolean
}

type Story = StoryObj<PageArgs>

const QUESTIONS = {
  mouvements: { icon: CompassIcon, text: 'Où est passé l’argent ?' },
  operations: { icon: SearchIcon, text: 'Trouver, corriger' },
  budget: { icon: TargetIcon, text: 'Suis-je dans mes objectifs ?' },
}

/* ---------------------------------------------------------------------------
 * Shared bits
 * ------------------------------------------------------------------------- */

const PARTS: {
  key: 'income' | 'expense' | 'savings' | 'kept'
  label: string
  icon: LucideIcon
  cents: number
  previousCents?: number
  increaseIsGood: boolean
  color: string
}[] = [
  {
    key: 'income',
    label: 'Revenus',
    icon: ArrowDownIcon,
    cents: INCOME.cents,
    previousCents: INCOME.previousCents,
    increaseIsGood: true,
    color: COLORS.income,
  },
  {
    key: 'expense',
    label: 'Dépenses',
    icon: ArrowUpIcon,
    cents: EXPENSE.cents,
    previousCents: EXPENSE.previousCents,
    increaseIsGood: false,
    color: COLORS.expense,
  },
  {
    key: 'savings',
    label: 'Épargne',
    icon: PiggyBankIcon,
    cents: SAVINGS.cents,
    previousCents: SAVINGS.previousCents,
    increaseIsGood: true,
    color: COLORS.savings,
  },
  {
    key: 'kept',
    label: 'Gardé',
    icon: WalletIcon,
    cents: KEPT_CENTS,
    increaseIsGood: true,
    color: COLORS.kept,
  },
]

const PART = Object.fromEntries(PARTS.map((p) => [p.key, p])) as Record<
  (typeof PARTS)[number]['key'],
  (typeof PARTS)[number]
>

/** Where the income went: dépenses, épargne, gardé, as one bar. */
function FlowBar({ legend = true }: { legend?: boolean }) {
  const parts = [PART.expense, PART.savings, PART.kept]
  return (
    <div className="space-y-2">
      <div className="flex h-4 overflow-hidden rounded-full">
        {parts.map((part) => (
          <span
            key={part.key}
            style={{
              width: `${(part.cents / INCOME.cents) * 100}%`,
              background: part.color,
            }}
          />
        ))}
      </div>
      {legend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {parts.map((part) => (
            <span key={part.key} className="inline-flex items-center gap-1">
              <span
                className="size-2.5 rounded-full"
                style={{ background: part.color }}
              />
              {part.label}
              <b className="tabular-nums">{euros(part.cents)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** The expense categories with their share bar and month-over-month change. */
function CategoryRows() {
  const max = Math.max(...CATEGORIES.map((c) => c.cents))
  return (
    <ul className="divide-y">
      {CATEGORIES.map((category) => (
        <li key={category.id} className="flex items-center gap-3 py-2">
          <CategoryDot category={category} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{category.name}</span>
              <b className="whitespace-nowrap tabular-nums">
                {euros(category.cents)}
              </b>
            </div>
            <div className="flex items-center gap-2">
              <Bar
                value={category.cents}
                max={max}
                color={category.color}
                className="flex-1"
              />
              <Delta
                cents={category.cents - category.previousCents}
                increaseIsGood={false}
                className="w-16 text-right text-xs"
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Six months of expenses, the current one partial (lighter). */
function MiniTrend() {
  const months = [
    ['juin', 205000],
    ['juil.', 231000],
    ['août', 248000],
    ['sept.', 199000],
    ['oct.', 214000],
    ['nov.', EXPENSE.cents],
  ] as const
  const max = Math.max(...months.map(([, v]) => v))
  return (
    <div className="flex h-24 items-end gap-2">
      {months.map(([label, value], i) => (
        <div key={label} className="flex flex-1 flex-col items-center gap-1">
          <span
            className="w-full rounded-t"
            style={{
              height: `${(value / max) * 72}px`,
              background: COLORS.expense,
              opacity: i === months.length - 1 ? 0.45 : 1,
            }}
          />
          <span className="text-muted-foreground text-[10px]">{label}</span>
        </div>
      ))}
    </div>
  )
}

function SearchBox({ filtered }: { filtered: boolean }) {
  return (
    <div className="bg-card flex h-11 items-center gap-2 rounded-lg border px-3 text-sm">
      <SearchIcon aria-hidden className="text-muted-foreground size-4" />
      {filtered ? (
        <span>carrefour</span>
      ) : (
        <span className="text-muted-foreground">Rechercher</span>
      )}
    </div>
  )
}

const FILTERED = OPERATIONS.filter((o) => o.label.includes('CARREFOUR'))
const FILTERED_COUNT = 12
const FILTERED_CENTS = -34060

function OperationRow({ operation }: { operation: (typeof OPERATIONS)[0] }) {
  const category = operation.category ? CATEGORY[operation.category] : null
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      {category ? (
        <CategoryDot category={category} size="sm" />
      ) : (
        <span className="bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full">
          <TagIcon aria-hidden className="size-3.5" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{operation.label}</span>
      {operation.review && (
        <span
          aria-label="À revoir"
          className="size-2 shrink-0 rounded-full"
          style={{ background: COLORS.warning }}
        />
      )}
      <b
        className="text-sm whitespace-nowrap tabular-nums"
        style={operation.cents > 0 ? { color: COLORS.good } : undefined}
      >
        {operation.cents > 0 ? '+' : ''}
        {euros(operation.cents, true)}
      </b>
    </li>
  )
}

function OperationList({
  operations,
  header,
}: {
  operations: typeof OPERATIONS
  header?: ReactNode
}) {
  const days = [...new Set(operations.map((o) => o.day))]
  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      {header}
      {days.map((day) => (
        <div key={day}>
          <p className="bg-muted/50 text-muted-foreground px-3 py-1 text-xs">
            {day}
          </p>
          <ul className="divide-y">
            {operations
              .filter((o) => o.day === day)
              .map((operation) => (
                <OperationRow key={operation.label} operation={operation} />
              ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

const KNOWN_SHARE = KNOWN_DAY / MONTH_DAYS

function lineLeft(category: Category) {
  return targetOf(category) - category.cents
}

/** « reste 114 € » or « +34 € » in red. */
function LeftText({
  category,
  short = false,
}: {
  category: Category
  short?: boolean
}) {
  const left = lineLeft(category)
  return left >= 0 ? (
    <span className="text-muted-foreground whitespace-nowrap tabular-nums">
      {short ? '' : 'reste '}
      <b className="text-foreground">{euros(left)}</b>
    </span>
  ) : (
    <b
      className="whitespace-nowrap tabular-nums"
      style={{ color: COLORS.over }}
    >
      +{euros(-left)}
    </b>
  )
}

function BudgetRows({ categories = BUDGETED }: { categories?: Category[] }) {
  return (
    <ul className="divide-y">
      {categories.map((category) => {
        const status = statusOf(category) as Status
        return (
          <li key={category.id} className="flex items-center gap-3 py-2">
            <CategoryDot category={category} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{category.name}</span>
                <LeftText category={category} />
              </div>
              <Bar
                value={category.cents}
                max={targetOf(category)}
                color={STATUS_COLOR[status]}
                marker={KNOWN_SHARE}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function EnvelopeRow() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full text-white"
        style={{ background: 'var(--chart-8)' }}
      >
        <GiftIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="truncate">{ENVELOPE.name}</span>
          <span className="text-muted-foreground whitespace-nowrap tabular-nums">
            <b className="text-foreground">{euros(ENVELOPE.paidCents)}</b> /{' '}
            {euros(ENVELOPE.putAsideCents)}
          </span>
        </div>
        <Bar
          value={ENVELOPE.paidCents}
          max={ENVELOPE.putAsideCents}
          color="var(--chart-8)"
        />
      </div>
    </div>
  )
}

const STATUS_COUNT: Record<Status, number> = {
  ok: BUDGETED.filter((c) => statusOf(c) === 'ok').length,
  warning: BUDGETED.filter((c) => statusOf(c) === 'warning').length,
  over: BUDGETED.filter((c) => statusOf(c) === 'over').length,
}

const INCOME_GAP_CENTS = INCOME.cents - PLANNED_INCOME_CENTS

/* ---------------------------------------------------------------------------
 * A. Le chiffre réponse
 * ------------------------------------------------------------------------- */

function Hero({
  label,
  value,
  color,
  icon: Icon,
  children,
}: {
  label: string
  value: string
  color: string
  icon: LucideIcon
  children?: ReactNode
}) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full text-white"
          style={{ background: color }}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">{label}</p>
          <p
            className="text-3xl leading-tight font-semibold whitespace-nowrap tabular-nums"
            style={{ color }}
          >
            {value}
          </p>
        </div>
      </div>
      {children}
    </Card>
  )
}

function MouvementsA() {
  return (
    <>
      <Hero
        label="Gardé ce mois"
        value={euros(KEPT_CENTS)}
        color={COLORS.kept}
        icon={WalletIcon}
      >
        <FlowBar />
      </Hero>
      <div className="grid grid-cols-3 gap-2">
        {[PART.income, PART.expense, PART.savings].map((part, i) => (
          <button
            key={part.key}
            type="button"
            className={cn(
              '@container min-w-0 rounded-xl border px-2 pt-2.5 pb-2 text-left',
              i === 1
                ? 'border-primary bg-primary/5 ring-primary ring-1'
                : 'bg-card',
            )}
            style={{ boxShadow: `inset 0 3px 0 ${part.color}` }}
          >
            <span className="text-muted-foreground block truncate text-xs">
              {part.label}
            </span>
            <span className="block text-[clamp(0.75rem,17cqi,1.25rem)] font-semibold whitespace-nowrap tabular-nums">
              {euros(part.cents)}
            </span>
            <Delta
              cents={part.cents - (part.previousCents ?? 0)}
              increaseIsGood={part.increaseIsGood}
              className="text-xs"
            />
          </button>
        ))}
      </div>
      <Card>
        <CategoryRows />
      </Card>
      <Card className="space-y-2">
        <p className="text-sm font-medium">6 mois</p>
        <MiniTrend />
      </Card>
    </>
  )
}

function OperationsA({ filtered }: { filtered: boolean }) {
  return (
    <>
      <Hero
        label="À revoir"
        value={String(REVIEW_COUNT)}
        color={COLORS.warning}
        icon={CircleAlertIcon}
      >
        <button
          type="button"
          className="text-primary-foreground bg-primary h-11 w-full rounded-lg text-sm font-medium"
        >
          Revoir
        </button>
      </Hero>
      <SearchBox filtered={filtered} />
      {filtered && (
        <p className="flex items-center justify-between px-1 text-sm">
          <span className="text-muted-foreground">
            {FILTERED_COUNT} opérations
          </span>
          <b className="tabular-nums">{euros(FILTERED_CENTS, true)}</b>
        </p>
      )}
      <OperationList operations={filtered ? FILTERED : OPERATIONS} />
    </>
  )
}

function BudgetA() {
  return (
    <>
      <Hero
        label="Reste à dépenser"
        value={euros(LEFT_CENTS)}
        color={COLORS.good}
        icon={TargetIcon}
      >
        <Bar
          value={TARGET_CENTS - LEFT_CENTS}
          max={TARGET_CENTS}
          color={COLORS.warning}
          marker={KNOWN_SHARE}
          className="h-3"
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusChip
            status="over"
            count={STATUS_COUNT.over}
            label={STATUS_COUNT.over > 1 ? 'dépassés' : 'dépassé'}
          />
          <StatusChip
            status="warning"
            count={STATUS_COUNT.warning}
            label="limite"
          />
        </div>
      </Hero>
      <Card>
        <BudgetRows />
      </Card>
      <Card>
        <EnvelopeRow />
      </Card>
      <Card className="flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex items-center gap-2">
          <ArrowDownIcon
            aria-hidden
            className="size-4"
            style={{ color: COLORS.income }}
          />
          Revenus prévus
        </span>
        <Delta cents={INCOME_GAP_CENTS} increaseIsGood />
      </Card>
      <Card className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Hors budget</span>
        <span className="inline-flex items-center gap-2">
          {UNBUDGETED.map((c) => (
            <CategoryDot key={c.id} category={c} size="sm" />
          ))}
          <b className="tabular-nums">
            {euros(UNBUDGETED.reduce((s, c) => s + c.cents, 0))}
          </b>
        </span>
      </Card>
    </>
  )
}

function StatusChip({
  status,
  count,
  label,
}: {
  status: Status
  count: number
  label: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium"
      style={{
        color: STATUS_COLOR[status],
        background: `color-mix(in oklab, ${STATUS_COLOR[status]} 14%, transparent)`,
      }}
    >
      <b>{count}</b> {label}
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * B. Pastilles
 * ------------------------------------------------------------------------- */

function Tint({
  color,
  className,
  children,
}: {
  color: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn('@container min-w-0 rounded-xl p-3', className)}
      style={{
        background: `color-mix(in oklab, ${color} 13%, var(--card))`,
        border: `1px solid color-mix(in oklab, ${color} 35%, transparent)`,
      }}
    >
      {children}
    </div>
  )
}

function PartTile({ part }: { part: (typeof PARTS)[number] }) {
  const Icon = part.icon
  return (
    <Tint color={part.color}>
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-full text-white"
        style={{ background: part.color }}
      >
        <Icon className="size-4" />
      </span>
      <p className="mt-2 text-[clamp(0.85rem,15cqi,1.5rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
        {euros(part.cents)}
      </p>
      <p className="text-muted-foreground flex items-center justify-between gap-1 text-xs">
        <span className="truncate">{part.label}</span>
        {part.previousCents !== undefined && (
          <Delta
            cents={part.cents - part.previousCents}
            increaseIsGood={part.increaseIsGood}
          />
        )}
      </p>
    </Tint>
  )
}

function MouvementsB() {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        {PARTS.map((part) => (
          <PartTile key={part.key} part={part} />
        ))}
      </div>
      <FlowBar legend={false} />
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3">
        {CATEGORIES.map((category) => (
          <Card
            key={category.id}
            className="@container flex items-center gap-2 p-2.5"
          >
            <CategoryDot category={category} />
            <div className="min-w-0">
              <p className="text-[clamp(0.8rem,11cqi,1rem)] font-semibold whitespace-nowrap tabular-nums">
                {euros(category.cents)}
              </p>
              <Delta
                cents={category.cents - category.previousCents}
                increaseIsGood={false}
                className="text-xs"
              />
            </div>
          </Card>
        ))}
      </div>
      <Card className="space-y-2">
        <p className="text-sm font-medium">6 mois</p>
        <MiniTrend />
      </Card>
    </>
  )
}

function Pill({
  color,
  icon: Icon,
  children,
  active = false,
}: {
  color: string
  icon: LucideIcon
  children: ReactNode
  active?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium',
        active && 'ring-2',
      )}
      style={{
        color,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        ['--tw-ring-color' as string]: color,
      }}
    >
      <Icon aria-hidden className="size-4" />
      {children}
    </span>
  )
}

function OperationsB({ filtered }: { filtered: boolean }) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Pill color={COLORS.warning} icon={CircleAlertIcon}>
          <b>{REVIEW_COUNT}</b>
        </Pill>
        <Pill color="var(--muted-foreground)" icon={TagIcon}>
          <b>{UNCATEGORIZED_COUNT}</b>
        </Pill>
        <Pill color="var(--chart-income)" icon={ArrowLeftRightIcon}>
          <b>{OPERATION_COUNT}</b>
        </Pill>
      </div>
      <SearchBox filtered={filtered} />
      {filtered && (
        <div className="flex gap-2">
          <Pill color="var(--primary)" icon={ChartPieIcon} active>
            {FILTERED_COUNT} ·{' '}
            <b className="tabular-nums">{euros(FILTERED_CENTS, true)}</b>
          </Pill>
        </div>
      )}
      <OperationList operations={filtered ? FILTERED : OPERATIONS} />
    </>
  )
}

function StatusBubble({ status, count }: { status: Status; count: number }) {
  const Icon =
    status === 'ok'
      ? CheckIcon
      : status === 'warning'
        ? CircleAlertIcon
        : ArrowUpIcon
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <span
        className="grid size-14 place-items-center rounded-full text-2xl font-semibold text-white tabular-nums"
        style={{ background: STATUS_COLOR[status] }}
      >
        {count}
      </span>
      <Icon
        aria-hidden
        className="size-4"
        style={{ color: STATUS_COLOR[status] }}
      />
    </div>
  )
}

function BudgetB() {
  return (
    <>
      <Card className="flex items-center gap-2 py-4">
        <StatusBubble status="ok" count={STATUS_COUNT.ok} />
        <StatusBubble status="warning" count={STATUS_COUNT.warning} />
        <StatusBubble status="over" count={STATUS_COUNT.over} />
      </Card>
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-3">
        {[...BUDGETED]
          .sort((a, b) => lineLeft(a) / targetOf(a) - lineLeft(b) / targetOf(b))
          .map((category) => {
            const status = statusOf(category) as Status
            return (
              <Tint
                key={category.id}
                color={STATUS_COLOR[status]}
                className="space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <CategoryDot category={category} />
                  {category.id === ENVELOPE.category && (
                    <GiftIcon
                      aria-label="Enveloppe"
                      className="size-4"
                      style={{ color: 'var(--chart-8)' }}
                    />
                  )}
                </div>
                <p className="text-[clamp(0.8rem,13cqi,1.25rem)] font-semibold">
                  <LeftText category={category} short />
                </p>
                <Bar
                  value={category.cents}
                  max={targetOf(category)}
                  color={STATUS_COLOR[status]}
                  marker={KNOWN_SHARE}
                />
              </Tint>
            )
          })}
        <Tint color="var(--muted-foreground)" className="space-y-2">
          <div className="flex gap-1">
            {UNBUDGETED.map((c) => (
              <CategoryDot key={c.id} category={c} />
            ))}
          </div>
          <p className="text-[clamp(0.8rem,13cqi,1.25rem)] font-semibold tabular-nums">
            {euros(UNBUDGETED.reduce((s, c) => s + c.cents, 0))}
          </p>
          <p className="text-muted-foreground text-xs">Hors budget</p>
        </Tint>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Card className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs">
            <TargetIcon aria-hidden className="size-3.5" /> Reste
          </span>
          <p className="text-lg font-semibold tabular-nums">
            {euros(LEFT_CENTS)}
          </p>
        </Card>
        <Card className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs">
            <ArrowDownIcon
              aria-hidden
              className="size-3.5"
              style={{ color: COLORS.income }}
            />{' '}
            vs prévu
          </span>
          <Delta
            cents={INCOME_GAP_CENTS}
            increaseIsGood
            className="text-lg font-semibold"
          />
        </Card>
      </div>
      <Card>
        <EnvelopeRow />
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * C. La liste d'abord
 * ------------------------------------------------------------------------- */

function MouvementsC() {
  return (
    <>
      <div
        role="tablist"
        className="bg-muted grid grid-cols-3 gap-1 rounded-xl p-1"
      >
        {[PART.income, PART.expense, PART.savings].map((part, i) => (
          <span
            key={part.key}
            role="tab"
            aria-selected={i === 1}
            className={cn(
              '@container min-w-0 rounded-lg px-2 py-1.5 text-center',
              i === 1 && 'bg-card shadow-sm',
            )}
          >
            <span className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
              <span
                className="size-2 rounded-full"
                style={{ background: part.color }}
              />
              {part.label}
            </span>
            <span className="block text-[clamp(0.75rem,16cqi,1.1rem)] font-semibold whitespace-nowrap tabular-nums">
              {euros(part.cents)}
            </span>
          </span>
        ))}
      </div>
      <Card>
        <CategoryRows />
        <p className="flex items-center justify-between border-t pt-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <WalletIcon
              aria-hidden
              className="size-4"
              style={{ color: COLORS.kept }}
            />
            Gardé
          </span>
          <b className="tabular-nums" style={{ color: COLORS.kept }}>
            {euros(KEPT_CENTS)}
          </b>
        </p>
      </Card>
      <GoTo icon={ChartPieIcon}>Tendance</GoTo>
    </>
  )
}

function OperationsC({ filtered }: { filtered: boolean }) {
  const review = OPERATIONS.filter((o) => o.review)
  return (
    <>
      <SearchBox filtered={filtered} />
      {!filtered && (
        <section
          className="overflow-hidden rounded-xl"
          style={{ border: `1px solid ${COLORS.warning}` }}
        >
          <p
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
            style={{
              color: COLORS.warning,
              background: `color-mix(in oklab, ${COLORS.warning} 12%, transparent)`,
            }}
          >
            <CircleAlertIcon aria-hidden className="size-4" />À revoir ·{' '}
            {REVIEW_COUNT}
          </p>
          <ul className="bg-card divide-y">
            {review.map((operation) => (
              <OperationRow key={operation.label} operation={operation} />
            ))}
          </ul>
        </section>
      )}
      <OperationList
        operations={filtered ? FILTERED : OPERATIONS.filter((o) => !o.review)}
        header={
          filtered ? (
            <p className="flex items-center justify-between border-b px-3 py-2 text-sm">
              <span className="text-muted-foreground">{FILTERED_COUNT}</span>
              <b className="tabular-nums">{euros(FILTERED_CENTS, true)}</b>
            </p>
          ) : undefined
        }
      />
    </>
  )
}

function BudgetC() {
  const groups: { status: Status; icon: LucideIcon }[] = [
    { status: 'over', icon: ArrowUpIcon },
    { status: 'warning', icon: CircleAlertIcon },
    { status: 'ok', icon: CheckIcon },
  ]
  return (
    <>
      <p className="flex items-baseline justify-between px-1">
        <span className="inline-flex items-center gap-1.5 text-sm">
          <TargetIcon aria-hidden className="size-4" /> Reste
        </span>
        <span className="tabular-nums">
          <b className="text-xl">{euros(LEFT_CENTS)}</b>{' '}
          <span className="text-muted-foreground text-sm">
            / {euros(TARGET_CENTS)}
          </span>
        </span>
      </p>
      {groups.map(({ status, icon: Icon }) => {
        const lines = BUDGETED.filter((c) => statusOf(c) === status)
        if (lines.length === 0) return null
        return (
          <section
            key={status}
            className="bg-card overflow-hidden rounded-xl border"
          >
            <p
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
              style={{
                color: STATUS_COLOR[status],
                background: `color-mix(in oklab, ${STATUS_COLOR[status]} 12%, transparent)`,
              }}
            >
              <Icon aria-hidden className="size-4" />
              {lines.length}
            </p>
            <div className="px-3">
              <BudgetRows categories={lines} />
            </div>
          </section>
        )
      })}
      <Card>
        <EnvelopeRow />
      </Card>
      <Card className="space-y-1 text-sm">
        <p className="flex items-center justify-between">
          <span className="text-muted-foreground">Hors budget</span>
          <b className="tabular-nums">
            {euros(UNBUDGETED.reduce((s, c) => s + c.cents, 0))}
          </b>
        </p>
        <p className="flex items-center justify-between">
          <span className="text-muted-foreground">Revenus vs prévu</span>
          <Delta cents={INCOME_GAP_CENTS} increaseIsGood />
        </p>
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * Pages
 * ------------------------------------------------------------------------- */

function Page({
  page,
  direction,
  width,
  filtered = false,
}: PageArgs & { page: keyof typeof QUESTIONS }) {
  const question = QUESTIONS[page]
  const body = {
    mouvements: { A: <MouvementsA />, B: <MouvementsB />, C: <MouvementsC /> },
    operations: {
      A: <OperationsA filtered={filtered} />,
      B: <OperationsB filtered={filtered} />,
      C: <OperationsC filtered={filtered} />,
    },
    budget: { A: <BudgetA />, B: <BudgetB />, C: <BudgetC /> },
  }[page][direction]
  return (
    <Frame
      width={width}
      title={page === 'budget' ? 'Budget' : 'Mouvements'}
      active={page === 'budget' ? 'Budget' : 'Mouvements'}
      tab={
        page === 'mouvements'
          ? 'resume'
          : page === 'operations'
            ? 'operations'
            : undefined
      }
    >
      <Question icon={question.icon}>{question.text}</Question>
      {body}
    </Frame>
  )
}

export const Mouvements: Story = {
  render: (args) => <Page page="mouvements" {...args} />,
}

export const Operations: Story = {
  name: 'Opérations',
  render: (args) => <Page page="operations" {...args} />,
}

export const Budget: Story = {
  render: (args) => <Page page="budget" {...args} />,
}

/* ---------------------------------------------------------------------------
 * Where each figure lives, before and after
 * ------------------------------------------------------------------------- */

const PAGES = [
  { key: 'm', label: 'Mouvements', icon: CompassIcon },
  { key: 'o', label: 'Opérations', icon: SearchIcon },
  { key: 'b', label: 'Budget', icon: TargetIcon },
] as const

type PageKey = (typeof PAGES)[number]['key']

const FIGURES: {
  label: string
  icon: LucideIcon
  before: PageKey[]
  after: PageKey
}[] = [
  {
    label: 'Revenus',
    icon: ArrowDownIcon,
    before: ['m', 'o', 'b'],
    after: 'm',
  },
  { label: 'Dépenses', icon: ArrowUpIcon, before: ['m', 'o', 'b'], after: 'm' },
  { label: 'Épargne', icon: PiggyBankIcon, before: ['m'], after: 'm' },
  { label: 'Gardé / Net', icon: WalletIcon, before: ['m', 'o'], after: 'm' },
  {
    label: 'Par catégorie',
    icon: ChartPieIcon,
    before: ['m', 'b'],
    after: 'm',
  },
  { label: 'À revoir', icon: CircleAlertIcon, before: ['o', 'm'], after: 'o' },
  {
    label: 'Somme d’une recherche',
    icon: SearchIcon,
    before: ['o'],
    after: 'o',
  },
  { label: 'Reste', icon: TargetIcon, before: ['b'], after: 'b' },
  { label: 'Enveloppes', icon: GiftIcon, before: ['b'], after: 'b' },
]

function FigureMap({ width }: { width: Width }) {
  return (
    <div
      className="bg-background text-foreground mx-auto space-y-4 border-x p-4"
      style={{ width }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,1.6rem)_1rem_repeat(3,1.6rem)] gap-x-1 items-center gap-y-2 text-sm">
        <span />
        {PAGES.map((page) => (
          <page.icon
            key={`b-${page.key}`}
            aria-label={page.label}
            className="text-muted-foreground mx-auto size-5"
          />
        ))}
        <span />
        {PAGES.map((page) => (
          <page.icon
            key={`a-${page.key}`}
            aria-label={page.label}
            className="text-muted-foreground mx-auto size-5"
          />
        ))}
        <span />
        <span className="text-muted-foreground col-span-3 text-center text-xs">
          Avant
        </span>
        <span />
        <span className="col-span-3 text-center text-xs font-medium">
          Après
        </span>
        {FIGURES.map((figure) => (
          <FigureRow key={figure.label} figure={figure} />
        ))}
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
        {PAGES.map((page) => (
          <span key={page.key} className="inline-flex items-center gap-1">
            <page.icon aria-hidden className="size-3.5" /> {page.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function FigureRow({ figure }: { figure: (typeof FIGURES)[number] }) {
  const repeated = figure.before.length > 1
  return (
    <>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <figure.icon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{figure.label}</span>
      </span>
      {PAGES.map((page) => (
        <Dot
          key={`b-${page.key}`}
          on={figure.before.includes(page.key)}
          color={repeated ? COLORS.over : 'var(--muted-foreground)'}
        />
      ))}
      <span className="text-muted-foreground text-center">→</span>
      {PAGES.map((page) => (
        <Dot
          key={`a-${page.key}`}
          on={figure.after === page.key}
          color={COLORS.good}
        />
      ))}
    </>
  )
}

function Dot({ on, color }: { on: boolean; color: string }) {
  return (
    <span className="flex justify-center">
      <span
        className={cn('size-4 rounded-full', !on && 'bg-muted size-2')}
        style={on ? { background: color } : undefined}
      />
    </span>
  )
}

export const Chiffres: Story = {
  name: 'Où vit chaque chiffre',
  argTypes: {
    direction: { table: { disable: true } },
    filtered: { table: { disable: true } },
  },
  render: ({ width }) => <FigureMap width={width} />,
}
