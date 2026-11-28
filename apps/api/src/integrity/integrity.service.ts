import { Injectable, Logger } from '@nestjs/common'
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
  AccountsService,
  isBankAccount,
  isTransactionalAccount,
} from '#/accounts/accounts.service'
import { dataUntilByAccount } from '#/coverage/coverage'
import { currentMonth, monthEnd, shiftMonth } from '#/dashboard/calendar'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  balanceSnapshotsTable,
  bankAmountCents,
  bankBookingDate,
  cryptoHoldingsTable,
  cryptoMovementsTable,
  transactionLinesView,
  transactionsTable,
} from '#/database/schema'
import { parseQuantity, formatQuantity } from '#/imports/crypto/quantity'
import { MANUAL_MATCH_TOLERANCE_DAYS } from '#/imports/reconcile/manual-match'
import { OwedService } from '#/owed/owed.service'
import { addDays, todayInParis } from '#/recurring/dates'
import { TransactionsService } from '#/transactions/transactions.service'
import { balanceChainGaps, type ChainRow } from './balance-chain'
import type {
  IntegrityCheck,
  IntegrityCheckDto,
  IntegrityDto,
  IntegrityFindingDto,
} from './dto/integrity.dto'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

/** Days apart a move between own accounts is looked for (as #296). */
export const INTERNAL_MOVE_DAYS = 3

type Finding = Omit<IntegrityFindingDto, 'check'>

const EMPTY: Omit<Finding, 'code'> = {
  accountId: null,
  accountName: null,
  date: null,
  fromDate: null,
  amountCents: null,
  transactionId: null,
  asset: null,
  quantity: null,
  readQuantity: null,
}

/**
 * (income − expenses) − saved, or null when they agree (#427). Expenses are
 * negative cents, as everywhere.
 */
export function flowMismatch(flow: {
  incomeCents: number
  expenseCents: number
  savedCents: number
}): number | null {
  const difference = flow.incomeCents + flow.expenseCents - flow.savedCents
  return difference === 0 ? null : difference
}

const SCOPES: Record<IntegrityCheck, IntegrityCheckDto['scope']> = {
  balances: 'month',
  crypto: 'current',
  owed: 'current',
  totals: 'month',
}

/**
 * Consistency checks computed from the stored data (#427), shown as a step of
 * « Bilan du mois » and by the MCP's `integrity_checks`. They only read: a
 * finding is fixed by hand where it belongs, never automatically. A check
 * that fails is reported `failed` and the others still answer, so the
 * checks never stand in the way of the app. Logs carry counts only.
 *
 * Envelopes vs balances (M13) is added here once envelopes exist.
 */
