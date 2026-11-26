import { Card, cn, Skeleton } from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronRightIcon,
  PiggyBankIcon,
  Settings2Icon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { categoryIconComponent } from '#/components/categories/category-icons'
import { envelopeColor } from '#/components/envelopes/format'
import { envelopesQuery } from '#/components/envelopes/queries'
import type {
  DashboardAccountDto,
  DashboardOverviewDto,
  DashboardWidgetDto,
  EnvelopeSummaryDto,
  OwedContactRowDto,
} from '#/api/types.gen'
import { investmentsSummaryQuery } from '#/components/accounts/queries'
import { owedSummaryQuery } from '#/components/owed/queries'
import { recurringListQuery } from '#/components/subscriptions/queries'
import { AccountTypeBadge } from '#/components/transactions/filter-options'
import { formatSignedWholeEuros, formatWholeEuros } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'
import { ForecastPath } from '../ForecastCard'
import { NetWorthRow } from '../GlanceCard'
import { dashboardHistoryQuery } from '../queries'

/**
 * The dashboard's elements added by #495, each answering one question in
 * one card, few words, its figures from the endpoint its page uses (and
 * that page's rules), the card's title opening the page.
 */

export function ElementCard({
  title,
  to,
  search,
  children,
  className,
}: {
  title: ReactNode
  to: LinkProps['to']
  search?: LinkProps['search']
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('min-w-0 gap-0.5 px-2 pt-1.5 pb-2', className)}>
      <h2 className="text-sm font-normal">
        <Link
          to={to}
          search={search as never}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-9 items-center justify-between gap-3 rounded-md px-2 text-xs outline-none focus-visible:ring-2"
        >
          {title}
          <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
        </Link>
      </h2>
      {children}
    </Card>
  )
}

/** One row of an element: a badge, a name, a figure, the whole row a link. */
function ElementRow({
  badge,
  title,
  detail,
  value,
  valueClassName,
  link,
}: {
  badge: ReactNode
  title: ReactNode
  detail?: ReactNode
  value: ReactNode
  valueClassName?: string
  link: { to: LinkProps['to']; params?: LinkProps['params'] }
}) {
  return (
    <li>
      <Link
        to={link.to}
        params={link.params as never}
        className="hover:bg-muted/60 focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-lg px-2 py-1 text-sm outline-none focus-visible:ring-2"
      >
        {badge}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          {detail && (
            <span className="text-muted-foreground block text-xs">
              {detail}
            </span>
          )}
        </span>
        <span
          className={cn(
            'shrink-0 font-semibold whitespace-nowrap tabular-nums',
            valueClassName,
          )}
        >
          {value}
        </span>
      </Link>
    </li>
  )
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" className="px-2">
      <Skeleton className="h-11 w-full" />
    </div>
  )
}

/** A quiet line in place of the figures: nothing to show, or not loaded. */
function Quiet({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex min-h-11 items-center gap-2 px-2 text-sm">
      {children}
    </p>
  )
}

/** An element whose chosen accounts were all deleted: say so, offer to choose. */
export function NoAccountLeft({ onEdit }: { onEdit?: () => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 px-2 text-sm">
      <span className="text-muted-foreground">Aucun compte</span>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="text-primary relative inline-flex items-center gap-1 font-medium pointer-coarse:touch-hitbox"
        >
          <Settings2Icon aria-hidden className="size-4" />
          Choisir
        </button>
      )}
    </div>
  )
}

/** The accounts an element shows: the chosen ones, or every one it takes. */
export function pickAccounts<T extends { id: string }>(
  accounts: T[],
  chosen: string[] | null,
): T[] {
  if (chosen === null) return accounts
  // In the chosen order (« Mon ordre »).
  const byId = new Map(accounts.map((account) => [account.id, account]))
  return chosen.flatMap((id) => byId.get(id) ?? [])
}

/* ---------------------------------------------------------------------------
 * Soldes
 * ------------------------------------------------------------------------- */

/** What each account holds in envelopes (#429), by account id. */
function envelopeAmounts(envelopes: EnvelopeSummaryDto[] | undefined) {
  const amounts = new Map<string, number>()
  for (const envelope of envelopes ?? []) {
    if (envelope.archived) continue
    for (const part of envelope.accounts) {
      amounts.set(
        part.accountId,
        (amounts.get(part.accountId) ?? 0) + part.amountCents,
      )
    }
  }
  return amounts
}

