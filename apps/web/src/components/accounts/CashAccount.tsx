import {
  AreaChart,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@finances/ui'
import type { ChartConfig } from '@finances/ui'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  ChevronRightIcon,
  FileUpIcon,
  PlusIcon,
  RepeatIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useState } from 'react'
import type {
  AccountDto,
  AccountMonthFlowsDto,
  BalanceHistoryDto,
  ImportSummaryDto,
  RecurringItemDto,
} from '#/api/types.gen'
import {
  DashboardCardHeader,
  SeeLink,
} from '#/components/dashboard/DashboardCardHeader'
import { FigureTile } from '#/components/dashboard/FigureTile'
import { importsQuery } from '#/components/import/api'
import { formatAmountPerPeriod } from '#/components/subscriptions/format'
import { recurringListQuery } from '#/components/subscriptions/queries'
import { transactionListQuery } from '#/components/transactions/queries'
import { RuleFromCorrectionDialog } from '#/components/transactions/RuleFromCorrectionDialog'
import { RuleOfferBanner } from '#/components/transactions/RuleOfferBanner'
import { TransactionRow } from '#/components/transactions/TransactionRow'
import { useTransactionActions } from '#/components/transactions/use-transaction-actions'
import { formatMonth } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { plural } from '#/lib/plural'
import { categoriesQuery } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { AccountDetails } from './AccountDetails'
import type { AccountDetail } from './AccountDetails'
import { daysBetween, todayInParis } from './dates'
import { formatAge } from './labels'
import { balanceHistoryQuery, monthFlowsQuery } from './queries'

/** Latest transactions listed on the page. */
export const LATEST_TRANSACTIONS = 8
/** Latest imports listed on the page. */
const LATEST_IMPORTS = 3

/** Last day of the month before `today`'s (`2026-11-19` → `2026-10-31`). */
export function previousMonthEnd(today: string): string {
  const [year, month] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10)
}

/**
 * Whether the bank data stops before the end of the previous month, as the
 * dashboard review flags an account to update (#262).
 */
export function isOutOfDate(dataUntil: string | null, today: string): boolean {
  return dataUntil === null || dataUntil < previousMonthEnd(today)
}

interface CashAccountProps {
  account: AccountDto
  writable: boolean
  today: string
  onImport: () => void
  onAddTransaction: () => void
  /** More rows of « Plus d’informations » (its statement balances). */
  details?: (AccountDetail | null)[]
}

/**
 * A checking or savings account (#293): where it stands and whether it is
 * up to date (balance, freshness, the month's flows), its balance over 12
 * months, its latest transactions; then « Plus d’informations » (#447):
 * its imports and running-balance gaps, the recurring debits paid from it
 * and its statement balances (#420), each on a screen of its own.
 * One column at every width (the owner's choice: full-width strips read
 * top to bottom, as on the dashboard).
 */
export function CashAccount({
  account,
  writable,
  today,
  onImport,
  onAddTransaction,
  details,
}: CashAccountProps) {
  const history = useQuery(balanceHistoryQuery(account.id))
  const flows = useQuery(monthFlowsQuery(account.id))
  const importsDetail = useImportsDetail({
    accountId: account.id,
    writable,
    history: history.data,
    today,
    onImport,
  })
  const recurringDetail = useRecurringDebitsDetail(account.id)

  return (
    <>
      <BalanceCard
        account={account}
        writable={writable}
        today={today}
        history={history.data}
        flows={flows.data}
        loading={history.isPending || flows.isPending}
        onImport={onImport}
        onAddTransaction={onAddTransaction}
      />
      {history.data && <BalanceChart history={history.data} today={today} />}
      <LatestTransactions
        account={account}
        writable={writable}
        onImport={onImport}
      />
      <AccountDetails
        items={[importsDetail, recurringDetail, ...(details ?? [])]}
      />
    </>
  )
}

/* ------------------------------------------------------------------------ */

