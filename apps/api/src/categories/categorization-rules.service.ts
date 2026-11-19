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
import {
  type ApplyCategorizationRulesResultDto,
  type CategorizationRulePreviewDto,
  type CategorizationRulePreviewTransactionDto,
  type CreateCategorizationRuleDto,
  PREVIEW_SAMPLE_SIZE,
  type PreviewCategorizationRuleDto,
  type SuggestCategorizationRuleDto,
  type UpdateCategorizationRuleDto,
} from './dto/categorization-rule.dto'
import {
  categorize,
  defaultKind,
  ruleMatches,
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

  list(executor: Executor = this.db): Promise<SelectCategorizationRule[]> {
    return executor
      .select()
      .from(categorizationRulesTable)
      .orderBy(
        asc(categorizationRulesTable.position),
        asc(categorizationRulesTable.id),
      )
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

  /** Appends a rule at the end of the order (lowest priority). */
  create(dto: CreateCategorizationRuleDto): Promise<SelectCategorizationRule> {
    return this.db.transaction(async (tx) => {
      const values = newRuleValues(dto)
      await this.assertValidRule(tx, values)
      const [rule] = await tx
        .insert(categorizationRulesTable)
        .values({ ...values, position: await this.nextPosition(tx) })
        .returning()
      return rule
    })
  }

  /**
   * What saving `dto` and then re-applying the rules would do, without saving
   * anything. A new rule is appended last; with `ruleId`, `dto` replaces that
   * rule at its position (an edit). Only this rule's effect is reported:
   * transactions it would win (first match wins) and those it categorizes
   * today but would no longer win. Manual categorizations are never counted,
   * as `apply` never touches them.
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
      for await (const rows of this.chunks(tx, APPLY_SCOPE())) {
        for (const row of rows) {
          const ownedToday = row.ruleId === candidate.id
          // Cheap pre-check: most rows have nothing to do with this rule.
          if (!ownedToday && !ruleMatches(candidate, row)) continue
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
      }
    })
  }

  /**
   * Partial update. Transactions already categorized by the rule keep their
   * category until rules are re-applied (`apply`).
   */
  update(
    id: string,
    dto: UpdateCategorizationRuleDto,
  ): Promise<SelectCategorizationRule> {
    return this.db.transaction(async (tx) => {
      const existing = await this.findOne(id, tx)
      const changes: Partial<InsertCategorizationRule> = {}
      for (const key of [
        'enabled',
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
      if (Object.keys(changes).length === 0) return existing

      await this.assertValidRule(tx, { ...existing, ...changes })
      const [rule] = await tx
        .update(categorizationRulesTable)
        .set(changes)
        .where(eq(categorizationRulesTable.id, id))
        .returning()
      return rule
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

  /**
   * Sets the evaluation order: `ids` must list every rule exactly once, first
   * = highest priority. Positions become 0..n-1.
   */
  reorder(ids: string[]): Promise<SelectCategorizationRule[]> {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: categorizationRulesTable.id })
        .from(categorizationRulesTable)
      const known = new Set(existing.map((rule) => rule.id))
      const requested = new Set(ids)
      if (
        requested.size !== ids.length ||
        requested.size !== known.size ||
        ids.some((id) => !known.has(id))
      ) {
        throw new BadRequestException(
          'ids must list every categorization rule exactly once',
        )
      }

      if (ids.length > 0) {
        const positions = sql.join(
          ids.map((id, position) => sql`(${id}::uuid, ${position}::integer)`),
          sql`, `,
        )
        await tx.execute(sql`
          update ${categorizationRulesTable} as r
          set position = v.position, updated_at = now()
          from (values ${positions}) as v(id, position)
          where r.id = v.id
        `)
      }
      return this.list(tx)
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
  private async *chunks(executor: Executor, where: SQL) {
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
