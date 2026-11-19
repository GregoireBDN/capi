import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  max,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  categorizationRulesTable,
  type InsertCategorizationRule,
  type SelectCategorizationRule,
  type SelectCategory,
  type TransactionKind,
  transactionsTable,
} from '#/database/schema'
import { addMonths, todayInParis } from '#/recurring/dates'
import {
  type ApplyCategorizationRulesResultDto,
  type CategorizationRuleConflictDto,
  type CategorizationRuleMatchDto,
  type CategorizationRuleMatchesDto,
  type CategorizationRuleMatchesQueryDto,
  type CategorizationRulePreviewDto,
  type CategorizationRulePreviewTransactionDto,
  type CategorizationRulesInsightsDto,
  type CreateCategorizationRuleDto,
  MATCH_WINDOW_MONTHS,
  PREVIEW_SAMPLE_SIZE,
  type PreviewCategorizationRuleDto,
  type SuggestCategorizationRuleDto,
  type UpdateCategorizationRuleDto,
} from './dto/categorization-rule.dto'
import {
  categorize,
  compareRules,
  defaultKind,
  matchingRules,
  prioritiesForOrder,
  ruleMatches,
  ruleOutcome,
  sortRules,
  validateRulePattern,
} from './rules/categorize'
import {
  type SuggestedRule,
  suggestRuleFromTransaction,
} from './rules/suggest-rule'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** The database or an open transaction. */
type Executor = Db | Tx

/** Transactions read and written per round-trip when re-applying rules. */
export const APPLY_CHUNK_SIZE = 500

/** A rule with its 0-based place in the evaluation order. */
export type RankedRule = SelectCategorizationRule & { rank: number }

/** A row read by `chunks`. */
interface ScannedTransaction {
  id: string
  bookingDate: string
  accountId: string
  rawLabel: string
  merchant: string | null
  amountCents: number
  categoryId: string | null
  ruleId: string | null
  kind: TransactionKind
  needsReview: boolean
  counterpartAccountId: string | null
}

/** Rows `apply` may change: uncategorized, or categorized by a rule. */
function inApplyScope(row: Pick<ScannedTransaction, 'categoryId' | 'ruleId'>) {
  return row.categoryId === null || row.ruleId !== null
}

/** First day of the match window: `MATCH_WINDOW_MONTHS` months back. */
export function matchWindowStart(now: Date = new Date()): string {
  return addMonths(todayInParis(now), -MATCH_WINDOW_MONTHS)
}

/**
 * Counts, per (winner, loser) pair, the transactions where two rules with
 * different outcomes both match: `matched` is in evaluation order, so the
 * first rule wins over each later one that files the row differently.
 */
class ConflictCounter {
  private readonly counts = new Map<string, CategorizationRuleConflictDto>()

  constructor(private readonly categoriesById: Map<string, SelectCategory>) {}

  add(matched: readonly SelectCategorizationRule[]) {
    if (matched.length < 2) return
    const [winner, ...others] = matched
    const won = ruleOutcome(winner, this.categoriesById)
    for (const loser of others) {
      const lost = ruleOutcome(loser, this.categoriesById)
      if (
        won &&
        lost &&
        won.categoryId === lost.categoryId &&
        won.kind === lost.kind
      ) {
        continue
      }
      const key = `${winner.id}:${loser.id}`
      const entry = this.counts.get(key)
      if (entry) entry.count++
      else {
        this.counts.set(key, {
          winnerRuleId: winner.id,
          loserRuleId: loser.id,
          count: 1,
        })
      }
    }
  }

  /** Most transactions first, then by ids for a stable order. */
  list(): CategorizationRuleConflictDto[] {
    return [...this.counts.values()].sort(
      (a, b) =>
        b.count - a.count ||
        a.winnerRuleId.localeCompare(b.winnerRuleId) ||
        a.loserRuleId.localeCompare(b.loserRuleId),
    )
  }
}

/** What the categorization engine needs, loaded once per batch. */
export interface RuleSet {
  rules: SelectCategorizationRule[]
  categoriesById: Map<string, SelectCategory>
}