function BalanceCard({
  account,
  writable,
  today,
  history,
  flows,
  loading,
  onImport,
  onAddTransaction,
}: {
  account: AccountDto
  writable: boolean
  today: string
  history: BalanceHistoryDto | undefined
  flows: AccountMonthFlowsDto | undefined
  loading: boolean
  onImport: () => void
  onAddTransaction: () => void
}) {
  const year = today.slice(0, 4)
  const empty = account.balanceDate === null && history?.to === null

  return (
    <Card
      role="region"
      className="min-w-0"
      aria-labelledby="account-balance-title"
    >
      <CardHeader>
        <CardTitle id="account-balance-title">Solde</CardTitle>
      </CardHeader>
      <CardContent className="@container space-y-4">
        {empty ? (
          <EmptyState
            variant="inline"
            icon={<ArrowLeftRightIcon />}
            title="Aucune opération pour ce compte"
            description="Importez le relevé CSV de votre banque, ou ajoutez une opération à la main : le solde et son évolution s’afficheront ici."
            actions={
              writable && (
                <>
                  <Button iconStart={<FileUpIcon />} onClick={onImport}>
                    Importer un relevé
                  </Button>
                  <Button
                    outline
                    variant="secondary"
                    iconStart={<PlusIcon />}
                    onClick={onAddTransaction}
                  >
                    Ajouter une opération
                  </Button>
                </>
              )
            }
          />
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-[clamp(1.5rem,12cqi,2.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
                {account.balanceCents === null
                  ? '—'
                  : formatCents(account.balanceCents)}
              </p>
              {loading ? (
                <Skeleton className="h-4 w-48" />
              ) : (
                <Freshness
                  account={account}
                  history={history}
                  today={today}
                  writable={writable}
                  onImport={onImport}
                />
              )}
            </div>
            {flows && flows.period.status !== 'empty' && (
              <MonthFlows flows={flows} year={year} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * « À jour au 9 nov. · importé il y a 3 jours », or a warning when the bank
 * data stops before the end of the previous month.
 */
function Freshness({
  account,
  history,
  today,
  writable,
  onImport,
}: {
  account: AccountDto
  history: BalanceHistoryDto | undefined
  today: string
  writable: boolean
  onImport: () => void
}) {
  const year = today.slice(0, 4)
  const dataUntil = history?.dataUntil ?? null
  // The bank data, or the statement period end when later than its last row.
  const upTo =
    [account.balanceDate, dataUntil]
      .filter((day): day is string => day !== null)
      .sort()
      .at(-1) ?? null
  const imported =
    history?.lastImportOn != null
      ? `importé ${formatAge(daysBetween(history.lastImportOn, today))}`
      : null

  if (isOutOfDate(dataUntil, today)) {
    return (
      <div
        role="status"
        className="bg-warning/10 space-y-2 rounded-lg p-3 text-sm"
      >
        <p className="text-warning-foreground dark:text-warning flex items-start gap-2 font-medium">
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {dataUntil === null
              ? 'Aucun relevé importé'
              : `Relevé à importer : les opérations s’arrêtent au ${formatShortDay(dataUntil, year)}`}
          </span>
        </p>
        {imported && (
          <p className="text-muted-foreground text-xs">
            Dernier import {imported.replace(/^importé /, '')}.
          </p>
        )}
        {writable && (
          <Button
            size="sm"
            className="w-full"
            iconStart={<FileUpIcon />}
            onClick={onImport}
          >
            Importer un relevé
          </Button>
        )}
      </div>
    )
  }

  return (
    <p className="text-muted-foreground text-sm">
      {[upTo && `À jour au ${formatShortDay(upTo, year)}`, imported]
        .filter(Boolean)
        .join(' · ')}
    </p>
  )
}

/** Money in and out of the month, transfers included, then the change. */
function MonthFlows({
  flows,
  year,
}: {
  flows: AccountMonthFlowsDto
  year: string
}) {
  const { period } = flows
  const month = formatMonth(period.month)
  const heading =
    period.status === 'partial' && period.dataUntil
      ? `${month} · jusqu’au ${formatShortDay(period.dataUntil, year)}`
      : month
  return (
    <section aria-label={`Mouvements de ${month.toLowerCase()}`}>
      <h3 className="text-muted-foreground mb-2 text-xs font-medium">
        {heading}
      </h3>
      {flows.count === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucune opération ce mois-ci.
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-2 @[36rem]:grid-cols-3">
          <FigureTile
            variant="dl"
            label="Entrées"
            value={signed(flows.inCents)}
            notes={[
              flows.transfersInCents !== 0 &&
                `dont ${formatCents(flows.transfersInCents)} de virements`,
            ]}
          />
          <FigureTile
            variant="dl"
            label="Sorties"
            value={formatCents(flows.outCents)}
            notes={[
              flows.transfersOutCents !== 0 &&
                `dont ${formatCents(-flows.transfersOutCents)} de virements`,
            ]}
          />
          <FigureTile
            variant="dl"
            label="Variation"
            value={signed(flows.netCents)}
            tone={
              flows.netCents > 0
                ? 'good'
                : flows.netCents < 0
                  ? 'bad'
                  : undefined
            }
          />
        </dl>
      )}
    </section>
  )
}

function signed(cents: number): string {
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents)
}

/* ------------------------------------------------------------------------ */

const balanceConfig = {
  balance: { label: 'Solde', color: 'var(--chart-1)' },
} satisfies ChartConfig

const balanceWithStatementsConfig = {
  balance: { label: 'Solde', color: 'var(--chart-1)' },
  statement: { label: 'Solde de relevé', color: 'var(--chart-4)' },
} satisfies ChartConfig

/**
 * The end-of-day balance over 12 months (bank values), the statement
 * balances as dots. Hidden until there are two days to draw.
 */
function BalanceChart({
  history,
  today,
}: {
  history: BalanceHistoryDto
  today: string
}) {
  if (history.points.length < 2 || history.from === null) return null
  const statements = new Map(
    history.statements.map((s) => [s.date, s.valueCents]),
  )
  const withStatements = statements.size > 0
  const data = history.points.map((point) => ({
    date: point.date,
    balance: point.balanceCents,
    ...(withStatements && { statement: statements.get(point.date) ?? null }),
  }))
  const since = formatShortDay(history.from, today.slice(0, 4))
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Évolution du solde</CardTitle>
        <CardDescription>
          Chaque jour depuis le {since}
          {withStatements && ' · points : soldes de relevés'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AreaChart
          data={data}
          index="date"
          config={withStatements ? balanceWithStatementsConfig : balanceConfig}
          dotSeries={['statement']}
          indexScale="time"
          tooltipIndexFormatter={(date) => formatShortDay(date)}
          indexLabel="Date"
          label={`Solde du compte chaque jour depuis le ${since}`}
          dataTable="none"
          height={220}
        />
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------------ */

/** The latest transactions, as on Opérations, edited in place. */
function LatestTransactions({
  account,
  writable,
  onImport,
}: {
  account: AccountDto
  writable: boolean
  onImport: () => void
}) {
  const categories = useQuery(categoriesQuery)
  const list = useInfiniteQuery(
    transactionListQuery({ accountId: account.id }, 'date_desc'),
  )
  const categoryList = categories.data ?? []
  const actions = useTransactionActions(categoryList)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const items = (list.data?.pages[0]?.items ?? []).slice(0, LATEST_TRANSACTIONS)
  const total = list.data?.pages[0]?.total ?? 0

  return (
    <Card
      role="region"
      className="min-w-0"
      aria-labelledby="account-latest-title"
    >
      <DashboardCardHeader
        id="account-latest-title"
        title="Dernières opérations"
        link={
          total > 0
            ? {
                label: 'Tout voir',
                to: ROUTES.transactions,
                search: { account: account.id },
              }
            : undefined
        }
      />
      <CardContent className="@container">
        {list.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : list.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-destructive">
              Impossible de charger les opérations.
            </p>
            <Button
              size="sm"
              outline
              variant="secondary"
              onClick={() => void list.refetch()}
            >
              Réessayer
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={<ArrowLeftRightIcon />}
            title="Aucune opération"
            description="Les opérations importées ou ajoutées à la main sur ce compte apparaîtront ici."
            actions={
              writable && (
                <Button
                  outline
                  variant="secondary"
                  iconStart={<FileUpIcon />}
                  onClick={onImport}
                >
                  Importer un relevé
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-3">
            {actions.offer && (
              <RuleOfferBanner
                offer={actions.offer}
                onCreateRule={() => setRuleDialogOpen(true)}
                onDismiss={() => actions.setOffer(null)}
              />
            )}
            <ul className="-mx-3 divide-y" aria-label="Dernières opérations">
              {items.map((item) => (
                <TransactionRow
                  key={item.id}
                  item={item}
                  categories={categoryList}
                  showDate
                  showAccount={false}
                  onChange={(changes) => void actions.update(item, changes)}
                  onUpdateManual={(changes) =>
                    actions.updateManual(item, changes)
                  }
                  onSave={(edit) => actions.saveEdit(item, edit)}
                />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      {actions.offer && (
        <RuleFromCorrectionDialog
          open={ruleDialogOpen}
          onOpenChange={setRuleDialogOpen}
          transaction={actions.offer.transaction}
          category={actions.offer.category}
          onCreated={({ updated }) => actions.onRuleCreated(updated)}
        />
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------------ */

/** "1er oct. – 31 oct." from a statement's period. */
function importPeriod(item: ImportSummaryDto, year: string): string | null {
  if (item.periodEnd === null) return null
  const end = formatShortDay(item.periodEnd, year)
  return item.periodStart === null
    ? `jusqu’au ${end}`
    : `${formatShortDay(item.periodStart, year)} – ${end}`
}

/**
 * The latest imports of the account (pending ones to validate first) and
 * the running-balance gaps of the last 12 months, a row of « Plus
 * d’informations » (#447) said in amber while an import waits or a gap
 * shows. How far the data goes is in the balance card.
 */
function useImportsDetail({
  accountId,
  writable,
  history,
  today,
  onImport,
}: {
  accountId: string
  writable: boolean
  history: BalanceHistoryDto | undefined
  today: string
  onImport: () => void
}): AccountDetail | null {
  const imports = useQuery(importsQuery)
  const year = today.slice(0, 4)
  const mine = (imports.data ?? []).filter(
    (item) => item.accountId === accountId,
  )
  const pending = mine.filter((item) => item.status === 'pending')
  // Latest statements first (imports made the same day come in any order).
  const committed = mine
    .filter((item) => item.status === 'committed')
    .sort((a, b) => (b.periodEnd ?? '').localeCompare(a.periodEnd ?? ''))
    .slice(0, LATEST_IMPORTS)
  const gaps = history?.gaps ?? []

  if (!writable && !imports.isPending && mine.length === 0) return null
  const summary = imports.isPending
    ? undefined
    : pending.length > 0
      ? plural(pending.length, 'import à valider', 'imports à valider')
      : gaps.length > 0
        ? plural(gaps.length, 'écart de solde', 'écarts de solde')
        : mine.length === 0
          ? 'aucun'
          : history?.to
            ? `à jour au ${formatShortDay(history.to, year)}`
            : plural(committed.length, 'import')
  return {
    id: 'imports',
    icon: FileUpIcon,
    label: 'Imports',
    summary,
    warning: pending.length > 0 || gaps.length > 0,
    content: (
      <div className="space-y-3">
        {imports.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : mine.length === 0 ? (
          <EmptyState
            variant="inline"
            icon={<FileUpIcon />}
            title="Aucun relevé importé"
            description="Importez l’export CSV de votre banque : les doublons sont détectés et le solde vérifié ligne à ligne."
            actions={
              writable && (
                <Button
                  outline
                  variant="secondary"
                  iconStart={<FileUpIcon />}
                  onClick={onImport}
                >
                  Importer un relevé
                </Button>
              )
            }
          />
        ) : (
          <>
            {pending.length > 0 && (
              <Link
                to={ROUTES.import}
                className="bg-warning/10 text-warning-foreground dark:text-warning hover:bg-warning/15 flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              >
                <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
                <span className="flex-1">
                  {plural(
                    pending.length,
                    'import à valider',
                    'imports à valider',
                  )}
                </span>
                <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
              </Link>
            )}
            {committed.length > 0 && (
              <ul className="divide-y text-sm" aria-label="Derniers imports">
                {committed.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
                  >
                    <span className="min-w-[7rem] flex-1">
                      {importPeriod(item, year) ?? item.fileName}
                    </span>
                    <span className="text-muted-foreground ml-auto text-xs whitespace-nowrap">
                      {plural(item.counts.inserted, 'ajoutée', 'ajoutées')}
                      {item.committedAt &&
                        ` · le ${formatShortDay(
                          todayInParis(new Date(item.committedAt)),
                          year,
                        )}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {gaps.length > 0 ? (
          <section
            aria-label="Écarts de solde"
            className="bg-warning/10 space-y-1 rounded-lg p-3 text-sm"
          >
            <p className="text-warning-foreground dark:text-warning flex items-start gap-2 font-medium">
              <TriangleAlertIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0"
              />
              {plural(gaps.length, 'écart de solde', 'écarts de solde')}
            </p>
            <ul className="text-muted-foreground space-y-1 text-xs">
              {gaps.map((gap) => (
                <li key={`${gap.fromDate}:${gap.toDate}`}>
                  Entre le {formatShortDay(gap.fromDate, year)} et le{' '}
                  {formatShortDay(gap.toDate, year)} :{' '}
                  <span className="whitespace-nowrap tabular-nums">
                    {signed(gap.differenceCents)}
                  </span>{' '}
                  d’opérations manquantes
                </li>
              ))}
            </ul>
          </section>
        ) : (
          mine.length > 0 &&
          history?.to != null && (
            <p className="text-muted-foreground text-xs">
              Soldes continus sur 12 mois : aucune opération ne manque.
            </p>
          )
        )}
        {mine.length > 0 && (
          <SeeLink label="Tous les relevés" to={ROUTES.import} />
        )}
      </div>
    ),
  }
}

/* ------------------------------------------------------------------------ */

/**
 * Confirmed recurring debits paid from the account, not cancelled: a row of
 * « Plus d’informations » (#447), absent while there is none.
 */
function useRecurringDebitsDetail(accountId: string): AccountDetail | null {
  const recurring = useQuery(recurringListQuery)
  const items = (recurring.data ?? [])
    .filter(
      (item: RecurringItemDto) =>
        item.accountId === accountId &&
        item.status === 'confirmed' &&
        item.direction === 'debit' &&
        !item.ended,
    )
    .sort(
      (a, b) =>
        (a.nextExpectedDate ?? '9999').localeCompare(
          b.nextExpectedDate ?? '9999',
        ) || a.name.localeCompare(b.name),
    )
  if (items.length === 0) return null
  const monthly = items
    .filter((item) => item.active)
    .reduce((sum, item) => sum + item.monthlyEquivalentCents, 0)

  return {
    id: 'recurring',
    icon: RepeatIcon,
    label: 'Prélèvements',
    summary: `${items.length} · ${formatCents(monthly)} / mois`,
    description: `${formatCents(monthly)} / mois en moyenne.`,
    content: (
      <div className="space-y-3">
        <ul className="divide-y text-sm" aria-label="Prélèvements réguliers">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
            >
              <span className="flex min-w-[7rem] flex-1 items-center gap-2">
                <RepeatIcon
                  aria-hidden
                  className="text-muted-foreground size-3.5 shrink-0"
                />
                <span className="min-w-0 break-words">{item.name}</span>
              </span>
              <span className="ml-auto text-right whitespace-nowrap tabular-nums">
                {formatAmountPerPeriod(item)}
                {item.nextExpectedDate && (
                  <span className="text-muted-foreground block text-xs">
                    {item.active
                      ? `prévu le ${formatShortDay(item.nextExpectedDate)}`
                      : 'inactif'}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <SeeLink label="Abonnements" to={ROUTES.subscriptions} />
      </div>
    ),
  }
}
