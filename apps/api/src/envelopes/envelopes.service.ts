import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { AccountsService } from '#/accounts/accounts.service'
import { currentMonth, monthsUntil } from '#/dashboard/calendar'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  envelopeCategoriesTable,
  envelopeMovementsTable,
  envelopeOfferDismissalsTable,
  envelopeSplitKeysTable,
  envelopesTable,
  transactionLinesView,
  transactionsTable,
  type SelectEnvelope,
} from '#/database/schema'
import { parisToday } from '#/investments/days'
import { monthsLeft } from '#/savings/savings-math'
import { monthBounds } from '#/transactions/transactions.service'
import { TRANSFER_MATCH_TOLERANCE_DAYS } from '#/transactions/transfer-links/match-transfers'
import {
  type AccountEnvelopesDto,
  type ApplySplitDto,
  type AttachTransactionDto,
  BASIS_POINTS_FULL,
  type CreateEnvelopeDto,
  type EnvelopeDetailDto,
  type EnvelopeSummaryDto,
  ENVELOPE_HISTORY_MONTHS,
  ENVELOPE_MOVEMENTS_LIMIT,
  type EnvelopeMonthDto,
  type EnvelopeOfferDto,
  type EnvelopeOffersDto,
  type EnvelopePlanDto,
  type MoveEnvelopeMoneyDto,
  type TopUpEnvelopeDto,
  type SetSplitKeyDto,
  type UpdateEnvelopeDto,
} from './dto/envelope.dto'
import { envelopePaid } from './paid'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

/** Most offers of each kind returned at once, newest first. */
const OFFERS_LIMIT = 100

const m = envelopeMovementsTable
const e = envelopesTable

/** `${envelopeId}|${accountId}` → cents held there. */
type Holdings = Map<string, number>
const key = (envelopeId: string, accountId: string) =>
  `${envelopeId}|${accountId}`

/**
 * Envelopes (#429, ADR 0008): money set aside for a goal, split across
 * accounts. A label on money: nothing here writes a transaction, a balance or
 * a snapshot, so net worth and every statistic are untouched. An envelope's
 * amount on an account is the sum of its ledger rows (`envelope_movements`);
 * « libre » is the account's balance minus its envelopes.
 */