/** Fields of a rule that conditions and outcomes are validated on. */
type RuleFields = Pick<
  InsertCategorizationRule,
  | 'matchType'
  | 'labelPattern'
  | 'accountId'
  | 'minAmountCents'
  | 'maxAmountCents'
  | 'categoryId'
  | 'kind'
  | 'counterpartAccountId'
>

interface CategorizationChange {
  id: string
  categoryId: string | null
  ruleId: string | null
  kind: TransactionKind
  merchant: string | null
  needsReview: boolean
  counterpartAccountId: string | null
}

interface ApplyCounts {
  scanned: number
  matched: number
  unmatched: number
  updated: number
}

/** Empty merchant strings mean "no merchant". */
function nullIfBlank(
  value: string | null | undefined,
): string | null | undefined {
  return value === '' ? null : value
}

/** Id of the unsaved rule evaluated by `preview`. */
const PREVIEW_RULE_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Transactions `apply` re-evaluates: uncategorized, or categorized by a rule.
 * Manual categorizations (category, no rule) are never overwritten.
 */
const APPLY_SCOPE = () =>
  or(isNull(transactionsTable.categoryId), isNotNull(transactionsTable.ruleId))!

/** Column values of a new rule, before its position is known. */
function newRuleValues(dto: CreateCategorizationRuleDto) {
  return {
    enabled: dto.enabled ?? true,
    priority: dto.priority ?? 0,
    matchType: dto.matchType ?? 'contains',
    labelPattern: dto.labelPattern,
    accountId: dto.accountId ?? null,
    minAmountCents: dto.minAmountCents ?? null,
    maxAmountCents: dto.maxAmountCents ?? null,
    categoryId: dto.categoryId,
    kind: dto.kind ?? null,
    merchant: nullIfBlank(dto.merchant) ?? null,
    counterpartAccountId: dto.counterpartAccountId ?? null,
  } satisfies Omit<InsertCategorizationRule, 'position'>
}

@Injectable()
export class CategorizationRulesService {
  constructor(private readonly database: DatabaseService) {}

  private get db(): Db {
    return this.database.db
  }

  /** Every rule in evaluation order (`compareRules`), with its rank. */
  async list(executor: Executor = this.db): Promise<RankedRule[]> {
    const rules = await executor.select().from(categorizationRulesTable)
    return sortRules(rules).map((rule, rank) => ({ ...rule, rank }))
  }

  /** `rule` with its rank among the saved rules. */
  private async ranked(
    executor: Executor,
    rule: SelectCategorizationRule,
  ): Promise<RankedRule> {
    const rules = await this.list(executor)
    return rules.find((r) => r.id === rule.id) ?? { ...rule, rank: 0 }
  }

  async findOne(
    id: string,
    executor: Executor = this.db,
  ): Promise<SelectCategorizationRule> {
    const [rule] = await executor
      .select()
      .from(categorizationRulesTable)
      .where(eq(categorizationRulesTable.id, id))
      .limit(1)
    if (!rule) throw new NotFoundException('Categorization rule not found')
    return rule
  }

  /**
   * Creates a rule. Its place in the evaluation order is computed
   * (`compareRules`); `position` only records that it is the newest.
   */
  create(dto: CreateCategorizationRuleDto): Promise<RankedRule> {
    return this.db.transaction(async (tx) => {
      const values = newRuleValues(dto)
      await this.assertValidRule(tx, values)
      const [rule] = await tx
        .insert(categorizationRulesTable)
        .values({ ...values, position: await this.nextPosition(tx) })
        .returning()
      return this.ranked(tx, rule)
    })
  }

