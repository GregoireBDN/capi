import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { asc, count, eq, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { DatabaseService } from '#/database/database.service'
import type * as schema from '#/database/schema'
import {
  budgetsTable,
  categoriesTable,
  categorizationRulesTable,
  deletedDefaultCategoriesTable,
  recurringItemsTable,
  type SelectCategory,
  TRANSACTION_KINDS,
  transactionLinesView,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'
import { generateCategorySlug } from './category-slug'
import { DEFAULT_CATEGORIES } from './default-categories'
import type {
  CategoryUsageDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto'
import { mergeBudgetTimelines } from './merge-budget-timelines'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

/** French display names: sort with French rules (`Épargne` next to `Énergie`, not after `Z`). */
const byName = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

const DEFAULT_SLUGS: ReadonlySet<string> = new Set(
  DEFAULT_CATEGORIES.map((category) => category.slug),
)

/**
 * Category list order: by kind (expense, income, transfer), then by name. The
 * names are sorted here rather than in SQL, whose default collation may be
 * byte order.
 */
export function compareCategories(
  a: SelectCategory,
  b: SelectCategory,
): number {
  const byKind =
    TRANSACTION_KINDS.indexOf(a.kind) - TRANSACTION_KINDS.indexOf(b.kind)
  return byKind !== 0 ? byKind : byName.compare(a.name, b.name)
}

/** Whether two display names are the same, ignoring case, accents and spacing. */
function sameName(a: string, b: string): boolean {
  const squash = (name: string) => name.trim().replace(/\s+/g, ' ')
  return byName.compare(squash(a), squash(b)) === 0
}

function isInUse(usage: CategoryUsageDto): boolean {
  return (
    usage.transactions + usage.rules + usage.budgets + usage.recurringItems > 0
  )
}

@Injectable()
export class CategoriesService {
  constructor(private readonly database: DatabaseService) {}

  private get db(): Db {
    return this.database.db
  }

  /**
   * Every category, archived ones included (pickers hide them, history still
   * shows their names), grouped by kind then by name.
   */
  async list(): Promise<SelectCategory[]> {
    const categories = await this.db.select().from(categoriesTable)
    return categories.sort(compareCategories)
  }

  /** Creates a category with a slug generated from its name. */
  async create(dto: CreateCategoryDto): Promise<SelectCategory> {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ slug: categoriesTable.slug, name: categoriesTable.name })
        .from(categoriesTable)
      this.assertNameFree(existing, dto.name)
      const deleted = await tx
        .select({ slug: deletedDefaultCategoriesTable.slug })
        .from(deletedDefaultCategoriesTable)
      // Default slugs stay reserved, even once deleted: a new category never
      // takes the identity that rules, seeds and imports give a default one.
      const taken = new Set([
        ...DEFAULT_SLUGS,
        ...existing.map((c) => c.slug),
        ...deleted.map((c) => c.slug),
      ])
      const [created] = await tx
        .insert(categoriesTable)
        .values({
          slug: generateCategorySlug(dto.name, taken),
          name: dto.name,
          kind: dto.kind,
          color: dto.color,
        })
        .returning()
      return created
    })
  }

  /**
   * Renames, recolours, archives or restores a category. Changing its kind is
   * refused while transactions or budgets use it: their kind and budget would
   * no longer match the category.
   */
  async update(id: string, dto: UpdateCategoryDto): Promise<SelectCategory> {
    return this.db.transaction(async (tx) => {
      const category = await this.lock(tx, id)
      if (!category) throw new NotFoundException('Category not found')

      if (dto.name !== undefined && dto.name !== category.name) {
        const others = await tx
          .select({ id: categoriesTable.id, name: categoriesTable.name })
          .from(categoriesTable)
        this.assertNameFree(
          others.filter((other) => other.id !== id),
          dto.name,
        )
      }

      if (dto.kind !== undefined && dto.kind !== category.kind) {
        const usage = await this.usageOf(tx, id)
        if (usage.transactions > 0 || usage.budgets > 0) {
          throw new ConflictException(
            'The kind of a category used by transactions or budgets cannot change',
          )
        }
      }

      const archivedAt =
        dto.archived === undefined
          ? undefined
          : dto.archived
            ? (category.archivedAt ?? new Date())
            : null

      const [updated] = await tx
        .update(categoriesTable)
        .set({
          name: dto.name,
          kind: dto.kind,
          color: dto.color,
          archivedAt,
        })
        .where(eq(categoriesTable.id, id))
        .returning()
      return updated
    })
  }

  /** What uses the category: what a delete would have to move. */
  async usage(id: string): Promise<CategoryUsageDto> {
    const [category] = await this.db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, id))
    if (!category) throw new NotFoundException('Category not found')
    return this.usageOf(this.db, id)
  }

  /**
   * Deletes a category. When it is in use, `reassignTo` (a category of the
   * same kind) is required: its transactions, rules and recurring items move
   * there and its budget is added to the target's, all in one transaction, so
   * no transaction is left without a category. A deleted default category is
   * remembered so the seed does not create it again.
   */
  async remove(id: string, reassignTo?: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const category = await this.lock(tx, id)
      if (!category) throw new NotFoundException('Category not found')

      if (reassignTo !== undefined) {
        if (reassignTo === id) {
          throw new BadRequestException(
            'A category cannot be reassigned to itself',
          )
        }
        const target = await this.lock(tx, reassignTo)
        if (!target) throw new BadRequestException('Unknown target category')
        if (target.kind !== category.kind) {
          throw new BadRequestException(
            'The target category must be of the same kind',
          )
        }
        await this.reassign(tx, id, reassignTo)
      } else if (isInUse(await this.usageOf(tx, id))) {
        throw new ConflictException(
          'The category is in use: choose a category to move it to (reassignTo)',
        )
      }

      await tx.delete(categoriesTable).where(eq(categoriesTable.id, id))
      if (DEFAULT_SLUGS.has(category.slug)) {
        await tx
          .insert(deletedDefaultCategoriesTable)
          .values({ slug: category.slug })
          .onConflictDoNothing({ target: deletedDefaultCategoriesTable.slug })
      }
    })
  }

  /** Moves everything filed under `fromId` to `toId`. */
  private async reassign(tx: Tx, fromId: string, toId: string): Promise<void> {
    await tx
      .update(transactionsTable)
      .set({ categoryId: toId })
      .where(eq(transactionsTable.categoryId, fromId))
    await tx
      .update(transactionSplitsTable)
      .set({ categoryId: toId })
      .where(eq(transactionSplitsTable.categoryId, fromId))
    await tx
      .update(categorizationRulesTable)
      .set({ categoryId: toId })
      .where(eq(categorizationRulesTable.categoryId, fromId))
    await tx
      .update(recurringItemsTable)
      .set({ categoryId: toId })
      .where(eq(recurringItemsTable.categoryId, fromId))

    const rows = await tx
      .select({
        categoryId: budgetsTable.categoryId,
        effectiveFrom: budgetsTable.effectiveFrom,
        monthlyTargetCents: budgetsTable.monthlyTargetCents,
        note: budgetsTable.note,
      })
      .from(budgetsTable)
      .where(inArray(budgetsTable.categoryId, [fromId, toId]))
      .orderBy(asc(budgetsTable.effectiveFrom))
    const source = rows.filter((row) => row.categoryId === fromId)
    if (source.length === 0) return
    const merged = mergeBudgetTimelines(
      source,
      rows.filter((row) => row.categoryId === toId),
    )
    await tx
      .delete(budgetsTable)
      .where(inArray(budgetsTable.categoryId, [fromId, toId]))
    await tx
      .insert(budgetsTable)
      .values(merged.map((row) => ({ ...row, categoryId: toId })))
  }

  private async usageOf(
    executor: Executor,
    id: string,
  ): Promise<CategoryUsageDto> {
    const countWhere = async (
      table:
        | typeof transactionLinesView
        | typeof categorizationRulesTable
        | typeof budgetsTable
        | typeof recurringItemsTable,
    ) => {
      const [row] = await executor
        .select({ n: count() })
        .from(table)
        .where(eq(table.categoryId, id))
      return row.n
    }
    const [transactions, rules, budgets, recurringItems] = await Promise.all([
      // Split parts count in their own categories.
      countWhere(transactionLinesView),
      countWhere(categorizationRulesTable),
      countWhere(budgetsTable),
      countWhere(recurringItemsTable),
    ])
    return { transactions, rules, budgets, recurringItems }
  }

  /** Reads a category and locks its row until the transaction ends. */
  private async lock(tx: Tx, id: string): Promise<SelectCategory | undefined> {
    const [category] = await tx
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, id))
      .for('update')
    return category
  }

  private assertNameFree(
    others: readonly { name: string }[],
    name: string,
  ): void {
    if (others.some((other) => sameName(other.name, name))) {
      throw new ConflictException('A category with this name already exists')
    }
  }
}