@Injectable()
export class EnvelopesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  /* ==========================================================================
   * READ
   * ======================================================================= */

  /** Active envelopes by due date (none last), then archived ones if asked. */
  async list(
    { includeArchived = false }: { includeArchived?: boolean } = {},
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<EnvelopeSummaryDto[]> {
    const envelopes = await executor
      .select()
      .from(e)
      .where(includeArchived ? undefined : isNull(e.archivedAt))
      .orderBy(
        sql`${e.archivedAt} is not null`,
        sql`${e.dueDate} asc nulls last`,
        asc(e.createdAt),
        asc(e.id),
      )
    return this.toDtos(envelopes, now, executor)
  }

  async detail(
    id: string,
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<EnvelopeDetailDto> {
    const envelope = await this.find(id, executor)
    const [dto] = await this.toDtos([envelope], now, executor)

    const months = monthsUntil(currentMonth(now), ENVELOPE_HISTORY_MONTHS)
    const [byMonth, movements] = await Promise.all([
      executor
        .select({
          month: sql<string>`to_char(${m.onDate}, 'YYYY-MM')`,
          accountId: m.accountId,
          amountCents: sql<number>`sum(${m.amountCents})::bigint`.mapWith(
            Number,
          ),
        })
        .from(m)
        .where(eq(m.envelopeId, id))
        .groupBy(sql`1`, m.accountId),
      executor
        .select({
          id: m.id,
          accountId: m.accountId,
          amountCents: m.amountCents,
          onDate: m.onDate,
          reason: m.reason,
          counterEnvelopeId: m.counterEnvelopeId,
          transactionId: m.transactionId,
          note: m.note,
        })
        .from(m)
        .where(eq(m.envelopeId, id))
        .orderBy(desc(m.onDate), desc(m.createdAt), desc(m.id))
        .limit(ENVELOPE_MOVEMENTS_LIMIT),
    ])

    const history = months.map((month) => {
      const held = new Map<string, number>()
      for (const row of byMonth) {
        if (row.month > month) continue
        held.set(
          row.accountId,
          (held.get(row.accountId) ?? 0) + row.amountCents,
        )
      }
      const accounts = [...held]
        .filter(([, cents]) => cents !== 0)
        .map(([accountId, amountCents]) => ({ accountId, amountCents }))
      return {
        month,
        totalCents: accounts.reduce((sum, a) => sum + a.amountCents, 0),
        accounts,
      }
    })
    return { ...dto, history, movements }
  }

  /** An account's split between its envelopes and « libre », and its key. */
  async forAccount(
    accountId: string,
    executor: Executor = this.db,
  ): Promise<AccountEnvelopesDto> {
    const account = await this.accounts.findOne(accountId, executor)
    const [rows, splitKey] = await Promise.all([
      executor
        .select({
          envelopeId: e.id,
          name: e.name,
          icon: e.icon,
          color: e.color,
          archivedAt: e.archivedAt,
          amountCents: sql<number>`sum(${m.amountCents})::bigint`.mapWith(
            Number,
          ),
        })
        .from(m)
        .innerJoin(e, eq(e.id, m.envelopeId))
        .where(eq(m.accountId, accountId))
        .groupBy(e.id),
      this.splitKey(accountId, executor),
    ])
    const balance = account.balanceCents
    const envelopes = rows
      .filter((row) => row.amountCents !== 0)
      .sort((a, b) => b.amountCents - a.amountCents)
      .map((row) => ({
        envelopeId: row.envelopeId,
        name: row.name,
        icon: row.icon,
        color: row.color,
        archived: row.archivedAt !== null,
        amountCents: row.amountCents,
        shareOfBalance:
          balance !== null && balance > 0
            ? Math.round((row.amountCents * BASIS_POINTS_FULL) / balance)
            : null,
      }))
    const allocatedCents = envelopes.reduce((s, row) => s + row.amountCents, 0)
    const freeCents = balance === null ? null : balance - allocatedCents
    return {
      accountId,
      balanceCents: balance,
      balanceDate: account.balanceDate,
      envelopes,
      allocatedCents,
      freeCents,
      shortfallCents: Math.max(0, allocatedCents - (balance ?? 0)),
      splitKey,
      freeBasisPoints:
        BASIS_POINTS_FULL - splitKey.reduce((s, k) => s + k.basisPoints, 0),
    }
  }

  /** What envelopes paid in `month` (default the current Paris month). */
  async month(
    requested: string | undefined,
    {
      now = new Date(),
      executor = this.db,
    }: { now?: Date; executor?: Executor } = {},
  ): Promise<EnvelopeMonthDto> {
    const month = requested ?? currentMonth(now)
    const { start, next } = monthBounds(month)
    const rows = await envelopePaid(executor, start, next)
    const ids = [...new Set(rows.map((row) => row.envelopeId))]
    const envelopes =
      ids.length === 0
        ? []
        : await this.toDtos(
            await executor.select().from(e).where(inArray(e.id, ids)),
            now,
            executor,
          )
    const items = envelopes
      .map((envelope) => {
        const own = rows.filter((row) => row.envelopeId === envelope.id)
        const categories = new Map<string | null, number>()
        for (const row of own) {
          categories.set(
            row.categoryId,
            (categories.get(row.categoryId) ?? 0) + row.paidCents,
          )
        }
        return {
          envelopeId: envelope.id,
          name: envelope.name,
          icon: envelope.icon,
          color: envelope.color,
          paidCents: own.reduce((s, row) => s + row.paidCents, 0),
          putAsideCents: envelope.putAsideCents,
          leftCents: envelope.totalCents,
          categories: [...categories]
            .map(([categoryId, paidCents]) => ({ categoryId, paidCents }))
            .sort((a, b) => b.paidCents - a.paidCents),
        }
      })
      .sort((a, b) => b.paidCents - a.paidCents)
    return {
      month,
      paidCents: items.reduce((s, item) => s + item.paidCents, 0),
      envelopes: items,
    }
  }

  /**
   * What waits for the owner (ADR 0008 §7): savings to split by a key,
   * transfers out of an account where envelopes hold money towards a
   * checking account (#430), expenses in an
   * envelope's categories. Nothing is attached without him.
   */
  async offers(executor: Executor = this.db): Promise<EnvelopeOffersDto> {
    const [holdings, names, keys] = await Promise.all([
      this.holdings(executor),
      executor
        .select({
          id: e.id,
          name: e.name,
          archivedAt: e.archivedAt,
          createdOn: sql<string>`(${e.createdAt} at time zone 'Europe/Paris')::date::text`,
        })
        .from(e),
      executor.select().from(envelopeSplitKeysTable),
    ])
    const active = new Map(
      names.filter((n) => n.archivedAt === null).map((n) => [n.id, n.name]),
    )
    const createdOn = new Map(names.map((n) => [n.id, n.createdOn]))
    /**
     * Active envelopes holding money on an account, most first; with
     * `since`, only those that existed on that day (ADR 0008 §7).
     */
    const holdersOn = (accountId: string, since?: string) =>
      [...active]
        .filter(([envelopeId]) => !since || createdOn.get(envelopeId)! <= since)
        .map(([envelopeId, name]) => ({
          envelopeId,
          name,
          amountCents: holdings.get(key(envelopeId, accountId)) ?? 0,
        }))
        .filter((h) => h.amountCents > 0)
        .sort((a, b) => b.amountCents - a.amountCents)

    const t = transactionsTable
    const columns = {
      transactionId: t.id,
      accountId: t.accountId,
      bookingDate: t.bookingDate,
      amountCents: t.amountCents,
      label: t.rawLabel,
      categoryId: t.categoryId,
      counterpartAccountId: t.counterpartAccountId,
    }
    const open = sql`not exists (select 1 from ${envelopeOfferDismissalsTable} d where d.transaction_id = ${t.id})`
    const attached = (reasons: string) =>
      sql`exists (select 1 from ${m} x where x.transaction_id = ${t.id} and x.reason in (${sql.raw(reasons)}))`

    const [savings, transfers, expenses] = await Promise.all([
      // Savings that entered the app after the account's key was set,
      // not the arriving side of a transfer that already carries one.
      executor
        .select(columns)
        .from(t)
        .where(
          sql`${t.amountCents} > 0 and ${t.kind} in ('income', 'transfer') and ${open}
              and not ${attached("'split'")}
              and ${t.createdAt} >= (select min(k.created_at) from ${envelopeSplitKeysTable} k where k.account_id = ${t.accountId})
              and not exists (
                select 1 from ${m} x join ${t} o on o.id = x.transaction_id
                where x.reason = 'transfer' and x.account_id = ${t.accountId} and x.amount_cents > 0
                  and o.account_id = ${t.counterpartAccountId} and o.amount_cents = -${t.amountCents}
                  and abs(o.booking_date - ${t.bookingDate}) <= ${TRANSFER_MATCH_TOLERANCE_DAYS}
              )`,
        )
        .orderBy(desc(t.bookingDate), desc(t.id))
        .limit(OFFERS_LIMIT),
      // Transfers out, booked once an envelope existed (per envelope below).
      executor
        .select(columns)
        .from(t)
        .where(
          // Only towards a checking account (« je rapatrie pour payer »,
          // #430): a move to savings or an investment is not an envelope's.
          sql`${t.kind} = 'transfer' and ${t.amountCents} < 0 and ${t.counterpartAccountId} is not null and ${open}
              and exists (select 1 from ${accountsTable} c where c.id = ${t.counterpartAccountId} and c.type = 'checking')
              and not ${attached("'transfer'")}
              and ${t.bookingDate} >= (select min((y.created_at at time zone 'Europe/Paris')::date) from ${e} y where y.archived_at is null)`,
        )
        .orderBy(desc(t.bookingDate), desc(t.id))
        .limit(OFFERS_LIMIT),
      // Expenses in an envelope's categories, booked since it exists.
      executor
        .selectDistinct({
          ...columns,
          envelopeId: envelopeCategoriesTable.envelopeId,
        })
        .from(t)
        .innerJoin(transactionLinesView, eq(transactionLinesView.id, t.id))
        .innerJoin(
          envelopeCategoriesTable,
          eq(
            envelopeCategoriesTable.categoryId,
            transactionLinesView.categoryId,
          ),
        )
        .innerJoin(e, eq(e.id, envelopeCategoriesTable.envelopeId))
        .where(
          sql`${t.kind} = 'expense' and ${t.amountCents} < 0 and ${t.accountId} is not null and ${open}
              and not ${attached("'spend'")}
              and ${t.bookingDate} >= (${e.createdAt} at time zone 'Europe/Paris')::date`,
        )
        .orderBy(desc(t.bookingDate), desc(t.id))
        .limit(OFFERS_LIMIT * 5),
    ])

    const keyOf = new Map<
      string,
      { envelopeId: string; basisPoints: number }[]
    >()
    for (const k of keys) {
      if (!active.has(k.envelopeId)) continue
      const list = keyOf.get(k.accountId) ?? []
      list.push({ envelopeId: k.envelopeId, basisPoints: k.basisPoints })
      keyOf.set(k.accountId, list)
    }
    const toTransaction = (row: (typeof savings)[number]) => ({
      transactionId: row.transactionId,
      accountId: row.accountId!,
      bookingDate: row.bookingDate,
      amountCents: row.amountCents,
      label: row.label,
      categoryId: row.categoryId,
      counterpartAccountId: row.counterpartAccountId,
    })

    const savingOffers: EnvelopeOfferDto[] = savings.flatMap((row) => {
      const shares = splitByKey(
        row.amountCents,
        keyOf.get(row.accountId!) ?? [],
      )
      if (shares.length === 0) return []
      return [
        {
          transaction: toTransaction(row),
          envelopes: shares.map((share) => ({
            envelopeId: share.envelopeId,
            name: active.get(share.envelopeId)!,
            amountCents: share.amountCents,
          })),
        },
      ]
    })
    const transferOffers: EnvelopeOfferDto[] = transfers.flatMap((row) => {
      const holders = holdersOn(row.accountId!, row.bookingDate)
      return holders.length === 0
        ? []
        : [{ transaction: toTransaction(row), envelopes: holders }]
    })
    const byExpense = new Map<string, EnvelopeOfferDto>()
    for (const row of expenses) {
      const holder = holdersOn(row.accountId!, row.bookingDate).find(
        (h) => h.envelopeId === row.envelopeId,
      )
      if (!holder) continue
      const offer = byExpense.get(row.transactionId) ?? {
        transaction: toTransaction(row),
        envelopes: [],
      }
      offer.envelopes.push(holder)
      byExpense.set(row.transactionId, offer)
    }
    return {
      savings: savingOffers,
      transfers: transferOffers,
      expenses: [...byExpense.values()].slice(0, OFFERS_LIMIT),
    }
  }

  /* ==========================================================================
   * WRITE
   * ======================================================================= */

  async create(
    dto: CreateEnvelopeDto,
    { now = new Date() }: { now?: Date } = {},
  ): Promise<EnvelopeSummaryDto> {
    const id = await this.db.transaction(async (tx) => {
      await this.assertCategories(dto.categoryIds ?? [], tx)
      const [envelope] = await tx
        .insert(e)
        .values({
          name: dto.name,
          icon: dto.icon ?? null,
          color: dto.color ?? null,
          targetCents: dto.targetCents ?? null,
          dueDate: dto.dueDate ?? null,
        })
        .returning({ id: e.id })
      await this.setCategories(envelope.id, dto.categoryIds ?? [], tx)
      const start = dto.start ?? []
      const accountIds = start.map((s) => s.accountId)
      if (new Set(accountIds).size !== accountIds.length) {
        throw new BadRequestException('start: one amount per account')
      }
      for (const s of start) {
        await this.lockAccount(s.accountId, tx)
        const free = await this.freeOn(s.accountId, tx)
        if (s.amountCents > free) {
          throw new BadRequestException(
            'start: more than the account has « libre »',
          )
        }
      }
      if (start.length > 0) {
        await tx.insert(m).values(
          start.map((s) => ({
            envelopeId: envelope.id,
            accountId: s.accountId,
            amountCents: s.amountCents,
            onDate: parisToday(now),
            reason: 'start' as const,
          })),
        )
      }
      return envelope.id
    })
    return this.detail(id, { now })
  }

  async update(
    id: string,
    dto: UpdateEnvelopeDto,
    { now = new Date() }: { now?: Date } = {},
  ): Promise<EnvelopeSummaryDto> {
    await this.db.transaction(async (tx) => {
      const existing = await this.find(id, tx)
      const set: Partial<SelectEnvelope> = {}
      if (dto.name !== undefined) set.name = dto.name
      if (dto.icon !== undefined) set.icon = dto.icon
      if (dto.color !== undefined) set.color = dto.color
      if (dto.targetCents !== undefined) set.targetCents = dto.targetCents
      if (dto.dueDate !== undefined) set.dueDate = dto.dueDate
      if (dto.archived !== undefined) {
        set.archivedAt = dto.archived ? (existing.archivedAt ?? now) : null
      }
      if (Object.keys(set).length > 0) {
        await tx.update(e).set(set).where(eq(e.id, id))
      }
      if (dto.categoryIds !== undefined) {
        await this.assertCategories(dto.categoryIds, tx)
        await tx
          .delete(envelopeCategoriesTable)
          .where(eq(envelopeCategoriesTable.envelopeId, id))
        await this.setCategories(id, dto.categoryIds, tx)
      }
    })
    return this.detail(id, { now })
  }

  /** Deletes an envelope and its ledger: its money goes back to « libre ». */
  async remove(id: string): Promise<void> {
    const deleted = await this.db
      .delete(e)
      .where(eq(e.id, id))
      .returning({ id: e.id })
    if (deleted.length === 0) throw new NotFoundException('Envelope not found')
  }

  /**
   * Moves money on one account between envelopes and « libre » (null). The
   * balance does not change; never more than the source holds there.
   */
  async move(
    dto: MoveEnvelopeMoneyDto,
    { now = new Date() }: { now?: Date } = {},
  ): Promise<AccountEnvelopesDto> {
    const from = dto.fromEnvelopeId ?? null
    const to = dto.toEnvelopeId ?? null
    if (from === to) {
      throw new BadRequestException(
        'fromEnvelopeId and toEnvelopeId are the same',
      )
    }
    await this.db.transaction(async (tx) => {
      await this.lockAccount(dto.accountId, tx)
      if (from !== null) await this.find(from, tx)
      if (to !== null) {
        const target = await this.find(to, tx)
        if (target.archivedAt !== null) {
          throw new BadRequestException(
            'Cannot move money into an archived envelope',
          )
        }
      }
      const available =
        from === null
          ? await this.freeOn(dto.accountId, tx)
          : ((await this.holdings(tx, dto.accountId)).get(
              key(from, dto.accountId),
            ) ?? 0)
      if (dto.amountCents > available) {
        throw new BadRequestException(
          from === null
            ? 'More than the account has « libre »'
            : 'More than the envelope holds on this account',
        )
      }
      const base = {
        accountId: dto.accountId,
        onDate: parisToday(now),
        reason: 'move' as const,
        note: dto.note ?? null,
      }
      const rows = []
      if (from !== null) {
        rows.push({
          ...base,
          envelopeId: from,
          amountCents: -dto.amountCents,
          counterEnvelopeId: to,
        })
      }
      if (to !== null) {
        rows.push({
          ...base,
          envelopeId: to,
          amountCents: dto.amountCents,
          counterEnvelopeId: from,
        })
      }
      await tx.insert(m).values(rows)
    })
    return this.forAccount(dto.accountId)
  }

  /**
   * Adds money to an envelope from « libre » on one account (#518): the one
   * move a `write` token may make, so the MCP never takes money out of one.
   */
  topUp(
    id: string,
    dto: TopUpEnvelopeDto,
    options: { now?: Date } = {},
  ): Promise<AccountEnvelopesDto> {
    return this.move(
      {
        accountId: dto.accountId,
        fromEnvelopeId: null,
        toEnvelopeId: id,
        amountCents: dto.amountCents,
        note: dto.note ?? null,
      },
      options,
    )
  }

  /** Replaces an account's split key. */
  async setSplitKey(
    accountId: string,
    dto: SetSplitKeyDto,
  ): Promise<AccountEnvelopesDto> {
    const ids = dto.shares.map((s) => s.envelopeId)
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('shares: one entry per envelope')
    }
    if (dto.shares.reduce((s, k) => s + k.basisPoints, 0) > BASIS_POINTS_FULL) {
      throw new BadRequestException('shares: more than 100 % in all')
    }
    await this.db.transaction(async (tx) => {
      await this.lockAccount(accountId, tx)
      if (ids.length > 0) {
        const found = await tx
          .select({ id: e.id, archivedAt: e.archivedAt })
          .from(e)
          .where(inArray(e.id, ids))
        if (found.length !== ids.length) {
          throw new BadRequestException('Unknown envelope in shares')
        }
        if (found.some((f) => f.archivedAt !== null)) {
          throw new BadRequestException('An archived envelope takes no share')
        }
      }
      const k = envelopeSplitKeysTable
      // Kept rows keep their creation time: it dates the key (offers).
      const kept = await tx
        .select({ envelopeId: k.envelopeId })
        .from(k)
        .where(eq(k.accountId, accountId))
      const keptIds = new Set(kept.map((row) => row.envelopeId))
      const gone = [...keptIds].filter((id) => !ids.includes(id))
      if (gone.length > 0) {
        await tx
          .delete(k)
          .where(and(eq(k.accountId, accountId), inArray(k.envelopeId, gone)))
      }
      for (const share of dto.shares.filter((s) => keptIds.has(s.envelopeId))) {
        await tx
          .update(k)
          .set({ basisPoints: share.basisPoints })
          .where(
            and(eq(k.accountId, accountId), eq(k.envelopeId, share.envelopeId)),
          )
      }
      const added = dto.shares.filter((s) => !keptIds.has(s.envelopeId))
      if (added.length > 0) {
        await tx.insert(k).values(
          added.map((s) => ({
            accountId,
            envelopeId: s.envelopeId,
            basisPoints: s.basisPoints,
          })),
        )
      }
    })
    return this.forAccount(accountId)
  }

  /**
   * Attaches an expense (the envelope pays it, or part of it) or a transfer
   * out (the envelope's money follows it to the other account).
   */
  async attach(
    envelopeId: string,
    dto: AttachTransactionDto,
  ): Promise<EnvelopeDetailDto> {
    await this.db.transaction(async (tx) => {
      const envelope = await this.find(envelopeId, tx)
      if (envelope.archivedAt !== null) {
        throw new BadRequestException('The envelope is archived')
      }
      const row = await this.findTransaction(dto.transactionId, tx)
      if (row.accountId === null) {
        throw new BadRequestException(
          'An expense paid by someone else left no account of yours',
        )
      }
      await this.lockAccount(row.accountId, tx)
      const existing = await tx
        .select({ id: m.id })
        .from(m)
        .where(
          and(
            eq(m.transactionId, row.id),
            inArray(m.reason, ['spend', 'transfer']),
          ),
        )
      if (existing.length > 0) {
        throw new ConflictException(
          'The transaction is already attached to an envelope',
        )
      }
      const held =
        (await this.holdings(tx, row.accountId)).get(
          key(envelopeId, row.accountId),
        ) ?? 0

      if (row.kind === 'expense') {
        const own = await this.ownPart(row.id, tx)
        if (own === 0 || Math.sign(own) !== Math.sign(row.amountCents)) {
          throw new BadRequestException(
            'Nothing of this expense is yours to pay',
          )
        }
        const refund = own > 0
        const limit = Math.abs(own)
        let amount = dto.amountCents ?? (refund ? limit : Math.min(limit, held))
        if (amount > limit) {
          throw new BadRequestException('More than your part of the expense')
        }
        if (!refund && amount > held) {
          throw new BadRequestException(
            'More than the envelope holds on this account',
          )
        }
        if (amount <= 0) {
          throw new BadRequestException(
            'The envelope holds nothing on this account',
          )
        }
        amount = refund ? amount : -amount
        await tx.insert(m).values({
          envelopeId,
          accountId: row.accountId,
          amountCents: amount,
          onDate: row.bookingDate,
          reason: 'spend',
          transactionId: row.id,
        })
        return
      }

      if (row.kind === 'transfer' && row.amountCents < 0) {
        if (row.counterpartAccountId === null) {
          throw new BadRequestException(
            'Link the transfer to its other account first',
          )
        }
        const limit = -row.amountCents
        const amount = dto.amountCents ?? Math.min(limit, held)
        if (amount > limit) {
          throw new BadRequestException('More than the transfer')
        }
        if (amount > held) {
          throw new BadRequestException(
            'More than the envelope holds on this account',
          )
        }
        if (amount <= 0) {
          throw new BadRequestException(
            'The envelope holds nothing on this account',
          )
        }
        await tx.insert(m).values([
          {
            envelopeId,
            accountId: row.accountId,
            amountCents: -amount,
            onDate: row.bookingDate,
            reason: 'transfer',
            transactionId: row.id,
          },
          {
            envelopeId,
            accountId: row.counterpartAccountId,
            amountCents: amount,
            onDate: row.bookingDate,
            reason: 'transfer',
            transactionId: row.id,
          },
        ])
        return
      }

      throw new BadRequestException(
        'Only an expense or a transfer out can be attached (a saving is split)',
      )
    })
    return this.detail(envelopeId)
  }

  /**
   * Detaches a transaction (expense, transfer or saving split) from an
   * envelope. Refused (409) when the envelope would fall below zero on an
   * account: what came with the transaction was moved or spent since.
   */
  async detach(
    envelopeId: string,
    transactionId: string,
  ): Promise<EnvelopeDetailDto> {
    await this.db.transaction(async (tx) => {
      await this.find(envelopeId, tx)
      const rows = await tx
        .select({ accountId: m.accountId, amountCents: m.amountCents })
        .from(m)
        .where(
          and(eq(m.envelopeId, envelopeId), eq(m.transactionId, transactionId)),
        )
      if (rows.length === 0) {
        throw new NotFoundException(
          'The transaction is not attached to this envelope',
        )
      }
      for (const accountId of new Set(rows.map((r) => r.accountId))) {
        await this.lockAccount(accountId, tx)
      }
      const holdings = await this.holdings(tx)
      for (const row of rows) {
        const after =
          (holdings.get(key(envelopeId, row.accountId)) ?? 0) - row.amountCents
        if (row.amountCents > 0 && after < 0) {
          throw new ConflictException(
            'The envelope would fall below zero on an account: move money back first',
          )
        }
      }
      await tx
        .delete(m)
        .where(
          and(eq(m.envelopeId, envelopeId), eq(m.transactionId, transactionId)),
        )
    })
    return this.detail(envelopeId)
  }

  /**
   * Confirms the split of a saving: the shares given, else the account's
   * key (each share rounded down to the cent, the rest « libre »).
   */
  async applySplit(
    transactionId: string,
    dto: ApplySplitDto,
  ): Promise<AccountEnvelopesDto> {
    const accountId = await this.db.transaction(async (tx) => {
      const row = await this.findTransaction(transactionId, tx)
      if (
        row.accountId === null ||
        row.amountCents <= 0 ||
        (row.kind !== 'income' && row.kind !== 'transfer')
      ) {
        throw new BadRequestException(
          'Only a saving arriving on an account is split',
        )
      }
      await this.lockAccount(row.accountId, tx)
      const already = await tx
        .select({ id: m.id })
        .from(m)
        .where(and(eq(m.transactionId, row.id), eq(m.reason, 'split')))
      if (already.length > 0) {
        throw new ConflictException('This saving is already split')
      }
      const shares =
        dto.shares ??
        splitByKey(
          row.amountCents,
          (await this.splitKey(row.accountId, tx)).filter((k) => k.active),
        )
      const ids = shares.map((s) => s.envelopeId)
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException('shares: one entry per envelope')
      }
      if (shares.reduce((s, x) => s + x.amountCents, 0) > row.amountCents) {
        throw new BadRequestException('shares: more than the saving')
      }
      if (ids.length > 0) {
        const found = await tx
          .select({ id: e.id, archivedAt: e.archivedAt })
          .from(e)
          .where(inArray(e.id, ids))
        if (found.length !== ids.length || found.some((f) => f.archivedAt)) {
          throw new BadRequestException(
            'Unknown or archived envelope in shares',
          )
        }
        await tx.insert(m).values(
          shares.map((s) => ({
            envelopeId: s.envelopeId,
            accountId: row.accountId!,
            amountCents: s.amountCents,
            onDate: row.bookingDate,
            reason: 'split' as const,
            transactionId: row.id,
          })),
        )
      } else {
        // Nothing set aside: the offer is answered.
        await this.dismissIn(row.id, tx)
      }
      return row.accountId
    })
    return this.forAccount(accountId)
  }

  /** « Non » to the envelope offers on a transaction. */
  async dismissOffer(transactionId: string): Promise<void> {
    await this.findTransaction(transactionId, this.db)
    await this.dismissIn(transactionId, this.db)
  }

  /* ==========================================================================
   * HELPERS
   * ======================================================================= */

  private async dismissIn(transactionId: string, executor: Executor) {
    await executor
      .insert(envelopeOfferDismissalsTable)
      .values({ transactionId })
      .onConflictDoNothing()
  }

  private async find(id: string, executor: Executor): Promise<SelectEnvelope> {
    const [envelope] = await executor.select().from(e).where(eq(e.id, id))
    if (!envelope) throw new NotFoundException('Envelope not found')
    return envelope
  }

  private async findTransaction(id: string, executor: Executor) {
    const t = transactionsTable
    const [row] = await executor
      .select({
        id: t.id,
        accountId: t.accountId,
        kind: t.kind,
        amountCents: t.amountCents,
        bookingDate: t.bookingDate,
        counterpartAccountId: t.counterpartAccountId,
      })
      .from(t)
      .where(eq(t.id, id))
    if (!row) throw new NotFoundException('Transaction not found')
    return row
  }

  /** The owner's part of an expense's expense lines (signed). */
  private async ownPart(transactionId: string, executor: Executor) {
    const l = transactionLinesView
    const [row] = await executor
      .select({
        cents: sql<number>`coalesce(sum(${l.amountCents}), 0)::bigint`.mapWith(
          Number,
        ),
      })
      .from(l)
      .where(and(eq(l.id, transactionId), eq(l.kind, 'expense')))
    return row?.cents ?? 0
  }

  /** Serializes the writes on one account's envelopes. */
  private async lockAccount(accountId: string, tx: Tx) {
    const [account] = await tx
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId))
      .for('update')
    if (!account) throw new BadRequestException('Unknown account')
  }

  /** « Libre » of an account: its balance (0 when unknown) − its envelopes. */
  private async freeOn(accountId: string, executor: Executor) {
    const account = await this.accounts.findOne(accountId, executor)
    const [row] = await executor
      .select({
        cents: sql<number>`coalesce(sum(${m.amountCents}), 0)::bigint`.mapWith(
          Number,
        ),
      })
      .from(m)
      .where(eq(m.accountId, accountId))
    return (account.balanceCents ?? 0) - (row?.cents ?? 0)
  }

  /** Cents held per envelope and account (one account when given). */
  private async holdings(
    executor: Executor,
    accountId?: string,
  ): Promise<Holdings> {
    const rows = await executor
      .select({
        envelopeId: m.envelopeId,
        accountId: m.accountId,
        cents: sql<number>`sum(${m.amountCents})::bigint`.mapWith(Number),
      })
      .from(m)
      .where(accountId ? eq(m.accountId, accountId) : undefined)
      .groupBy(m.envelopeId, m.accountId)
    return new Map(rows.map((r) => [key(r.envelopeId, r.accountId), r.cents]))
  }

  private async splitKey(accountId: string, executor: Executor) {
    const k = envelopeSplitKeysTable
    return executor
      .select({
        envelopeId: k.envelopeId,
        basisPoints: k.basisPoints,
        active: sql<boolean>`${e.archivedAt} is null`,
      })
      .from(k)
      .innerJoin(e, eq(e.id, k.envelopeId))
      .where(eq(k.accountId, accountId))
      .orderBy(desc(k.basisPoints), asc(e.name))
      .then((rows) =>
        rows.map((row) => ({
          envelopeId: row.envelopeId,
          basisPoints: row.basisPoints,
          active: row.active,
        })),
      )
  }

  private async assertCategories(ids: string[], executor: Executor) {
    if (ids.length === 0) return
    const found = await executor
      .select({ id: categoriesTable.id, kind: categoriesTable.kind })
      .from(categoriesTable)
      .where(inArray(categoriesTable.id, ids))
    if (found.length !== ids.length) {
      throw new BadRequestException('Unknown category in categoryIds')
    }
    if (found.some((c) => c.kind !== 'expense')) {
      throw new BadRequestException(
        'An envelope pays for expense categories only',
      )
    }
  }

  private async setCategories(id: string, ids: string[], executor: Executor) {
    if (ids.length === 0) return
    await executor
      .insert(envelopeCategoriesTable)
      .values(ids.map((categoryId) => ({ envelopeId: id, categoryId })))
  }

  private async toDtos(
    envelopes: SelectEnvelope[],
    now: Date,
    executor: Executor,
  ): Promise<EnvelopeSummaryDto[]> {
    if (envelopes.length === 0) return []
    const ids = envelopes.map((envelope) => envelope.id)
    const [held, paid, categories, accounts] = await Promise.all([
      executor
        .select({
          envelopeId: m.envelopeId,
          accountId: m.accountId,
          cents: sql<number>`sum(${m.amountCents})::bigint`.mapWith(Number),
        })
        .from(m)
        .where(inArray(m.envelopeId, ids))
        .groupBy(m.envelopeId, m.accountId),
      executor
        .select({
          envelopeId: m.envelopeId,
          cents: sql<number>`(-sum(${m.amountCents}))::bigint`.mapWith(Number),
        })
        .from(m)
        .where(and(inArray(m.envelopeId, ids), eq(m.reason, 'spend')))
        .groupBy(m.envelopeId),
      executor
        .select({
          envelopeId: envelopeCategoriesTable.envelopeId,
          categoryId: envelopeCategoriesTable.categoryId,
        })
        .from(envelopeCategoriesTable)
        .where(inArray(envelopeCategoriesTable.envelopeId, ids)),
      executor
        .select({
          id: accountsTable.id,
          name: accountsTable.name,
          position: accountsTable.position,
        })
        .from(accountsTable),
    ])
    const accountOrder = new Map(
      [...accounts]
        .sort((a, b) => a.position - b.position)
        .map((a, index) => [a.id, { name: a.name, index }]),
    )
    const paidBy = new Map(paid.map((p) => [p.envelopeId, p.cents]))
    const today = parisToday(now)

    return envelopes.map((envelope) => {
      const own = held
        .filter((h) => h.envelopeId === envelope.id && h.cents !== 0)
        .sort(
          (a, b) =>
            (accountOrder.get(a.accountId)?.index ?? 0) -
            (accountOrder.get(b.accountId)?.index ?? 0),
        )
      const totalCents = own.reduce((s, h) => s + h.cents, 0)
      const paidCents = paidBy.get(envelope.id) ?? 0
      return {
        id: envelope.id,
        name: envelope.name,
        icon: envelope.icon,
        color: envelope.color,
        targetCents: envelope.targetCents,
        dueDate: envelope.dueDate,
        archived: envelope.archivedAt !== null,
        categoryIds: categories
          .filter((c) => c.envelopeId === envelope.id)
          .map((c) => c.categoryId),
        totalCents,
        paidCents,
        putAsideCents: totalCents + paidCents,
        accounts: own.map((h) => ({
          accountId: h.accountId,
          accountName: accountOrder.get(h.accountId)?.name ?? '',
          amountCents: h.cents,
        })),
        plan: envelopePlan(
          totalCents,
          envelope.targetCents,
          envelope.dueDate,
          today,
        ),
      }
    })
  }
}

