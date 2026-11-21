import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { importsTable } from '#/imports/imports.schema'
import type { InsertTransaction } from '#/transactions/transactions.schema'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = PgDatabase<PgQueryResultHKT, any, any>

const fixtureImports = new WeakMap<Executor, Map<string, Promise<string>>>()

/**
 * Spec fixtures (#367): makes rows built by hand follow the rules of
 * `transactions`. A bank row (not `manual`) without an import gets one
 * committed import of its account, shared by the rows of that account in the
 * same executor (transaction); a manual row gets a `manual:` hash. Rows that
 * already follow the rules are returned as they are.
 *
 *   await tx.insert(transactionsTable).values(await bankRows(tx, rows))
 */
export async function bankRows<T extends InsertTransaction>(
  executor: Executor,
  rows: T | readonly T[],
): Promise<T[]> {
  const list = (Array.isArray(rows) ? rows : [rows]) as readonly T[]
  let byAccount = fixtureImports.get(executor)
  if (!byAccount) {
    byAccount = new Map()
    fixtureImports.set(executor, byAccount)
  }
  const imports = byAccount
  return Promise.all(
    list.map(async (row) => {
      if (row.manual) {
        return row.dedupeHash.startsWith('manual:')
          ? row
          : { ...row, dedupeHash: `manual:${row.dedupeHash}`.slice(0, 64) }
      }
      if (row.importId) return row
      // A bank row is always on an account (#359: only « Quelqu’un a payé pour moi »
      // rows, entered by hand, have none).
      const accountId = row.accountId!
      let importId = imports.get(accountId)
      if (!importId) {
        importId = executor
          .insert(importsTable)
          .values({
            accountId,
            source: 'cic_csv',
            fileName: 'fixture.csv',
            fileHash: 'fixture',
            committedAt: new Date('2026-01-01T00:00:00Z'),
          })
          .returning({ id: importsTable.id })
          .then(([created]) => created.id)
        imports.set(accountId, importId)
      }
      return { ...row, importId: await importId }
    }),
  )
}