/**
 * « Soldes »: one row per account, its balance, « libre » under it when it
 * holds envelopes (balance − envelopes, never changing the balance), the
 * day its data goes to when it is stale.
 */
export function BalancesElement({
  overview,
  widget,
  year,
  onEdit,
}: {
  overview: DashboardOverviewDto
  widget: DashboardWidgetDto
  year: string
  onEdit?: () => void
}) {
  const envelopes = useQuery(envelopesQuery())
  const held = envelopeAmounts(envelopes.data)
  const picked = pickAccounts(overview.accounts, widget.accountIds)
  // « Décroissant » / « Croissant »: by balance, an unknown one last.
  const accounts =
    widget.settings.balancesSort === 'desc' ||
    widget.settings.balancesSort === 'asc'
      ? sortByBalance(picked, widget.settings.balancesSort)
      : picked
  return (
    <ElementCard title="Soldes" to={ROUTES.accounts} className="@container">
      {accounts.length === 0 ? (
        <NoAccountLeft onEdit={onEdit} />
      ) : (
        // A row each on a phone; once the card is wide (« large » on a
        // computer), a tile each, side by side (#495).
        <ul className="grid grid-cols-1 @lg:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] @lg:gap-2 @lg:pt-1">
          {accounts.map((account) => (
            <li key={account.id}>
              <Link
                to={ROUTES.account}
                params={{ accountId: account.id }}
                className="hover:bg-muted/60 focus-visible:ring-ring @lg:bg-muted/40 @lg:hover:bg-muted/70 flex min-h-11 flex-wrap items-center gap-x-3 rounded-lg px-2 py-1 text-sm outline-none focus-visible:ring-2 @lg:h-full @lg:content-start @lg:items-start @lg:gap-y-2 @lg:rounded-xl @lg:p-3"
              >
                <AccountTypeBadge type={account.type} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {account.name}
                  </span>
                  {balanceDetail(account, held.get(account.id), year) && (
                    <span className="text-muted-foreground block text-xs">
                      {balanceDetail(account, held.get(account.id), year)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums @lg:basis-full @lg:text-lg">
                  {account.balanceCents === null
                    ? '—'
                    : formatWholeEuros(account.balanceCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ElementCard>
  )
}

/** By balance, largest or smallest first; an unknown balance last. */
function sortByBalance<T extends { balanceCents: number | null }>(
  accounts: T[],
  direction: 'desc' | 'asc',
): T[] {
  const sign = direction === 'desc' ? -1 : 1
  return [...accounts].sort((a, b) => {
    if (a.balanceCents === null) return b.balanceCents === null ? 0 : 1
    if (b.balanceCents === null) return -1
    return sign * (a.balanceCents - b.balanceCents)
  })
}

function balanceDetail(
  account: DashboardAccountDto,
  inEnvelopes: number | undefined,
  year: string,
): ReactNode {
  const parts: ReactNode[] = []
  // Always a line, so every account reads the same (#495).
  if (inEnvelopes && account.balanceCents !== null) {
    parts.push(`${formatWholeEuros(account.balanceCents - inEnvelopes)} libre`)
  } else {
    parts.push('Pas d’enveloppe')
  }
  if (account.stale && account.dataUntil) {
    parts.push(
      <span
        key="stale"
        className="text-warning-foreground dark:text-warning font-medium"
      >
        au {formatShortDay(account.dataUntil, year)}
      </span>,
    )
  }
  if (parts.length === 0) return undefined
  return parts.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))
}

/* ---------------------------------------------------------------------------
 * Patrimoine, Fin de mois on their own
 * ------------------------------------------------------------------------- */

/**
 * « Patrimoine » in its own card. On chosen accounts it is titled « n
 * comptes », never passed off as the whole; its change is against those
 * accounts' balances at the last month end (`GET /dashboard/history`).
 */
export function NetWorthElement({
  overview,
  widget,
  year,
  onEdit,
}: {
  overview: DashboardOverviewDto
  widget: DashboardWidgetDto
  year: string
  onEdit?: () => void
}) {
  const chosen = widget.accountIds
  const history = useQuery({
    ...dashboardHistoryQuery(2),
    enabled: chosen !== null,
  })
  if (chosen === null) {
    return (
      <Card className="min-w-0 px-2 py-1.5">
        <NetWorthRow netWorth={overview.netWorth} year={year} />
      </Card>
    )
  }
  const accounts = pickAccounts(overview.accounts, chosen)
  if (accounts.length === 0) {
    return (
      <ElementCard title="Patrimoine" to={ROUTES.accounts}>
        <NoAccountLeft onEdit={onEdit} />
      </ElementCard>
    )
  }
  const ids = new Set(accounts.map((account) => account.id))
  const total = accounts.reduce(
    (sum, account) => sum + (account.balanceCents ?? 0),
    0,
  )
  // The month before the current one in the history, oldest first.
  const monthEnd = history.data?.months.at(-2)
  const previous = monthEnd
    ? monthEnd.accounts
        .filter((account) => ids.has(account.accountId))
        .reduce((sum, account) => sum + account.balanceCents, 0)
    : null
  return (
    <Card className="min-w-0 px-2 py-1.5">
      <NetWorthRow
        title={`Patrimoine · ${accounts.length === 1 ? '1 compte' : `${accounts.length} comptes`}`}
        netWorth={{
          totalCents: total,
          previousMonthEnd: overview.netWorth.previousMonthEnd,
          previousMonthEndCents: previous,
        }}
        year={year}
      />
    </Card>
  )
}

export function ForecastElement({
  widget,
  onEdit,
}: {
  widget: DashboardWidgetDto
  onEdit?: () => void
}) {
  if (widget.accountIds !== null && widget.accountIds.length === 0) {
    return (
      <ElementCard title="Fin de mois" to={ROUTES.forecast}>
        <NoAccountLeft onEdit={onEdit} />
      </ElementCard>
    )
  }
  return (
    <Card className="min-w-0 px-2 py-1.5 empty:hidden">
      <ForecastPath accountIds={widget.accountIds} />
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Argent dû
 * ------------------------------------------------------------------------- */

const OWED_TONE = {
  toMe: {
    tile: 'bg-chart-delta-good/10 text-chart-delta-good',
    badge: 'bg-chart-delta-good/15 text-chart-delta-good',
    text: 'text-chart-delta-good',
  },
  iOwe: {
    tile: 'bg-warning/15 text-warning-foreground dark:text-warning',
    badge: 'bg-warning/20 text-warning-foreground dark:text-warning',
    text: 'text-warning-foreground dark:text-warning',
  },
} as const

interface OwedPerson {
  contactId: string
  name: string
  toMe: number
  iOwe: number
}

/** People shown under the totals. */
const OWED_ROWS = 3

/**
 * « Argent dû » (#359): what I'm owed in green, what I owe in orange, then
 * the people with the most open. Never in the net worth.
 */
export function OwedElement({ widget }: { widget: DashboardWidgetDto }) {
  const { data } = useQuery(owedSummaryQuery)
  const side = widget.settings.owedSide ?? 'both'
  const showToMe = side !== 'i_owe'
  const showIOwe = side !== 'owed_to_me'
  const title =
    side === 'owed_to_me'
      ? 'On me doit'
      : side === 'i_owe'
        ? 'Je dois'
        : 'Argent dû'
  if (!data) {
    return (
      <ElementCard title={title} to={ROUTES.owed}>
        <Loading />
      </ElementCard>
    )
  }
  // One row per person, both sides on it when both are open (two
  // amounts, never offset here: « Compenser » does that, #484).
  const byContact = new Map<string, OwedPerson>()
  const add = (row: OwedContactRowDto, column: 'toMe' | 'iOwe') => {
    const person = byContact.get(row.contactId) ?? {
      contactId: row.contactId,
      name: row.name,
      toMe: 0,
      iOwe: 0,
    }
    person[column] = row.owedCents
    byContact.set(row.contactId, person)
  }
  if (showToMe) data.owedToMe.contacts.forEach((row) => add(row, 'toMe'))
  if (showIOwe) data.iOwe.contacts.forEach((row) => add(row, 'iOwe'))
  const people = [...byContact.values()]
    .sort((a, b) => Math.max(b.toMe, b.iOwe) - Math.max(a.toMe, a.iOwe))
    .slice(0, OWED_ROWS)
  const settled =
    (!showToMe || data.owedToMe.totalCents === 0) &&
    (!showIOwe || data.iOwe.totalCents === 0)
  return (
    <ElementCard title={title} to={ROUTES.owed}>
      {settled ? (
        <Quiet>
          <CheckIcon aria-hidden className="text-chart-delta-good size-4" />
          Tout est réglé
        </Quiet>
      ) : (
        <>
          <div
            className={cn(
              'grid gap-2 px-2 pb-1',
              showToMe && showIOwe && 'grid-cols-2',
            )}
          >
            {showToMe && (
              <OwedTile
                toMe
                cents={data.owedToMe.totalCents}
                label="On me doit"
              />
            )}
            {showIOwe && (
              <OwedTile
                toMe={false}
                cents={data.iOwe.totalCents}
                label="Je dois"
              />
            )}
          </div>
          <ul>
            {people.map((person) => {
              const tone =
                person.toMe >= person.iOwe ? OWED_TONE.toMe : OWED_TONE.iOwe
              return (
                <ElementRow
                  key={person.contactId}
                  badge={
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                        tone.badge,
                      )}
                    >
                      {person.name.charAt(0).toUpperCase()}
                    </span>
                  }
                  title={person.name}
                  value={
                    <span className="flex gap-2">
                      {person.toMe > 0 && (
                        <span className={OWED_TONE.toMe.text}>
                          +{formatWholeEuros(person.toMe)}
                        </span>
                      )}
                      {person.iOwe > 0 && (
                        <span className={OWED_TONE.iOwe.text}>
                          −{formatWholeEuros(person.iOwe)}
                        </span>
                      )}
                    </span>
                  }
                  link={{
                    to: ROUTES.owedContact,
                    params: { contactId: person.contactId },
                  }}
                />
              )
            })}
          </ul>
        </>
      )}
    </ElementCard>
  )
}

function OwedTile({
  toMe,
  cents,
  label,
}: {
  toMe: boolean
  cents: number
  label: string
}) {
  const Icon = toMe ? ArrowDownLeftIcon : ArrowUpRightIcon
  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2',
        (toMe ? OWED_TONE.toMe : OWED_TONE.iOwe).tile,
      )}
    >
      <Icon aria-label={label} className="size-4" />
      <p className="text-lg font-semibold whitespace-nowrap tabular-nums">
        {formatWholeEuros(cents)}
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Prochains prélèvements
 * ------------------------------------------------------------------------- */

const UPCOMING_ROWS = 5

/** `2026-11-26` + 7 → `2026-12-03`, calendar days. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days))
    .toISOString()
    .slice(0, 10)
}

const dayMonth = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  timeZone: 'UTC',
})

/**
 * « Prélèvements »: the confirmed debits expected in the next 7 or 30 days
 * (subscriptions, fixed costs, prepaid renewals), soonest first.
 */
export function UpcomingElement({
  widget,
  today,
  onEdit,
}: {
  widget: DashboardWidgetDto
  today: string
  onEdit?: () => void
}) {
  const { data } = useQuery(recurringListQuery)
  const days = widget.settings.upcomingDays ?? 7
  const until = addDays(today, days)
  const chosen = widget.accountIds === null ? null : new Set(widget.accountIds)
  const title = `Prélèvements · ${days} j`
  if (chosen?.size === 0) {
    return (
      <ElementCard title={title} to={ROUTES.subscriptions}>
        <NoAccountLeft onEdit={onEdit} />
      </ElementCard>
    )
  }
  if (!data) {
    return (
      <ElementCard title={title} to={ROUTES.subscriptions}>
        <Loading />
      </ElementCard>
    )
  }
  const debits = data
    .filter(
      (item) =>
        item.status === 'confirmed' &&
        item.direction === 'debit' &&
        !item.ended &&
        item.nextExpectedDate !== null &&
        item.nextExpectedDate >= today &&
        item.nextExpectedDate <= until &&
        (chosen === null || chosen.has(item.accountId)),
    )
    .sort((a, b) => a.nextExpectedDate!.localeCompare(b.nextExpectedDate!))
  return (
    <ElementCard title={title} to={ROUTES.subscriptions}>
      {debits.length === 0 ? (
        <Quiet>
          <CheckIcon aria-hidden className="size-4" />
          Rien de prévu
        </Quiet>
      ) : (
        <ul>
          {debits.slice(0, UPCOMING_ROWS).map((item) => {
            const date = item.nextExpectedDate!
            return (
              <ElementRow
                key={item.id}
                badge={
                  <span
                    aria-hidden
                    className="bg-info/15 text-info-foreground dark:text-info flex size-[34px] shrink-0 flex-col items-center justify-center rounded-lg leading-none"
                  >
                    <span className="text-sm font-bold">
                      {Number(date.slice(8, 10))}
                    </span>
                    <span className="text-[0.5rem]">
                      {dayMonth.format(new Date(`${date}T00:00:00Z`))}
                    </span>
                  </span>
                }
                title={item.name}
                value={`−${formatWholeEuros(item.typicalAmountCents)}`}
                link={{ to: ROUTES.subscriptions }}
              />
            )
          })}
        </ul>
      )}
    </ElementCard>
  )
}

/* ---------------------------------------------------------------------------
 * Le mois
 * ------------------------------------------------------------------------- */

/**
 * « Le mois » (#495, the owner's « B. Grand chiffre », without the
 * comparison with the month before: it cluttered more than it helped): what
 * was saved this month (transfers excluded) in large, green or red, under a
 * piggy bank; income and expenses in two tinted tiles under it. Nothing
 * while the month is empty.
 */
export function MonthFlowsElement({
  overview,
}: {
  overview: DashboardOverviewDto
}) {
  const { current, period } = overview
  const saved = current.netCents
  const tone =
    saved > 0
      ? 'text-chart-delta-good'
      : saved < 0
        ? 'text-chart-delta-bad'
        : 'text-foreground'
  return (
    <ElementCard title="Le mois" to={ROUTES.spending}>
      {period.status === 'empty' ? (
        <Quiet>Pas encore d’opérations</Quiet>
      ) : (
        <dl className="@container px-2 pb-1">
          <div className="flex flex-col items-center pb-3 text-center">
            <span
              aria-hidden
              className={cn(
                'grid size-[48px] place-items-center rounded-2xl [&_svg]:size-6',
                saved > 0
                  ? 'bg-chart-income/15'
                  : saved < 0
                    ? 'bg-chart-expense/15'
                    : 'bg-muted',
                tone,
              )}
            >
              <PiggyBankIcon />
            </span>
            <dt className="sr-only">Épargne</dt>
            <dd
              className={cn(
                'mt-1.5 text-[clamp(1.6rem,12cqi,2.2rem)] leading-tight font-bold whitespace-nowrap tabular-nums',
                tone,
              )}
            >
              {formatSignedWholeEuros(saved)}
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FlowTile
              label="Revenus"
              cents={current.incomeCents}
              icon={<ArrowDownLeftIcon />}
              className="bg-chart-income/10 [&_svg]:text-chart-delta-good"
            />
            <FlowTile
              label="Dépenses"
              // Negative cents: shown as an amount spent.
              cents={Math.abs(current.expenseCents)}
              icon={<ArrowUpRightIcon />}
              className="bg-chart-expense/10 [&_svg]:text-chart-delta-bad"
            />
          </div>
        </dl>
      )}
    </ElementCard>
  )
}

/** Income or expenses of « Le mois »: an arrow and the amount, tinted. */
function FlowTile({
  label,
  cents,
  icon,
  className,
}: {
  label: string
  cents: number
  icon: ReactNode
  className: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 [&_svg]:size-5 [&_svg]:shrink-0',
        className,
      )}
    >
      <span aria-hidden>{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd className="font-bold whitespace-nowrap tabular-nums">
        {formatWholeEuros(cents)}
      </dd>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Enveloppes
 * ------------------------------------------------------------------------- */

const ENVELOPE_JARS = 6

/**
 * « Enveloppes » (#429; #495, the owner's « C. Bocaux »): one jar each,
 * three a row, filled to the share of its target in its colour, its icon at
 * the top and that share at the bottom (no fill and no share without a
 * target); under it its name, readable on two lines, then what it holds.
 * Money set aside, never a balance.
 */
export function EnvelopesElement({ widget }: { widget: DashboardWidgetDto }) {
  const { data } = useQuery(envelopesQuery())
  if (!data) {
    return (
      <ElementCard title="Enveloppes" to={ROUTES.savings}>
        <Loading />
      </ElementCard>
    )
  }
  const chosen =
    widget.envelopeIds === null ? null : new Set(widget.envelopeIds)
  const envelopes = data.filter(
    (envelope) =>
      !envelope.archived && (chosen === null || chosen.has(envelope.id)),
  )
  return (
    <ElementCard title="Enveloppes" to={ROUTES.savings}>
      {envelopes.length === 0 ? (
        <Quiet>Aucune enveloppe</Quiet>
      ) : (
        <ul className="grid grid-cols-3 gap-x-3 gap-y-4 px-2 pt-1 pb-2">
          {envelopes.slice(0, ENVELOPE_JARS).map((envelope) => (
            <EnvelopeJar key={envelope.id} envelope={envelope} />
          ))}
        </ul>
      )}
    </ElementCard>
  )
}

function EnvelopeJar({ envelope }: { envelope: EnvelopeSummaryDto }) {
  const color = envelopeColor(envelope)
  const Icon = categoryIconComponent(envelope.icon ?? 'piggy-bank')
  const ratio = envelope.plan.progressRatio
  const share = ratio === null ? null : Math.round(Math.min(ratio, 1) * 100)
  return (
    <li className="flex min-w-0 flex-col items-center gap-1 text-center">
      <span
        role={share === null ? undefined : 'meter'}
        aria-label={share === null ? undefined : envelope.name}
        aria-valuemin={share === null ? undefined : 0}
        aria-valuemax={share === null ? undefined : 100}
        aria-valuenow={share ?? undefined}
        aria-valuetext={share === null ? undefined : `${share} %`}
        className="relative block h-[84px] w-full overflow-hidden rounded-2xl"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        }}
      >
        {share !== null && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0"
            style={{
              // A sliver even near 0 %, so the jar reads as one.
              height: `${Math.max(share, 6)}%`,
              backgroundColor: `color-mix(in srgb, ${color} 55%, transparent)`,
            }}
          />
        )}
        <Icon
          aria-hidden
          className="absolute top-2 left-1/2 size-5 -translate-x-1/2"
          style={{ color }}
        />
        {share !== null && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-1.5 text-xs font-bold tabular-nums"
          >
            {envelope.plan.reached ? (
              <CheckIcon className="mx-auto size-4" />
            ) : (
              `${share} %`
            )}
          </span>
        )}
      </span>
      <span className="line-clamp-2 min-h-[2.5em] text-xs leading-tight font-semibold break-normal">
        {envelope.name}
      </span>
      <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
        {formatWholeEuros(envelope.totalCents)}
      </span>
    </li>
  )
}

/* ---------------------------------------------------------------------------
 * Placements
 * ------------------------------------------------------------------------- */

/**
 * « Placements »: the value of the investment accounts, their gain over what
 * was invested (the investment summary's rules), one row each.
 */
export function InvestmentsElement({
  widget,
  onEdit,
}: {
  widget: DashboardWidgetDto
  onEdit?: () => void
}) {
  const { data } = useQuery(investmentsSummaryQuery)
  if (!data) {
    return (
      <ElementCard title="Placements" to={ROUTES.savings}>
        <Loading />
      </ElementCard>
    )
  }
  const accounts = pickAccounts(data.accounts, widget.accountIds)
  if (accounts.length === 0) {
    return (
      <ElementCard title="Placements" to={ROUTES.savings}>
        {widget.accountIds === null ? (
          <Quiet>Aucun placement</Quiet>
        ) : (
          <NoAccountLeft onEdit={onEdit} />
        )}
      </ElementCard>
    )
  }
  const total = accounts.reduce(
    (sum, account) => sum + (account.valueCents ?? 0),
    0,
  )
  const gains = accounts.filter((account) => account.gainCents !== null)
  const gain =
    gains.length > 0
      ? gains.reduce((sum, account) => sum + account.gainCents!, 0)
      : null
  return (
    <ElementCard title="Placements" to={ROUTES.savings}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 px-2 pb-1">
        <span className="text-[1.45rem] font-semibold tracking-tight whitespace-nowrap tabular-nums">
          {formatWholeEuros(total)}
        </span>
        {gain !== null && (
          <span
            className={cn(
              'text-sm font-medium whitespace-nowrap tabular-nums',
              gain >= 0 ? 'text-chart-delta-good' : 'text-chart-delta-bad',
            )}
          >
            {formatSignedWholeEuros(gain)}
          </span>
        )}
      </p>
      <ul>
        {accounts.map((account) => (
          <ElementRow
            key={account.id}
            badge={<AccountTypeBadge type={account.type} />}
            title={account.name}
            detail={
              account.stale ? (
                <span className="text-warning-foreground dark:text-warning font-medium">
                  Valeur ancienne
                </span>
              ) : undefined
            }
            value={
              account.valueCents === null
                ? '—'
                : formatWholeEuros(account.valueCents)
            }
            link={{ to: ROUTES.account, params: { accountId: account.id } }}
          />
        ))}
      </ul>
    </ElementCard>
  )
}