/**
 * Each envelope's share of a saving by the key, rounded down to the cent
 * (the rest stays « libre »); zero shares left out.
 */
export function splitByKey(
  amountCents: number,
  key: readonly { envelopeId: string; basisPoints: number }[],
): { envelopeId: string; amountCents: number }[] {
  return key
    .map((k) => ({
      envelopeId: k.envelopeId,
      amountCents: Math.floor(
        (amountCents * k.basisPoints) / BASIS_POINTS_FULL,
      ),
    }))
    .filter((share) => share.amountCents > 0)
}

/** Progress and the monthly amount needed (« 221 € par mois pendant 7 mois »). */
export function envelopePlan(
  totalCents: number,
  targetCents: number | null,
  dueDate: string | null,
  today: string,
): EnvelopePlanDto {
  const left = dueDate === null ? null : monthsLeft(today, dueDate)
  const targetDatePassed = dueDate !== null && dueDate < today
  if (targetCents === null) {
    return {
      remainingCents: null,
      progressRatio: null,
      reached: false,
      monthsLeft: left,
      targetDatePassed,
      requiredMonthlyCents: null,
    }
  }
  const remainingCents = Math.max(0, targetCents - totalCents)
  const reached = remainingCents === 0
  return {
    remainingCents,
    progressRatio: totalCents / targetCents,
    reached,
    monthsLeft: left,
    targetDatePassed,
    requiredMonthlyCents:
      left === null || left === 0
        ? null
        : reached
          ? 0
          : Math.ceil(remainingCents / left),
  }
}