@Injectable()
export class IntegrityService {
  private readonly logger = new Logger(IntegrityService.name)

  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
    private readonly transactions: TransactionsService,
    private readonly owed: OwedService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  async check(
    month?: string,
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<IntegrityDto> {
    const shown = month ?? currentMonth(now)
    const runs: Record<IntegrityCheck, () => Promise<Finding[]>> = {
      balances: () => this.balances(shown, now, executor),
      crypto: () => this.crypto(executor),
      owed: () => this.owedFigures(executor),
      totals: () => this.totals(shown, executor),
    }
    const keys = Object.keys(runs) as IntegrityCheck[]
    // One after the other, each in a savepoint: a check that fails leaves
    // the request's transaction usable for the others (#557).
    const results: { key: IntegrityCheck; findings: Finding[] | null }[] = []
    for (const key of keys) {
      try {
        const findings = await (executor as Db).transaction(() => runs[key]())
        results.push({ key, findings })
      } catch (error) {
        this.logger.warn(
          `Integrity check ${key} failed: ${error instanceof Error ? error.name : 'unknown error'}`,
        )
        results.push({ key, findings: null })
      }
    }

    const checks: IntegrityCheckDto[] = results.map(({ key, findings }) => ({
      key,
      scope: SCOPES[key],
      status:
        findings === null ? 'failed' : findings.length > 0 ? 'findings' : 'ok',
      count: findings?.length ?? 0,
    }))
    const findings: IntegrityFindingDto[] = results.flatMap(
      ({ key, findings: list }) =>
        (list ?? [])
          .map((finding) => ({ check: key, ...finding }))
          .sort(
            (a, b) =>
              (a.date ?? '').localeCompare(b.date ?? '') ||
              (a.accountName ?? '').localeCompare(b.accountName ?? '', 'fr'),
          ),
    )
    this.logger.log(
      `Integrity ${shown}: ${findings.length} finding(s) (${checks
        .map((c) => `${c.key} ${c.status === 'failed' ? 'failed' : c.count}`)
        .join(', ')})`,
    )
    return { month: shown, checks, findings }
  }

  // --- Cash balances ---------------------------------------------------------

  /**
   * Bank accounts: the balance recomputed from the transactions against the
   * bank's running balance and the statement balances of the month (the
   * month before gives the opening balance), and the transactions entered by
   * hand that no import ever matched although the bank data goes well past
   * them (they count in the totals, never in the balance).
   */
  private async balances(
    month: string,
    now: Date,
    executor: Executor,
  ): Promise<Finding[]> {
    const banks = (await this.accounts.list({}, executor)).filter(isBankAccount)
    if (banks.length === 0) return []
    const ids = banks.map((account) => account.id)
    const names = new Map(banks.map((account) => [account.id, account.name]))
    const from = `${shiftMonth(month, -1)}-01`
    const start = `${month}-01`
    const end = monthEnd(month)
    const t = transactionsTable
    const s = balanceSnapshotsTable
    const [rows, statements, manual, dataUntil] = await Promise.all([
      executor
        .select({
          accountId: sql<string>`${t.accountId}`.as('account_id'),
          bookingDate: bankBookingDate,
          amountCents: bankAmountCents,
          balanceAfterCents: t.balanceAfterCents,
        })
        .from(t)
        .where(
          and(
            inArray(t.accountId, ids),
            eq(t.manual, false),
            gte(bankBookingDate, from),
            lte(bankBookingDate, end),
          ),
        )
        .orderBy(asc(bankBookingDate), asc(t.id)),
      executor
        .select({
          accountId: s.accountId,
          date: s.date,
          valueCents: s.valueCents,
        })
        .from(s)
        .where(
          and(inArray(s.accountId, ids), gte(s.date, from), lte(s.date, end)),
        ),
      executor
        .select({
          id: t.id,
          accountId: sql<string>`${t.accountId}`.as('account_id'),
          bookingDate: t.bookingDate,
          amountCents: t.amountCents,
        })
        .from(t)
        .where(
          and(
            inArray(t.accountId, ids),
            eq(t.manual, true),
            gte(t.bookingDate, start),
            lte(t.bookingDate, end),
          ),
        ),
      dataUntilByAccount(executor, now),
    ])

    const rowsBy = new Map<string, ChainRow[]>()
    for (const row of rows) {
      const list = rowsBy.get(row.accountId) ?? []
      list.push(row)
      rowsBy.set(row.accountId, list)
    }
    const findings: Finding[] = []
    for (const account of banks) {
      const gaps = balanceChainGaps(
        rowsBy.get(account.id) ?? [],
        statements.filter((st) => st.accountId === account.id),
        start,
      )
      for (const gap of gaps) {
        findings.push({
          ...EMPTY,
          code: gap.source === 'running' ? 'balance_gap' : 'statement_gap',
          accountId: account.id,
          accountName: account.name,
          date: gap.date,
          fromDate: gap.fromDate,
          amountCents: gap.differenceCents,
        })
      }
    }
    // Reconciliation matches a bank row up to 5 days away: an entry older
    // than that before the bank data's end will not be matched any more.
    for (const row of manual) {
      const until = dataUntil.get(row.accountId)
      if (
        until === undefined ||
        row.bookingDate > addDays(until, -MANUAL_MATCH_TOLERANCE_DAYS)
      ) {
        continue
      }
      findings.push({
        ...EMPTY,
        code: 'manual_not_reconciled',
        accountId: row.accountId,
        accountName: names.get(row.accountId) ?? null,
        date: row.bookingDate,
        amountCents: row.amountCents,
        transactionId: row.id,
      })
    }
    return findings
  }

  // --- Crypto ----------------------------------------------------------------

  /**
   * Wallets and manual crypto accounts: the quantity held of each asset
   * against what the last complete chain read (or line edit) recorded, i.e.
   * the sum of the account's observed movements (#373). A wallet holds its
   * `sync` lines; a manual account its typed lines.
   */
  private async crypto(executor: Executor): Promise<Finding[]> {
    const a = accountsTable
    const h = cryptoHoldingsTable
    const m = cryptoMovementsTable
    const observed = await executor
      .select({
        id: a.id,
        name: a.name,
        source: a.cryptoSource,
        observedAt: a.cryptoObservedAt,
      })
      .from(a)
      .where(isNotNull(a.cryptoObservedAt))
    if (observed.length === 0) return []
    const ids = observed.map((account) => account.id)
    const [held, read] = await Promise.all([
      executor
        .select({
          accountId: h.accountId,
          origin: h.origin,
          assetId: h.assetId,
          symbol: sql<string>`min(${h.symbol})`,
          quantity: sql<string>`sum(${h.quantity})::text`,
        })
        .from(h)
        .where(inArray(h.accountId, ids))
        .groupBy(h.accountId, h.origin, h.assetId),
      executor
        .select({
          accountId: m.accountId,
          assetId: sql<string>`${m.assetId}`,
          symbol: sql<string>`min(${m.asset})`,
          quantity: sql<string>`sum(${m.quantity})::text`,
        })
        .from(m)
        .where(
          and(
            inArray(m.accountId, ids),
            inArray(m.kind, ['observed_in', 'observed_out']),
          ),
        )
        .groupBy(m.accountId, m.assetId),
    ])

    const findings: Finding[] = []
    for (const account of observed) {
      const origin = account.source === 'wallet' ? 'sync' : 'manual'
      const assets = new Map<
        string,
        { symbol: string; held: bigint; read: bigint }
      >()
      const entry = (assetId: string, symbol: string) => {
        const known = assets.get(assetId) ?? { symbol, held: 0n, read: 0n }
        assets.set(assetId, known)
        return known
      }
      for (const row of held) {
        if (row.accountId !== account.id || row.origin !== origin) continue
        entry(row.assetId, row.symbol).held += parseQuantity(row.quantity) ?? 0n
      }
      for (const row of read) {
        if (row.accountId !== account.id) continue
        entry(row.assetId, row.symbol).read += parseQuantity(row.quantity) ?? 0n
      }
      for (const asset of assets.values()) {
        if (asset.held === asset.read) continue
        findings.push({
          ...EMPTY,
          code: 'holding_differs_from_read',
          accountId: account.id,
          accountName: account.name,
          date: todayInParis(account.observedAt!),
          asset: asset.symbol,
          quantity: formatQuantity(asset.held),
          readQuantity: formatQuantity(asset.read),
        })
      }
    }
    return findings
  }

  // --- Money owed ------------------------------------------------------------

  /**
   * Read through `OwedService` (its figures follow how let-go amounts are
   * stored): what is left on each shared expense is never below zero, and
   * the repayments linked to a transfer never add up to more than it.
   */
  private async owedFigures(executor: Executor): Promise<Finding[]> {
    const [figures, overTransfer, names] = await Promise.all([
      this.owed.settlementFigures(executor),
      this.owed.repaymentsOverTransfer(executor),
      this.accountNames(executor),
    ])
    const account = (id: string | null) => ({
      accountId: id,
      accountName: id === null ? null : (names.get(id) ?? null),
    })
    return [
      ...figures
        .filter((item) => item.leftCents < 0)
        .map(
          (item): Finding => ({
            ...EMPTY,
            code: 'owed_negative',
            ...account(item.accountId),
            date: item.bookingDate,
            amountCents: item.leftCents,
            transactionId: item.transactionId,
          }),
        ),
      ...overTransfer.map(
        (line): Finding => ({
          ...EMPTY,
          code: 'repayment_over_transfer',
          ...account(line.accountId),
          date: line.bookingDate,
          amountCents: line.linkedCents - line.lineCents,
          transactionId: line.transactionId,
        }),
      ),
    ]
  }

  // --- The month's totals ----------------------------------------------------

  /**
   * The month's income − expenses against what is shown as saved (the
   * transactions summary the dashboard and the month review read), from the
   * lines summed per category; and the moves between own accounts counted as
   * income or expense: an income or expense of a transactional account
   * mirrored by a transfer, or by the opposite kind, of another of them
   * (opposite amount, at most 3 days apart, not linked elsewhere).
   */
  private async totals(month: string, executor: Executor): Promise<Finding[]> {
    const start = `${month}-01`
    const end = monthEnd(month)
    const l = transactionLinesView
    const perCategory = executor
      .select({
        kind: l.kind,
        totalCents: sql<string>`sum(${l.amountCents})`.as('total_cents'),
      })
      .from(l)
      .where(
        and(
          inArray(l.kind, ['income', 'expense']),
          gte(l.bookingDate, start),
          lte(l.bookingDate, end),
        ),
      )
      .groupBy(l.kind, l.categoryId)
      .as('per_category')
    const [[sums], summary, accounts] = await Promise.all([
      executor
        .select({
          incomeCents:
            sql<number>`coalesce(sum(${perCategory.totalCents}) filter (where ${perCategory.kind} = 'income'), 0)::bigint`.mapWith(
              Number,
            ),
          expenseCents:
            sql<number>`coalesce(sum(${perCategory.totalCents}) filter (where ${perCategory.kind} = 'expense'), 0)::bigint`.mapWith(
              Number,
            ),
        })
        .from(perCategory),
      this.transactions.summary({ from: start, to: end }, executor),
      this.accounts.list({ includeArchived: true }, executor),
    ])

    const findings: Finding[] = []
    const mismatch = flowMismatch({ ...sums, savedCents: summary.netCents })
    if (mismatch !== null) {
      findings.push({
        ...EMPTY,
        code: 'flow_mismatch',
        date: end,
        amountCents: mismatch,
      })
    }

    const own = accounts.filter(isTransactionalAccount)
    if (own.length < 2) return findings
    const names = new Map(own.map((account) => [account.id, account.name]))
    const t = transactionsTable
    const o = alias(transactionsTable, 'mirror')
    const ids = own.map((account) => account.id)
    const counted = await executor
      .selectDistinctOn([t.id], {
        id: t.id,
        accountId: sql<string>`${t.accountId}`,
        bookingDate: t.bookingDate,
        amountCents: t.amountCents,
      })
      .from(t)
      .innerJoin(
        o,
        and(
          inArray(o.accountId, ids),
          sql`${o.accountId} <> ${t.accountId}`,
          eq(o.amountCents, sql`-${t.amountCents}`),
          sql`abs(${o.bookingDate} - ${t.bookingDate}) <= ${INTERNAL_MOVE_DAYS}`,
          or(
            and(
              eq(o.kind, 'transfer'),
              or(
                isNull(o.counterpartAccountId),
                eq(o.counterpartAccountId, t.accountId),
              ),
            ),
            and(inArray(o.kind, ['income', 'expense']), ne(o.kind, t.kind)),
          ),
        ),
      )
      .where(
        and(
          inArray(t.accountId, ids),
          inArray(t.kind, ['income', 'expense']),
          gte(t.bookingDate, start),
          lte(t.bookingDate, end),
        ),
      )
      .orderBy(t.id)
    for (const row of counted) {
      findings.push({
        ...EMPTY,
        code: 'internal_move_counted',
        accountId: row.accountId,
        accountName: names.get(row.accountId) ?? null,
        date: row.bookingDate,
        amountCents: row.amountCents,
        transactionId: row.id,
      })
    }
    return findings
  }

  private async accountNames(executor: Executor): Promise<Map<string, string>> {
    const rows = await executor
      .select({ id: accountsTable.id, name: accountsTable.name })
      .from(accountsTable)
    return new Map(rows.map((row) => [row.id, row.name]))
  }
}
