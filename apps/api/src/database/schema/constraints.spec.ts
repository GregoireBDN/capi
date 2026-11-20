import '#/load-env'
import { eq, sql } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from './index'
import {
  accountsTable,
  balanceSnapshotsTable,
  contactsTable,
  cryptoImportsTable,
  importsTable,
  type InsertRecurringItem,
  type InsertTransaction,
  monthClosesTable,
  receivablePaymentsTable,
  receivablesTable,
  recurringItemsTable,
  savingsGoalsTable,
  transactionsTable,
} from './index'

/**
 * Rules the database enforces since #367 (ADR 0005 R3, R4, R7): one spec per
 * check constraint, the generated bank columns, time stamps with time zone
 * and `updated_at` maintained by a trigger. Synthetic rows only; every test
 * runs in a transaction that is rolled back.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

describe.skipIf(!process.env.DATABASE_URL)('database rules (#367)', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, { max: 1 })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  async function inRollback(fn: (tx: Tx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx)
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  /** `write` fails on `constraint`, inside a savepoint so `tx` goes on. */
  async function refused(
    tx: Tx,
    constraint: string,
    write: (nested: Tx) => Promise<unknown>,
  ) {
    await expect(
      tx.transaction(async (nested) => {
        await write(nested)
      }),
    ).rejects.toMatchObject({ cause: { constraint_name: constraint } })
  }

  async function account(
    tx: Tx,
    values: Partial<typeof accountsTable.$inferInsert> = {},
  ) {
    const [created] = await tx
      .insert(accountsTable)
      .values({ name: 'Compte fictif', type: 'checking', ...values })
      .returning()
    return created
  }

  async function bankImport(tx: Tx, accountId: string) {
    const [created] = await tx
      .insert(importsTable)
      .values({
        accountId,
        source: 'cic_csv',
        fileName: 'releve-fictif.csv',
        fileHash: 'fixture',
        committedAt: new Date('2026-10-31T09:00:00Z'),
      })
      .returning()
    return created
  }

  /** A bank row of `accountId`, from `importId`. */
  function bankRow(
    accountId: string,
    importId: string,
    values: Partial<InsertTransaction> = {},
  ): InsertTransaction {
    return {
      accountId,
      importId,
      bookingDate: '2026-10-15',
      amountCents: -1_250,
      rawLabel: 'PAIEMENT CB 1510 VILLE FICTIVE',
      kind: 'expense',
      dedupeHash: `hash-${values.bookingDate ?? '2026-10-15'}-${values.amountCents ?? -1_250}`,
      ...values,
    }
  }

  /** A transaction entered by hand on `accountId`. */
  function manualRow(
    accountId: string,
    values: Partial<InsertTransaction> = {},
  ): InsertTransaction {
    return {
      accountId,
      bookingDate: '2026-10-16',
      amountCents: -800,
      rawLabel: 'Boulangerie fictive',
      kind: 'expense',
      manual: true,
      dedupeHash: 'manual:00000000-0000-4000-8000-000000000001',
      ...values,
    }
  }

  function recurringItem(
    accountId: string,
    values: Partial<InsertRecurringItem> = {},
  ): InsertRecurringItem {
    return {
      accountId,
      merchantKey: 'abonnement fictif',
      direction: 'debit',
      name: 'Abonnement fictif',
      status: 'confirmed',
      isFixedCost: true,
      cadence: 'monthly',
      amountType: 'fixed',
      typicalAmountCents: 999,
      confidence: 0.9,
      lastSeenDate: '2026-10-01',
      ...values,
    }
  }

  describe('transactions', () => {
    it('refuses a bank row without an import and a manual row with one', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const file = await bankImport(tx, checking.id)
        await refused(tx, 'transactions_manual_iff_no_import', (nested) =>
          nested
            .insert(transactionsTable)
            .values(bankRow(checking.id, file.id, { importId: null })),
        )
        await refused(tx, 'transactions_manual_iff_no_import', (nested) =>
          nested
            .insert(transactionsTable)
            .values(manualRow(checking.id, { importId: file.id })),
        )
        // Both kinds of rows that follow the rule are kept.
        await tx
          .insert(transactionsTable)
          .values([bankRow(checking.id, file.id), manualRow(checking.id)])
      })
    })

    it('refuses a manual row without a manual: hash, and a bank row with one', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const file = await bankImport(tx, checking.id)
        await refused(tx, 'transactions_manual_iff_manual_hash', (nested) =>
          nested
            .insert(transactionsTable)
            .values(manualRow(checking.id, { dedupeHash: 'hash-fictif' })),
        )
        await refused(tx, 'transactions_manual_iff_manual_hash', (nested) =>
          nested.insert(transactionsTable).values(
            bankRow(checking.id, file.id, {
              dedupeHash: 'manual:00000000-0000-4000-8000-000000000002',
            }),
          ),
        )
      })
    })

    it('refuses a link to another account on a row that is not a transfer', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const livret = await account(tx, {
          name: 'Livret fictif',
          type: 'savings',
        })
        const file = await bankImport(tx, checking.id)
        await refused(
          tx,
          'transactions_counterpart_only_on_transfers',
          (nested) =>
            nested.insert(transactionsTable).values(
              bankRow(checking.id, file.id, {
                kind: 'expense',
                counterpartAccountId: livret.id,
              }),
            ),
        )
        await tx.insert(transactionsTable).values(
          bankRow(checking.id, file.id, {
            kind: 'transfer',
            counterpartAccountId: livret.id,
          }),
        )
      })
    })

    it('refuses a prepaid payment that is not an expense', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const file = await bankImport(tx, checking.id)
        const [plan] = await tx
          .insert(recurringItemsTable)
          .values(recurringItem(checking.id, { termMonths: 12 }))
          .returning()
        const [payment] = await tx
          .insert(transactionsTable)
          .values(bankRow(checking.id, file.id, { prepaidItemId: plan.id }))
          .returning()
        // Raw SQL, as a forgotten write path would do it.
        await refused(tx, 'transactions_prepaid_only_on_expenses', (nested) =>
          nested.execute(
            sql`update transactions set kind = 'transfer' where id = ${payment.id}`,
          ),
        )
      })
    })

    it('refuses a bank correction on a manual row', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        await refused(
          tx,
          'transactions_correction_only_on_bank_rows',
          (nested) =>
            nested
              .insert(transactionsTable)
              .values(manualRow(checking.id, { originalAmountCents: -900 })),
        )
        await refused(
          tx,
          'transactions_correction_only_on_bank_rows',
          (nested) =>
            nested.insert(transactionsTable).values(
              manualRow(checking.id, {
                originalBookingDate: '2026-10-14',
              }),
            ),
        )
      })
    })

    it('keeps an absorbed manual entry on bank rows only (#371)', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const absorbedManual = {
          bookingDate: '2026-10-13',
          rawLabel: 'Ciné fictif',
          note: null,
        }
        await refused(
          tx,
          'transactions_absorbed_manual_only_on_bank_rows',
          (nested) =>
            nested
              .insert(transactionsTable)
              .values(manualRow(checking.id, { absorbedManual })),
        )
        const statement = await bankImport(tx, checking.id)
        await tx
          .insert(transactionsTable)
          .values(bankRow(checking.id, statement.id, { absorbedManual }))
      })
    })

    it('computes the bank values and keeps them read-only', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const file = await bankImport(tx, checking.id)
        const [plain, corrected] = await tx
          .insert(transactionsTable)
          .values([
            bankRow(checking.id, file.id),
            bankRow(checking.id, file.id, {
              dedupeHash: 'hash-corrected',
              amountCents: -2_000,
              bookingDate: '2026-10-20',
              originalAmountCents: -1_250,
              originalBookingDate: '2026-10-15',
            }),
          ])
          .returning()
        expect(plain.bankAmountCents).toBe(-1_250)
        expect(plain.bankBookingDate).toBe('2026-10-15')
        expect(corrected.amountCents).toBe(-2_000)
        expect(corrected.bankAmountCents).toBe(-1_250)
        expect(corrected.bankBookingDate).toBe('2026-10-15')

        // Removing the correction puts the bank values back.
        const [restored] = await tx
          .update(transactionsTable)
          .set({ originalAmountCents: null, originalBookingDate: null })
          .where(eq(transactionsTable.id, corrected.id))
          .returning()
        expect(restored.bankAmountCents).toBe(-2_000)
        expect(restored.bankBookingDate).toBe('2026-10-20')

        await expect(
          tx.transaction((nested) =>
            nested.execute(
              sql`update transactions set bank_amount_cents = 0 where id = ${plain.id}`,
            ),
          ),
        ).rejects.toMatchObject({ cause: { code: '428C9' } })
      })
    })

    it('reads bank data of an account by day through the partial index', async () => {
      const [index] = await db.execute<{ indexdef: string }>(
        sql`select indexdef from pg_indexes where indexname = 'transactions_account_bank_booking_date_idx'`,
      )
      expect(index.indexdef).toContain('(account_id, bank_booking_date)')
      expect(index.indexdef).toContain('WHERE (NOT manual)')
    })
  })

  describe('recurring items', () => {
    it('refuses an end date on an item that is not confirmed', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        await refused(tx, 'recurring_items_ended_only_confirmed', (nested) =>
          nested.insert(recurringItemsTable).values(
            recurringItem(checking.id, {
              status: 'dismissed',
              endedOn: '2026-11-01',
            }),
          ),
        )
      })
    })

    it('refuses a prepaid term on a credit', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        await refused(tx, 'recurring_items_term_only_debit', (nested) =>
          nested.insert(recurringItemsTable).values(
            recurringItem(checking.id, {
              direction: 'credit',
              termMonths: 12,
            }),
          ),
        )
      })
    })
  })

  describe('accounts', () => {
    it('refuses sync times on an account that is not crypto', async () => {
      await inRollback(async (tx) => {
        await refused(tx, 'accounts_crypto_sync_only_crypto', (nested) =>
          account(nested, { cryptoSyncedAt: new Date('2026-10-31T09:00:00Z') }),
        )
        await refused(tx, 'accounts_crypto_sync_only_crypto', (nested) =>
          account(nested, {
            cryptoSyncFailedAt: new Date('2026-10-31T09:00:00Z'),
          }),
        )
        await account(tx, {
          type: 'crypto',
          cryptoSource: 'wallet',
          cryptoSyncedAt: new Date('2026-10-31T09:00:00Z'),
        })
      })
    })

    it('keeps an account with exchange imports until they are deleted', async () => {
      await inRollback(async (tx) => {
        const exchange = await account(tx, {
          type: 'crypto',
          cryptoSource: 'exchange',
          cryptoProvider: 'binance',
        })
        await tx.insert(cryptoImportsTable).values({
          accountId: exchange.id,
          format: 'binance_csv',
          fileName: 'export-fictif.csv',
          fileHash: 'fixture',
          committedAt: new Date('2026-10-31T09:00:00Z'),
        })
        await refused(
          tx,
          'crypto_imports_account_id_accounts_id_fk',
          (nested) =>
            nested
              .delete(accountsTable)
              .where(eq(accountsTable.id, exchange.id)),
        )
      })
    })
  })

  describe('savings goals', () => {
    it('keeps a typed amount on manual goals only', async () => {
      await inRollback(async (tx) => {
        const goal = { name: 'Objectif fictif', targetCents: 100_000 }
        await refused(tx, 'savings_goals_manual_amount_iff_manual', (nested) =>
          nested
            .insert(savingsGoalsTable)
            .values({ ...goal, source: 'accounts', manualAmountCents: 500 }),
        )
        await refused(tx, 'savings_goals_manual_amount_iff_manual', (nested) =>
          nested
            .insert(savingsGoalsTable)
            .values({ ...goal, source: 'manual', manualAmountCents: null }),
        )
        await tx.insert(savingsGoalsTable).values([
          { ...goal, source: 'accounts' },
          { ...goal, source: 'manual', manualAmountCents: 0 },
        ])
      })
    })
  })

  describe('month closes', () => {
    it('refuses a ticked step that does not exist', async () => {
      await inRollback(async (tx) => {
        await refused(tx, 'month_closes_acknowledged_steps', (nested) =>
          nested
            .insert(monthClosesTable)
            .values({ month: '2026-10', acknowledged: ['budget', 'imports'] }),
        )
        await tx
          .insert(monthClosesTable)
          .values({ month: '2026-10', acknowledged: ['recurring', 'savings'] })
      })
    })
  })

  describe('balance_snapshots (#366)', () => {
    it('stores a crypto account’s values as computed, every other as typed', async () => {
      await inRollback(async (tx) => {
        const crypto = await account(tx, {
          type: 'crypto',
          cryptoSource: 'manual',
        })
        const pea = await account(tx, { type: 'brokerage' })
        const value = (accountId: string, source: 'typed' | 'computed') =>
          tx.insert(balanceSnapshotsTable).values({
            accountId,
            date: '2026-10-31',
            valueCents: 100_00,
            source,
          })
        await refused(tx, 'balance_snapshots_source_by_type', (nested) =>
          nested.insert(balanceSnapshotsTable).values({
            accountId: crypto.id,
            date: '2026-10-31',
            valueCents: 100_00,
          }),
        )
        await refused(tx, 'balance_snapshots_source_by_type', (nested) =>
          nested.insert(balanceSnapshotsTable).values({
            accountId: pea.id,
            date: '2026-10-31',
            valueCents: 100_00,
            source: 'computed',
          }),
        )
        await value(crypto.id, 'computed')
        await value(pea.id, 'typed')
        await refused(tx, 'balance_snapshots_source_by_type', (nested) =>
          nested
            .update(balanceSnapshotsTable)
            .set({ source: 'typed' })
            .where(eq(balanceSnapshotsTable.accountId, crypto.id)),
        )
      })
    })
  })

  describe('money owed (#359)', () => {
    async function contact(tx: Tx, name = 'Contact fictif') {
      const [created] = await tx
        .insert(contactsTable)
        .values({ name })
        .returning()
      return created
    }

    it('refuses a row without an account unless a contact paid it, as a manual expense', async () => {
      await inRollback(async (tx) => {
        const sam = await contact(tx)
        await refused(tx, 'transactions_account_or_paid_by', (n) =>
          n.insert(transactionsTable).values(manualRow(null as never)),
        )
        await refused(tx, 'transactions_paid_by_manual_expense', (n) =>
          n.insert(transactionsTable).values(
            manualRow(null as never, {
              paidByContactId: sam.id,
              kind: 'income',
              amountCents: 800,
            }),
          ),
        )
        await tx
          .insert(transactionsTable)
          .values(manualRow(null as never, { paidByContactId: sam.id }))
      })
    })

    it('refuses an amount owed of 0, above its bill, or twice for one person', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const sam = await contact(tx)
        const [row] = await tx
          .insert(transactionsTable)
          .values(manualRow(checking.id))
          .returning()
        const owed = {
          direction: 'owed_to_me' as const,
          transactionId: row.id,
          contactId: sam.id,
          amountCents: 400,
        }
        await refused(tx, 'receivables_amount_positive', (n) =>
          n.insert(receivablesTable).values({ ...owed, amountCents: 0 }),
        )
        await refused(tx, 'receivables_bill_covers_amount', (n) =>
          n.insert(receivablesTable).values({ ...owed, billCents: 300 }),
        )
        await tx.insert(receivablesTable).values(owed)
        await refused(tx, 'receivables_transaction_contact_unique', (n) =>
          n.insert(receivablesTable).values(owed),
        )
      })
    })

    it('refuses a repayment of 0 and a split part without its transfer', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const sam = await contact(tx)
        const [row] = await tx
          .insert(transactionsTable)
          .values(manualRow(checking.id))
          .returning()
        const [owed] = await tx
          .insert(receivablesTable)
          .values({
            direction: 'owed_to_me',
            transactionId: row.id,
            contactId: sam.id,
            amountCents: 400,
          })
          .returning()
        const payment = {
          receivableId: owed.id,
          amountCents: 100,
          paidOn: '2026-10-20',
        }
        await refused(tx, 'receivable_payments_amount_positive', (n) =>
          n
            .insert(receivablePaymentsTable)
            .values({ ...payment, amountCents: 0 }),
        )
        await refused(tx, 'receivable_payments_split_needs_transaction', (n) =>
          n.insert(receivablePaymentsTable).values({
            ...payment,
            splitId: '00000000-0000-4000-8000-000000000099',
          }),
        )
      })
    })

    it('keeps a recurring share whole: a contact, a start and one of a rate or an amount', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const sam = await contact(tx)
        await refused(tx, 'recurring_items_share_complete', (n) =>
          n.insert(recurringItemsTable).values(
            recurringItem(checking.id, {
              shareContactId: sam.id,
              shareFrom: '2026-10-01',
            }),
          ),
        )
        await refused(tx, 'recurring_items_share_range', (n) =>
          n.insert(recurringItemsTable).values(
            recurringItem(checking.id, {
              shareContactId: sam.id,
              shareFrom: '2026-10-01',
              shareBps: 10_001,
            }),
          ),
        )
      })
    })

    it('refuses a repayment day out of the month and two contacts of one name', async () => {
      await inRollback(async (tx) => {
        await refused(tx, 'contacts_repayment_day_range', (n) =>
          n.insert(contactsTable).values({ name: 'Camille', repaymentDay: 32 }),
        )
        await contact(tx, 'Camille')
        await refused(tx, 'contacts_name_unique', (n) =>
          n.insert(contactsTable).values({ name: 'camille' }),
        )
      })
    })
  })

  describe('time stamps', () => {
    it('stores every instant with its time zone', async () => {
      const columns = await db.execute<{
        table_name: string
        column_name: string
      }>(
        sql`select c.table_name, c.column_name
            from information_schema.columns c
            where c.table_schema = 'public'
              and c.data_type = 'timestamp without time zone'`,
      )
      expect([...columns]).toEqual([])
    })

    it('has the updated_at trigger on every table that has the column', async () => {
      const missing = await db.execute<{ table_name: string }>(
        sql`select c.table_name
            from information_schema.columns c
            join information_schema.tables t
              on t.table_schema = c.table_schema and t.table_name = c.table_name
            where c.table_schema = 'public'
              and t.table_type = 'BASE TABLE'
              and c.column_name = 'updated_at'
              and not exists (
                select 1 from pg_trigger g
                where g.tgrelid = format('public.%I', c.table_name)::regclass
                  and g.tgname = c.table_name || '_set_updated_at'
              )`,
      )
      expect([...missing]).toEqual([])
    })

    it('moves updated_at on a raw SQL update, keeps one set by the update', async () => {
      await inRollback(async (tx) => {
        const old = new Date('2020-01-01T00:00:00Z')
        const checking = await account(tx, { updatedAt: old })
        await tx.execute(
          sql`update accounts set name = 'Compte renommé' where id = ${checking.id}`,
        )
        const [raw] = await tx
          .select({ updatedAt: accountsTable.updatedAt })
          .from(accountsTable)
          .where(eq(accountsTable.id, checking.id))
        expect(raw.updatedAt.getTime()).toBeGreaterThan(old.getTime())

        const chosen = new Date('2026-10-31T09:00:00Z')
        await tx
          .update(accountsTable)
          .set({ name: 'Compte fictif', updatedAt: chosen })
          .where(eq(accountsTable.id, checking.id))
        const [kept] = await tx
          .select({ updatedAt: accountsTable.updatedAt })
          .from(accountsTable)
          .where(eq(accountsTable.id, checking.id))
        expect(kept.updatedAt.toISOString()).toBe(chosen.toISOString())
      })
    })

    it('reads an instant back unchanged whatever the session time zone', async () => {
      await inRollback(async (tx) => {
        const at = new Date('2026-10-31T23:30:00Z')
        await tx.execute(sql`set local time zone 'Europe/Paris'`)
        const checking = await account(tx, { archivedAt: at })
        const [row] = await tx
          .select({ archivedAt: accountsTable.archivedAt })
          .from(accountsTable)
          .where(eq(accountsTable.id, checking.id))
        expect(row.archivedAt?.toISOString()).toBe(at.toISOString())
      })
    })
  })
})