  /**
   * Makes rule `id` win the transactions it shares with `overRuleId`
   * (« faire gagner cette règle », #299). A rule already first is left as it
   * is. When the other one only wins through a higher priority and this one
   * is more specific, the other's priority comes back down to this one's
   * (so making them win in turn never climbs); otherwise this one's priority
   * becomes one more than the other's.
   */
  prefer(id: string, overRuleId: string): Promise<RankedRule> {
    return this.db.transaction(async (tx) => {
      if (id === overRuleId) {
        throw new BadRequestException('overRuleId must be another rule')
      }
      const rule = await this.findOne(id, tx)
      const [other] = await tx
        .select()
        .from(categorizationRulesTable)
        .where(eq(categorizationRulesTable.id, overRuleId))
        .limit(1)
      if (!other) {
        throw new BadRequestException('overRuleId does not match any rule')
      }
      if (compareRules(rule, other) < 0) return this.ranked(tx, rule)
      // The other rule was raised above this one: putting it back level is
      // enough when this one is the more specific (no priority race).
      if (
        other.priority > rule.priority &&
        compareRules(rule, { ...other, priority: rule.priority }) < 0
      ) {
        await tx
          .update(categorizationRulesTable)
          .set({ priority: rule.priority })
          .where(eq(categorizationRulesTable.id, overRuleId))
        return this.ranked(tx, rule)
      }
      const [updated] = await tx
        .update(categorizationRulesTable)
        .set({ priority: other.priority + 1 })
        .where(eq(categorizationRulesTable.id, id))
        .returning()
      return this.ranked(tx, updated)
    })
  }

  /**
   * Sets the evaluation order by hand (#299, drag and drop): `ids` lists
   * every rule once, first = evaluated first. The order itself is not
   * stored: the rules get the fewest priorities that produce it
   * (`prioritiesForOrder`), so those left in their computed place stay at 0.
   */
  reorder(ids: string[]): Promise<RankedRule[]> {
    return this.db.transaction(async (tx) => {
      const rules = await tx.select().from(categorizationRulesTable)
      const byId = new Map(rules.map((rule) => [rule.id, rule]))
      if (
        new Set(ids).size !== ids.length ||
        ids.length !== rules.length ||
        ids.some((id) => !byId.has(id))
      ) {
        throw new BadRequestException(
          'ids must list every categorization rule exactly once',
        )
      }
      const priorities = prioritiesForOrder(ids.map((id) => byId.get(id)!))
      const changed = rules.filter(
        (rule) => priorities.get(rule.id) !== rule.priority,
      )
      if (changed.length > 0) {
        const values = sql.join(
          changed.map(
            (rule) =>
              sql`(${rule.id}::uuid, ${priorities.get(rule.id)!}::integer)`,
          ),
          sql`, `,
        )
        await tx.execute(sql`
          update ${categorizationRulesTable} as r
          set priority = v.priority, updated_at = now()
          from (values ${values}) as v(id, priority)
          where r.id = v.id
        `)
      }
      return this.list(tx)
    })
  }

  /**
   * The transactions booked over the last `MATCH_WINDOW_MONTHS` months that
   * the conditions match, whatever their category: what a rule being written
   * would catch (the editor's first step), most recent first.
   */
  async matches(
    query: CategorizationRuleMatchesQueryDto,
    now: Date = new Date(),
  ): Promise<CategorizationRuleMatchesDto> {
    const matchType = query.matchType ?? 'contains'
    const patternError = validateRulePattern(matchType, query.labelPattern)
    if (patternError) throw new BadRequestException(patternError)
    const since = matchWindowStart(now)
    const rule: SelectCategorizationRule = {
      id: PREVIEW_RULE_ID,
      position: 0,
      priority: 0,
      enabled: true,
      matchType,
      labelPattern: query.labelPattern,
      accountId: query.accountId ?? null,
      minAmountCents: query.minAmountCents ?? null,
      maxAmountCents: query.maxAmountCents ?? null,
      categoryId: PREVIEW_RULE_ID,
      kind: null,
      merchant: null,
      counterpartAccountId: null,
      createdAt: now,
      updatedAt: now,
    }
    let total = 0
    const found: CategorizationRuleMatchDto[] = []
    for await (const rows of this.chunks(
      this.db,
      gte(transactionsTable.bookingDate, since),
    )) {
      for (const row of rows) {
        if (!ruleMatches(rule, row)) continue
        total++
        found.push({
          id: row.id,
          bookingDate: row.bookingDate,
          accountId: row.accountId,
          rawLabel: row.rawLabel,
          merchant: row.merchant,
          amountCents: row.amountCents,
          categoryId: row.categoryId,
          manual: !inApplyScope(row),
        })
      }
    }
    found.sort(
      (a, b) =>
        b.bookingDate.localeCompare(a.bookingDate) || a.id.localeCompare(b.id),
    )
    return { since, total, transactions: found.slice(0, PREVIEW_SAMPLE_SIZE) }
  }

