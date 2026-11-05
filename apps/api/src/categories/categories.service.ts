import { Injectable } from '@nestjs/common'
import { DatabaseService } from '#/database/database.service'
import {
  categoriesTable,
  type SelectCategory,
  TRANSACTION_KINDS,
} from '#/database/schema'

/** French display names: sort with French rules (`Épargne` next to `Énergie`, not after `Z`). */
const byName = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

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

@Injectable()
export class CategoriesService {
  constructor(private readonly database: DatabaseService) {}

  /** Every category, grouped by kind (expense, income, transfer) then by name. */
  async list(): Promise<SelectCategory[]> {
    const categories = await this.database.db.select().from(categoriesTable)
    return categories.sort(compareCategories)
  }
}
