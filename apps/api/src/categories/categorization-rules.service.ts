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
import type {
  ApplyCategorizationRulesResultDto,
  CreateCategorizationRuleDto,
  SuggestCategorizationRuleDto,
  UpdateCategorizationRuleDto,
} from './dto/categorization-rule.dto'
import {
  categorize,
  defaultKind,
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
>

interface CategorizationChange {
  id: string
  categoryId: string | null
  ruleId: string | null
  kind: TransactionKind
  merchant: string | null
  needsReview: boolean
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
      const values = {
        enabled: dto.enabled ?? true,
        matchType: dto.matchType ?? 'contains',
        labelPattern: dto.labelPattern,
        accountId: dto.accountId ?? null,
        minAmountCents: dto.minAmountCents ?? null,
        maxAmountCents: dto.maxAmountCents ?? null,
        categoryId: dto.categoryId,
        kind: dto.kind ?? null,
        merchant: nullIfBlank(dto.merchant) ?? null,
      } satisfies Omit<InsertCategorizationRule, 'position'>
      await this.assertValidRule(tx, values)

      const [{ last }] = await tx
        .select({ last: max(categorizationRulesTable.position) })
        .from(categorizationRulesTable)
      const [rule] = await tx
        .insert(categorizationRulesTable)
        .values({ ...values, position: (last ?? -1) + 1 })
        .returning()
      return rule
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
      const counts = await this.recategorize(
        tx,
        or(
          isNull(transactionsTable.categoryId),
          isNotNull(transactionsTable.ruleId),
        )!,
        ruleSet,
      )
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
   * the category and rule, resets the kind to `defaultKind` and flags the
   * transaction for review.
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
    let lastId: string | null = null

    for (;;) {
      const rows = await executor
        .select({
          id: transactionsTable.id,
          accountId: transactionsTable.accountId,
          rawLabel: transactionsTable.rawLabel,
          merchant: transactionsTable.merchant,
          amountCents: transactionsTable.amountCents,
          categoryId: transactionsTable.categoryId,
          ruleId: transactionsTable.ruleId,
          kind: transactionsTable.kind,
          needsReview: transactionsTable.needsReview,
        })
        .from(transactionsTable)
        .where(
          lastId === null
            ? where
            : and(where, gt(transactionsTable.id, lastId)),
        )
        .orderBy(asc(transactionsTable.id))
        .limit(APPLY_CHUNK_SIZE)
      if (rows.length === 0) break
      lastId = rows[rows.length - 1].id

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
            }
          : {
              id: row.id,
              categoryId: null,
              ruleId: null,
              kind: defaultKind(row.amountCents),
              merchant: row.merchant,
              needsReview: true,
            }
        counts.scanned++
        if (result) counts.matched++
        else counts.unmatched++
        if (
          next.categoryId !== row.categoryId ||
          next.ruleId !== row.ruleId ||
          next.kind !== row.kind ||
          next.merchant !== row.merchant ||
          next.needsReview !== row.needsReview
        ) {
          changes.push(next)
        }
      }

      if (changes.length > 0) {
        await this.writeChanges(executor, changes)
        counts.updated += changes.length
      }
      if (rows.length < APPLY_CHUNK_SIZE) break
    }
    return counts
  }

  /** One `UPDATE ... FROM (VALUES ...)` per chunk. */
  private async writeChanges(
    executor: Executor,
    changes: CategorizationChange[],
  ): Promise<void> {
    const values = sql.join(
      changes.map(
        (c) =>
          sql`(${c.id}::uuid, ${c.categoryId}::uuid, ${c.ruleId}::uuid, ${c.kind}::transaction_kind, ${c.merchant}::varchar, ${c.needsReview}::boolean)`,
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
          updated_at = now()
      from (values ${values}) as v(id, category_id, rule_id, kind, merchant, needs_review)
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

    await this.assertCategoryExists(executor, rule.categoryId)
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

  private async assertCategoryExists(executor: Executor, categoryId: string) {
    const [category] = await executor
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, categoryId))
      .limit(1)
    if (!category) {
      throw new BadRequestException('categoryId does not match any category')
    }
  }
}