  /**
   * What the rules page shows beside each rule (#299): how many transactions
   * of the last `MATCH_WINDOW_MONTHS` months its conditions match, and the
   * conflicts between enabled rules (the same transactions, not filed by
   * hand, filed differently by two rules; the first in the order wins).
   */
  async insights(
    now: Date = new Date(),
  ): Promise<CategorizationRulesInsightsDto> {
    const since = matchWindowStart(now)
    const ruleSet = await this.loadRuleSet()
    const counts = new Map(ruleSet.rules.map((rule) => [rule.id, 0]))
    const conflicts = new ConflictCounter(ruleSet.categoriesById)
    for await (const rows of this.chunks(this.db, sql`true`)) {
      for (const row of rows) {
        if (row.bookingDate >= since) {
          for (const rule of ruleSet.rules) {
            if (ruleMatches(rule, row)) {
              counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1)
            }
          }
        }
        if (inApplyScope(row)) {
          conflicts.add(
            matchingRules(row, ruleSet.rules, ruleSet.categoriesById),
          )
        }
      }
    }
    return {
      since,
      rules: ruleSet.rules.map((rule) => ({
        ruleId: rule.id,
        matchCount: counts.get(rule.id) ?? 0,
      })),
      conflicts: conflicts.list(),
    }
  }

  /**
   * What saving `dto` and then re-applying the rules would do, without saving
   * anything. A new rule takes its computed place in the order; with
   * `ruleId`, `dto` replaces that rule (an edit). Only this rule's effect is reported:
   * transactions it would win (first match wins) and those it categorizes
   * today but would no longer win, and its conflicts: the other rules that
   * match the same rows with another outcome, and which one wins. Manual
   * categorizations are never counted, as `apply` never touches them.
   */
  async preview(
    dto: PreviewCategorizationRuleDto,
  ): Promise<CategorizationRulePreviewDto> {
    return this.db.transaction(async (tx) => {
      const { ruleId, ...body } = dto
      const values = newRuleValues(body)
      await this.assertValidRule(tx, values)
      const ruleSet = await this.loadRuleSet(tx)
      const existing = ruleId
        ? ruleSet.rules.find((rule) => rule.id === ruleId)
        : undefined
      if (ruleId && !existing) {
        throw new NotFoundException('Categorization rule not found')
      }
      const now = new Date()
      const candidate: SelectCategorizationRule = existing
        ? { ...existing, ...values, updatedAt: now }
        : {
            ...values,
            id: PREVIEW_RULE_ID,
            position: await this.nextPosition(tx),
            createdAt: now,
            updatedAt: now,
          }
      const rules = [
        ...ruleSet.rules.filter((rule) => rule.id !== candidate.id),
        candidate,
      ]

      const result = {
        matched: 0,
        leavingReview: 0,
        released: 0,
        changed: 0,
      }
      const changed: CategorizationRulePreviewTransactionDto[] = []
      const conflicts = new ConflictCounter(ruleSet.categoriesById)
      for await (const rows of this.chunks(tx, APPLY_SCOPE())) {
        for (const row of rows) {
          const ownedToday = row.ruleId === candidate.id
          const matches = ruleMatches(candidate, row)
          // Cheap pre-check: most rows have nothing to do with this rule.
          if (!ownedToday && !matches) continue
          if (matches && candidate.enabled) {
            const matched = matchingRules(row, rules, ruleSet.categoriesById)
            // Only the pairs this rule is part of.
            const own = matched.findIndex((r) => r.id === candidate.id)
            if (own === 0) conflicts.add(matched)
            else if (own > 0) conflicts.add([matched[0], candidate])
          }
          const outcome = categorize(row, rules, ruleSet.categoriesById)
          const wins = outcome?.ruleId === candidate.id
          if (!wins && !ownedToday) continue
          if (wins) {
            result.matched++
            if (row.needsReview && row.categoryId === null) {
              result.leavingReview++
            }
          } else {
            result.released++
          }
          const nextCategoryId = outcome?.categoryId ?? null
          const nextKind = outcome
            ? outcome.kind
            : row.categoryId === null
              ? row.kind
              : defaultKind(row.amountCents)
          if (nextCategoryId === row.categoryId && nextKind === row.kind) {
            continue
          }
          result.changed++
          changed.push({
            id: row.id,
            bookingDate: row.bookingDate,
            accountId: row.accountId,
            rawLabel: row.rawLabel,
            merchant: row.merchant,
            amountCents: row.amountCents,
            categoryId: row.categoryId,
            kind: row.kind,
            nextCategoryId,
            nextKind,
          })
        }
      }
      changed.sort(
        (a, b) =>
          b.bookingDate.localeCompare(a.bookingDate) ||
          a.id.localeCompare(b.id),
      )
      return {
        ...result,
        transactions: changed.slice(0, PREVIEW_SAMPLE_SIZE),
        conflicts: conflicts.list(),
      }
    })
  }

  /**
   * Partial update. Transactions already categorized by the rule keep their
   * category until rules are re-applied (`apply`).
   */
  update(id: string, dto: UpdateCategorizationRuleDto): Promise<RankedRule> {
    return this.db.transaction(async (tx) => {
      const existing = await this.findOne(id, tx)
      const changes: Partial<InsertCategorizationRule> = {}
      for (const key of [
        'enabled',
        'priority',
        'matchType',
        'labelPattern',
        'accountId',
        'minAmountCents',
        'maxAmountCents',
        'categoryId',
        'kind',
        'counterpartAccountId',
      ] as const) {
        if (dto[key] !== undefined) {
          Object.assign(changes, { [key]: dto[key] })
        }
      }
      if (dto.merchant !== undefined)
        changes.merchant = nullIfBlank(dto.merchant)
      if (Object.keys(changes).length === 0) return this.ranked(tx, existing)

      await this.assertValidRule(tx, { ...existing, ...changes })
      const [rule] = await tx
        .update(categorizationRulesTable)
        .set(changes)
        .where(eq(categorizationRulesTable.id, id))
        .returning()
      return this.ranked(tx, rule)
    })
  }

  /**
   * Deletes a rule. The transactions it had categorized are re-run through
   * the remaining rules first: otherwise the `rule_id` foreign key would be
   * nulled and they would pass for manual categorizations, which `apply`
   * never touches. Those no other rule matches go back to the review queue.
   */
  async remove(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.findOne(id, tx)
      const ruleSet = await this.loadRuleSet(tx)
      ruleSet.rules = ruleSet.rules.filter((rule) => rule.id !== id)
      await this.recategorize(tx, eq(transactionsTable.ruleId, id), ruleSet)
      await tx
        .delete(categorizationRulesTable)
        .where(eq(categorizationRulesTable.id, id))
    })
  }

  /** Proposes a rule from a transaction the user just categorized. Not saved. */
  async suggest(dto: SuggestCategorizationRuleDto): Promise<SuggestedRule> {
    await this.assertCategoryExists(this.db, dto.categoryId)
    return suggestRuleFromTransaction(
      {
        accountId: dto.accountId,
        rawLabel: dto.rawLabel,
        merchant: dto.merchant ?? null,
        amountCents: dto.amountCents,
      },
      dto.categoryId,
    )
  }

  /**
   * Re-runs the rules on every transaction that is uncategorized or was
   * categorized by a rule. Manual categorizations (category set, no rule)
   * are never overwritten. Runs in one database transaction, in chunks.
   */
  apply(): Promise<ApplyCategorizationRulesResultDto> {
    return this.db.transaction(async (tx) => {
      const ruleSet = await this.loadRuleSet(tx)
      const counts = await this.recategorize(tx, APPLY_SCOPE(), ruleSet)
      const [{ manual }] = await tx
        .select({ manual: count() })
        .from(transactionsTable)
        .where(
          and(
            isNotNull(transactionsTable.categoryId),
            isNull(transactionsTable.ruleId),
          ),
        )
      return { ...counts, manualSkipped: manual }
    })
  }

  /** Rules and categories for `categorize`, e.g. once per import. */
  async loadRuleSet(executor: Executor = this.db): Promise<RuleSet> {
    const [rules, categories] = await Promise.all([
      this.list(executor),
      executor.select().from(categoriesTable),
    ])
    return {
      rules,
      categoriesById: new Map(categories.map((c) => [c.id, c])),
    }
  }

  /**
   * Re-runs `ruleSet` on the transactions matching `where`, by id-ordered
   * chunks, and writes back the rows whose outcome changed.
   *
   * A match sets category, kind, rule and merchant, and clears the review
   * flag of a transaction that was uncategorized (a flag on an already
   * categorized one may come from elsewhere, so it is kept). No match clears
   * the category and rule, flags the transaction for review and resets the
   * kind of a rule-categorized row to `defaultKind`; a row that was already
   * uncategorized keeps its kind (e.g. an internal transfer marked by hand).
   */
  private async recategorize(
    executor: Executor,
    where: SQL,
    { rules, categoriesById }: RuleSet,
  ): Promise<ApplyCounts> {
    const counts: ApplyCounts = {
      scanned: 0,
      matched: 0,
      unmatched: 0,
      updated: 0,
    }
    for await (const rows of this.chunks(executor, where)) {
      const changes: CategorizationChange[] = []
      for (const row of rows) {
        const result = categorize(row, rules, categoriesById)
        const next: CategorizationChange = result
          ? {
              id: row.id,
              categoryId: result.categoryId,
              ruleId: result.ruleId,
              kind: result.kind,
              merchant: result.merchant,
              needsReview: row.categoryId === null ? false : row.needsReview,
              // A link set earlier (by hand, a match or a rule) is kept; a
              // transaction that stops being a transfer loses it.
              counterpartAccountId:
                result.kind === 'transfer'
                  ? (row.counterpartAccountId ?? result.counterpartAccountId)
                  : null,
            }
          : {
              id: row.id,
              categoryId: null,
              ruleId: null,
              // An uncategorized row keeps its kind: it is `defaultKind` from
              // the import, or one the user set by hand in the review queue.
              kind:
                row.categoryId === null
                  ? row.kind
                  : defaultKind(row.amountCents),
              merchant: row.merchant,
              needsReview: true,
              counterpartAccountId:
                row.categoryId === null && row.kind === 'transfer'
                  ? row.counterpartAccountId
                  : null,
            }
        counts.scanned++
        if (result) counts.matched++
        else counts.unmatched++
        if (
          next.categoryId !== row.categoryId ||
          next.ruleId !== row.ruleId ||
          next.kind !== row.kind ||
          next.merchant !== row.merchant ||
          next.needsReview !== row.needsReview ||
          next.counterpartAccountId !== row.counterpartAccountId
        ) {
          changes.push(next)
        }
      }

      if (changes.length > 0) {
        await this.writeChanges(executor, changes)
        counts.updated += changes.length
      }
    }
    return counts
  }

  /** The transactions matching `where`, by id-ordered chunks. */
  private async *chunks(
    executor: Executor,
    where: SQL,
  ): AsyncGenerator<ScannedTransaction[]> {
    let lastId: string | null = null
    for (;;) {
      const rows = await executor
        .select({
          id: transactionsTable.id,
          bookingDate: transactionsTable.bookingDate,
          accountId: transactionsTable.accountId,
          rawLabel: transactionsTable.rawLabel,
          merchant: transactionsTable.merchant,
          amountCents: transactionsTable.amountCents,
          categoryId: transactionsTable.categoryId,
          ruleId: transactionsTable.ruleId,
          kind: transactionsTable.kind,
          needsReview: transactionsTable.needsReview,
          counterpartAccountId: transactionsTable.counterpartAccountId,
        })
        .from(transactionsTable)
        .where(
          lastId === null
            ? where
            : and(where, gt(transactionsTable.id, lastId)),
        )
        .orderBy(asc(transactionsTable.id))
        .limit(APPLY_CHUNK_SIZE)
      if (rows.length === 0) return
      lastId = rows[rows.length - 1].id
      yield rows
      if (rows.length < APPLY_CHUNK_SIZE) return
    }
  }

  /** Position of a rule appended last. */
  private async nextPosition(executor: Executor): Promise<number> {
    const [{ last }] = await executor
      .select({ last: max(categorizationRulesTable.position) })
      .from(categorizationRulesTable)
    return (last ?? -1) + 1
  }

  /** One `UPDATE ... FROM (VALUES ...)` per chunk. */
  private async writeChanges(
    executor: Executor,
    changes: CategorizationChange[],
  ): Promise<void> {
    const values = sql.join(
      changes.map(
        (c) =>
          sql`(${c.id}::uuid, ${c.categoryId}::uuid, ${c.ruleId}::uuid, ${c.kind}::transaction_kind, ${c.merchant}::varchar, ${c.needsReview}::boolean, ${c.counterpartAccountId}::uuid)`,
      ),
      sql`, `,
    )
    await executor.execute(sql`
      update ${transactionsTable} as t
      set category_id = v.category_id,
          rule_id = v.rule_id,
          kind = v.kind,
          merchant = v.merchant,
          needs_review = v.needs_review,
          counterpart_account_id = v.counterpart_account_id,
          updated_at = now()
      from (values ${values}) as v(id, category_id, rule_id, kind, merchant, needs_review, counterpart_account_id)
      where t.id = v.id
    `)
  }

  private async assertValidRule(executor: Executor, rule: RuleFields) {
    const patternError = validateRulePattern(
      rule.matchType ?? 'contains',
      rule.labelPattern,
    )
    if (patternError) throw new BadRequestException(patternError)

    if (
      rule.minAmountCents != null &&
      rule.maxAmountCents != null &&
      rule.minAmountCents > rule.maxAmountCents
    ) {
      throw new BadRequestException(
        'minAmountCents must be less than or equal to maxAmountCents',
      )
    }

    const categoryKind = await this.assertCategoryExists(
      executor,
      rule.categoryId,
    )
    if (rule.counterpartAccountId != null) {
      if ((rule.kind ?? categoryKind) !== 'transfer') {
        throw new BadRequestException(
          'counterpartAccountId is only for a rule filing transfers',
        )
      }
      if (rule.counterpartAccountId === rule.accountId) {
        throw new BadRequestException(
          'counterpartAccountId must differ from accountId',
        )
      }
      const [account] = await executor
        .select({ id: accountsTable.id })
        .from(accountsTable)
        .where(eq(accountsTable.id, rule.counterpartAccountId))
        .limit(1)
      if (!account) {
        throw new BadRequestException(
          'counterpartAccountId does not match any account',
        )
      }
    }
    if (rule.accountId != null) {
      const [account] = await executor
        .select({ id: accountsTable.id })
        .from(accountsTable)
        .where(eq(accountsTable.id, rule.accountId))
        .limit(1)
      if (!account) {
        throw new BadRequestException('accountId does not match any account')
      }
    }
  }

  private async assertCategoryExists(
    executor: Executor,
    categoryId: string,
  ): Promise<TransactionKind> {
    const [category] = await executor
      .select({ id: categoriesTable.id, kind: categoriesTable.kind })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, categoryId))
      .limit(1)
    if (!category) {
      throw new BadRequestException('categoryId does not match any category')
    }
    return category.kind
  }
}
