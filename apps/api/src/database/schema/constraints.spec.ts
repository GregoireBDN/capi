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
  dashboardWidgetAccountsTable,
  dashboardWidgetEnvelopesTable,
  dashboardWidgetsTable,
  envelopesTable,
  cryptoImportsTable,
  cryptoMovementsTable,
  cryptoTransferLinksTable,
  importProfilesTable,
  importsTable,
  type InsertRecurringItem,
  type InsertTransaction,
  monthClosesTable,
  receivableOffsetsTable,
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
          .set({
            amountCents: -1_250,
            bookingDate: '2026-10-15',
            originalAmountCents: null,
            originalBookingDate: null,
          })
          .where(eq(transactionsTable.id, corrected.id))
          .returning()
        expect(restored.amountCents).toBe(-1_250)
        expect(restored.bankBookingDate).toBe('2026-10-15')

        await expect(
          tx.transaction((nested) =>
            nested.execute(
              sql`update transactions set bank_amount_cents = 0 where id = ${plain.id}`,
            ),
          ),
        ).rejects.toMatchObject({ cause: { code: '428C9' } })
      })
    })

    it('keeps the bank amount and date of an imported row (#398)', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const file = await bankImport(tx, checking.id)
        const [plain, corrected] = await tx
          .insert(transactionsTable)
          .values([
            bankRow(checking.id, file.id),
            // Corrected before #398: it may only go back to the bank's.
            bankRow(checking.id, file.id, {
              dedupeHash: 'hash-corrected',
              amountCents: -2_000,
              originalAmountCents: -1_250,
            }),
          ])
          .returning()
        const refusedWrite = (
          id: string,
          set: Partial<typeof transactionsTable.$inferInsert>,
        ) =>
          expect(
            tx.transaction(async (nested) => {
              await nested
                .update(transactionsTable)
                .set(set)
                .where(eq(transactionsTable.id, id))
            }),
          ).rejects.toMatchObject({ cause: { code: '23514' } })
        await refusedWrite(plain.id, { amountCents: -900 })
        await refusedWrite(plain.id, { bookingDate: '2026-10-16' })
        await refusedWrite(plain.id, {
          amountCents: -900,
          originalAmountCents: -1_250,
        })
        await refusedWrite(corrected.id, { amountCents: -3_000 })
        await refusedWrite(corrected.id, { originalAmountCents: null })
        // Back to the bank's value: fine.
        const [restored] = await tx
          .update(transactionsTable)
          .set({ amountCents: -1_250, originalAmountCents: null })
          .where(eq(transactionsTable.id, corrected.id))
          .returning()
        expect(restored.amountCents).toBe(-1_250)
        // A row entered by hand changes freely.
        const [noted] = await tx
          .insert(transactionsTable)
          .values(manualRow(checking.id))
          .returning()
        const [edited] = await tx
          .update(transactionsTable)
          .set({ amountCents: -777, bookingDate: '2026-10-02' })
          .where(eq(transactionsTable.id, noted.id))
          .returning()
        expect(edited.amountCents).toBe(-777)
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

    it('refuses a prepaid term on an item that is not confirmed (#439)', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        await refused(tx, 'recurring_items_term_only_confirmed', (nested) =>
          nested.insert(recurringItemsTable).values(
            recurringItem(checking.id, {
              status: 'suggested',
              termMonths: 12,
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

  describe('crypto movements and transfers (#373)', () => {
    const DAY = new Date('2026-10-31T09:00:00Z')

    async function setup(tx: Tx) {
      const exchange = await account(tx, {
        type: 'crypto',
        cryptoSource: 'exchange',
        cryptoProvider: 'coinbase',
      })
      const wallet = await account(tx, {
        type: 'crypto',
        cryptoSource: 'wallet',
      })
      const [imported] = await tx
        .insert(cryptoImportsTable)
        .values({
          accountId: exchange.id,
          format: 'coinbase_csv',
          fileName: 'export-fictif.csv',
          fileHash: 'fixture',
          committedAt: DAY,
        })
        .returning()
      let n = 0
      const line = (
        values: Partial<typeof cryptoMovementsTable.$inferInsert> = {},
      ): typeof cryptoMovementsTable.$inferInsert => ({
        accountId: exchange.id,
        importId: imported.id,
        occurredAt: DAY,
        operation: 'Send',
        kind: 'withdrawal',
        asset: 'BTC',
        quantity: '-0.5',
        dedupeHash: `fixture-${++n}`,
        ...values,
      })
      const observedIn = (
        values: Partial<typeof cryptoMovementsTable.$inferInsert> = {},
      ) =>
        line({
          accountId: wallet.id,
          importId: null,
          operation: 'wallet_sync',
          kind: 'observed_in',
          assetId: 'bitcoin',
          quantity: '0.4999',
          observedSince: new Date('2026-10-30T09:00:00Z'),
          ...values,
        })
      const insert = async (
        executor: Tx,
        row: typeof cryptoMovementsTable.$inferInsert,
      ) =>
        (await executor.insert(cryptoMovementsTable).values(row).returning())[0]
      return { exchange, wallet, line, observedIn, insert }
    }

    it('reads a wallet only on wallets and manual accounts, a base never on crypto', async () => {
      await inRollback(async (tx) => {
        await refused(
          tx,
          'accounts_crypto_observed_only_wallet_or_manual',
          (nested) =>
            account(nested, {
              type: 'crypto',
              cryptoSource: 'exchange',
              cryptoProvider: 'binance',
              cryptoObservedAt: DAY,
            }),
        )
        await refused(tx, 'accounts_invested_base_type', (nested) =>
          account(nested, {
            type: 'crypto',
            cryptoSource: 'wallet',
            investedBaseCents: 1_000_00,
            investedBaseOn: '2026-10-31',
          }),
        )
        await account(tx, {
          type: 'crypto',
          cryptoSource: 'manual',
          cryptoObservedAt: DAY,
        })
        await account(tx, {
          type: 'brokerage',
          investedBaseCents: 1_000_00,
          investedBaseOn: '2026-10-31',
        })
      })
    })

    it('keeps an observed movement without import, with its price id, signed by its kind', async () => {
      await inRollback(async (tx) => {
        const { line, observedIn, insert } = await setup(tx)
        await refused(tx, 'crypto_movements_observed_shape', (nested) =>
          insert(nested, observedIn({ assetId: null })),
        )
        await refused(tx, 'crypto_movements_observed_shape', (nested) =>
          insert(nested, line({ importId: null })),
        )
        await refused(tx, 'crypto_movements_observed_shape', (nested) =>
          insert(nested, line({ observedSince: DAY })),
        )
        await refused(tx, 'crypto_movements_observed_sign', (nested) =>
          insert(nested, observedIn({ quantity: '-0.1' })),
        )
        await refused(tx, 'crypto_movements_observed_sign', (nested) =>
          insert(nested, observedIn({ kind: 'observed_out', quantity: '0.1' })),
        )
        await insert(tx, observedIn())
      })
    })

    it('answers arrivals with a cost and departures without one', async () => {
      await inRollback(async (tx) => {
        const { line, observedIn, insert } = await setup(tx)
        await refused(tx, 'crypto_movements_resolution_kind', (nested) =>
          insert(nested, line({ resolution: 'gift', costCents: 0 })),
        )
        await refused(tx, 'crypto_movements_resolution_kind', (nested) =>
          insert(nested, observedIn({ resolution: 'disposed' })),
        )
        await refused(tx, 'crypto_movements_given_cost', (nested) =>
          insert(nested, observedIn({ resolution: 'bought' })),
        )
        await refused(tx, 'crypto_movements_given_cost', (nested) =>
          insert(nested, observedIn({ costCents: 100_00 })),
        )
        await refused(tx, 'crypto_movements_given_cost', (nested) =>
          insert(nested, observedIn({ resolution: 'gift', costCents: 100_00 })),
        )
        await insert(
          tx,
          observedIn({ resolution: 'bought', costCents: 100_00 }),
        )
        await insert(tx, line({ resolution: 'disposed' }))
      })
    })

    it('keeps a transaction hash digest on export lines only, as hex SHA-256 (#426)', async () => {
      await inRollback(async (tx) => {
        const { line, observedIn, insert } = await setup(tx)
        const digest = 'a'.repeat(64)
        await refused(tx, 'crypto_movements_tx_hash_digest', (nested) =>
          insert(nested, observedIn({ txHashDigest: digest })),
        )
        await refused(tx, 'crypto_movements_tx_hash_digest', (nested) =>
          insert(nested, line({ txHashDigest: 'not-a-digest' })),
        )
        await refused(tx, 'crypto_movements_tx_hash_digest', (nested) =>
          insert(nested, line({ txHashDigest: 'A'.repeat(64) })),
        )
        await insert(tx, line({ txHashDigest: digest }))
      })
    })

    it('puts an exchange export on an exchange, a Ledger Live history on a wallet (#426)', async () => {
      await inRollback(async (tx) => {
        const { exchange, wallet } = await setup(tx)
        const values = (
          accountId: string,
          format: 'coinbase_csv' | 'ledger_live_csv',
        ) => ({
          accountId,
          format,
          fileName: 'export-fictif.csv',
          fileHash: 'fixture',
        })
        await refused(tx, 'crypto_imports_account_source', (nested) =>
          nested
            .insert(cryptoImportsTable)
            .values(values(exchange.id, 'ledger_live_csv')),
        )
        await refused(tx, 'crypto_imports_account_source', (nested) =>
          nested
            .insert(cryptoImportsTable)
            .values(values(wallet.id, 'coinbase_csv')),
        )
        await tx
          .insert(cryptoImportsTable)
          .values(values(wallet.id, 'ledger_live_csv'))
      })
    })

    it('links a departure to an arrival of another account, once, never answered otherwise', async () => {
      await inRollback(async (tx) => {
        const { line, observedIn, insert } = await setup(tx)
        const out = await insert(tx, line())
        const arrival = await insert(tx, observedIn())
        const opening = await insert(tx, observedIn({ observedSince: null }))
        const sameAccount = await insert(
          tx,
          line({ kind: 'deposit', quantity: '0.5' }),
        )
        const link = (outId: string, inId: string) => (nested: Tx) =>
          nested.insert(cryptoTransferLinksTable).values({
            outMovementId: outId,
            inMovementId: inId,
            matched: 'auto',
          })
        await refused(
          tx,
          'crypto_transfer_links_sides',
          link(arrival.id, out.id),
        )
        await refused(
          tx,
          'crypto_transfer_links_sides',
          link(out.id, opening.id),
        )
        await refused(
          tx,
          'crypto_transfer_links_sides',
          link(out.id, sameAccount.id),
        )
        await link(out.id, arrival.id)(tx)
        await refused(
          tx,
          'crypto_transfer_links_out_unique',
          link(out.id, arrival.id),
        )
        await refused(tx, 'crypto_movements_linked_unanswered', (nested) =>
          nested
            .update(cryptoMovementsTable)
            .set({ resolution: 'gift', costCents: 0 })
            .where(eq(cryptoMovementsTable.id, arrival.id)),
        )
        const answered = await insert(
          tx,
          observedIn({ resolution: 'gift', costCents: 0 }),
        )
        const other = await insert(tx, line())
        await refused(
          tx,
          'crypto_transfer_links_sides',
          link(other.id, answered.id),
        )
      })
    })
  })

  describe('import profiles (#431)', () => {
    const profile = (
      values: Partial<typeof importProfilesTable.$inferInsert> = {},
    ): typeof importProfilesTable.$inferInsert => ({
      name: 'Banque fictive',
      target: 'cash',
      encoding: 'utf-8',
      delimiter: ';',
      decimalSeparator: ',',
      dateFormat: 'dd/mm/yyyy',
      headers: ['jour', 'texte', 'valeur', 'debit', 'credit'],
      columns: { date: 'jour', label: 'texte', amount: 'valeur' },
      ...values,
    })

    it('keeps the settings among the known values', async () => {
      await inRollback(async (tx) => {
        await tx
          .insert(importProfilesTable)
          .values(profile({ delimiter: '\t' }))
        for (const [constraint, values] of [
          ['import_profiles_encoding_known', { encoding: 'latin-9' }],
          ['import_profiles_delimiter_known', { delimiter: '|' }],
          [
            'import_profiles_decimal_separator_known',
            { decimalSeparator: ' ' },
          ],
          ['import_profiles_date_format_known', { dateFormat: 'yyyymmdd' }],
          [
            'import_profiles_headers_size',
            {
              headers: [
                'jour',
                'texte',
                'valeur',
                ...Array.from({ length: 198 }, (_, i) => `colonne ${i}`),
              ],
            },
          ],
          ['import_profiles_name_not_blank', { name: '  ' }],
        ] as [string, Partial<typeof importProfilesTable.$inferInsert>][]) {
          await refused(tx, constraint, (n) =>
            n.insert(importProfilesTable).values(profile(values)),
          )
        }
      })
    })

    it('maps only its target’s fields to columns of its header, with the required ones', async () => {
      await inRollback(async (tx) => {
        await tx.insert(importProfilesTable).values(
          profile({
            headers: ['jour', 'texte', 'debit', 'credit'],
            columns: {
              date: 'jour',
              label: 'texte',
              debit: 'debit',
              credit: 'credit',
            },
          }),
        )
        for (const columns of [
          { date: 'jour', label: 'absente', amount: 'valeur' },
          { date: 'jour', label: 'jour', amount: 'valeur' },
          { date: 'jour', amount: 'valeur' },
          { date: 'jour', label: 'texte' },
          {
            date: 'jour',
            label: 'texte',
            amount: 'valeur',
            debit: 'debit',
            credit: 'credit',
          },
          { date: 'jour', label: 'texte', debit: 'debit' },
          { date: 'jour', label: 'texte', amount: 'valeur', kind: 'credit' },
          { date: 'jour', label: 'texte', amount: 3 },
          ['jour'],
        ]) {
          await refused(tx, 'import_profiles_columns_valid', (n) =>
            n
              .insert(importProfilesTable)
              .values(profile({ columns: columns as never, delimiter: ',' })),
          )
        }
        await tx.insert(importProfilesTable).values(
          profile({
            target: 'investment',
            columns: { date: 'jour', kind: 'texte', amount: 'valeur' },
            kindValues: { coupon: 'interest' },
            delimiter: ',',
          }),
        )
        await refused(tx, 'import_profiles_columns_valid', (n) =>
          n
            .insert(importProfilesTable)
            .values(profile({ target: 'investment', delimiter: '\t' })),
        )
      })
    })

    it('keeps kind values on investment profiles, mapped to the standard kinds', async () => {
      await inRollback(async (tx) => {
        await refused(tx, 'import_profiles_kind_values_valid', (n) =>
          n
            .insert(importProfilesTable)
            .values(profile({ kindValues: { coupon: 'interest' } })),
        )
        await refused(tx, 'import_profiles_kind_values_valid', (n) =>
          n.insert(importProfilesTable).values(
            profile({
              target: 'investment',
              columns: { date: 'jour', kind: 'texte', amount: 'valeur' },
              kindValues: { coupon: 'swap' } as never,
            }),
          ),
        )
      })
    })

    it('reads a header with one profile only', async () => {
      await inRollback(async (tx) => {
        await tx.insert(importProfilesTable).values(profile())
        await refused(tx, 'import_profiles_header_unique', (n) =>
          n.insert(importProfilesTable).values(profile({ name: 'Autre' })),
        )
      })
    })

    it('links an import to a profile only as a csv_profile import, unlinked when deleted', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const [saved] = await tx
          .insert(importProfilesTable)
          .values(profile())
          .returning()
        const base = {
          accountId: checking.id,
          fileName: 'releve-fictif.csv',
          fileHash: 'fixture',
        }
        await refused(tx, 'imports_profile_source', (n) =>
          n
            .insert(importsTable)
            .values({ ...base, source: 'standard_csv', profileId: saved.id }),
        )
        const [linked] = await tx
          .insert(importsTable)
          .values({ ...base, source: 'csv_profile', profileId: saved.id })
          .returning()
        await tx
          .delete(importProfilesTable)
          .where(eq(importProfilesTable.id, saved.id))
        const [kept] = await tx
          .select({ profileId: importsTable.profileId })
          .from(importsTable)
          .where(eq(importsTable.id, linked.id))
        expect(kept.profileId).toBeNull()
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

    it('refuses to delete a share, or its expense, that still has repayments (#438)', async () => {
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
        await tx.insert(receivablePaymentsTable).values({
          receivableId: owed.id,
          amountCents: 100,
          paidOn: '2026-10-20',
        })
        const fk = 'receivable_payments_receivable_id_receivables_id_fk'
        await refused(tx, fk, (n) =>
          n.delete(receivablesTable).where(eq(receivablesTable.id, owed.id)),
        )
        await refused(tx, fk, (n) =>
          n.delete(transactionsTable).where(eq(transactionsTable.id, row.id)),
        )
        // Without its repayments, the share goes with its expense.
        await tx
          .delete(receivablePaymentsTable)
          .where(eq(receivablePaymentsTable.receivableId, owed.id))
        await tx
          .delete(transactionsTable)
          .where(eq(transactionsTable.id, row.id))
      })
    })

    it('keeps what was repaid and let go within the share, the part let go dated (#437)', async () => {
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
        const letGo = { forgivenAt: new Date('2026-10-21T10:00:00Z') }
        await refused(tx, 'receivables_forgiven_dated', (n) =>
          n
            .update(receivablesTable)
            .set({ forgivenCents: 100 })
            .where(eq(receivablesTable.id, owed.id)),
        )
        await refused(tx, 'receivables_forgiven_within_share', (n) =>
          n
            .update(receivablesTable)
            .set({ ...letGo, forgivenCents: 500 })
            .where(eq(receivablesTable.id, owed.id)),
        )
        await tx.insert(receivablePaymentsTable).values({
          receivableId: owed.id,
          amountCents: 200,
          paidOn: '2026-10-20',
        })
        await tx
          .update(receivablesTable)
          .set({ ...letGo, forgivenCents: 100 })
          .where(eq(receivablesTable.id, owed.id))
        // 200 repaid + 100 let go: 100 left, no more.
        await refused(tx, 'receivables_settled_within_share', (n) =>
          n.insert(receivablePaymentsTable).values({
            receivableId: owed.id,
            amountCents: 101,
            paidOn: '2026-10-22',
          }),
        )
        await refused(tx, 'receivables_settled_within_share', (n) =>
          n
            .update(receivablesTable)
            .set({ forgivenCents: 201 })
            .where(eq(receivablesTable.id, owed.id)),
        )
        await refused(tx, 'receivables_settled_within_share', (n) =>
          n
            .update(receivablesTable)
            .set({ amountCents: 299 })
            .where(eq(receivablesTable.id, owed.id)),
        )
        await tx.insert(receivablePaymentsTable).values({
          receivableId: owed.id,
          amountCents: 100,
          paidOn: '2026-10-22',
        })
      })
    })

    it('keeps an offset balanced: one contact, both sides, the same amount, undone as one (#484)', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const sam = await contact(tx)
        const lea = await contact(tx, 'Autre contact fictif')
        const [paid] = await tx
          .insert(transactionsTable)
          .values(manualRow(checking.id))
          .returning()
        const [debt, debtLea] = await tx
          .insert(transactionsTable)
          .values([
            manualRow(null as never, {
              paidByContactId: sam.id,
              amountCents: -500,
              dedupeHash: 'manual:00000000-0000-4000-8000-000000000002',
            }),
            manualRow(null as never, {
              paidByContactId: lea.id,
              amountCents: -500,
              dedupeHash: 'manual:00000000-0000-4000-8000-000000000003',
            }),
          ])
          .returning()
        const [owed, owe, oweLea] = await tx
          .insert(receivablesTable)
          .values([
            {
              direction: 'owed_to_me',
              transactionId: paid.id,
              contactId: sam.id,
              amountCents: 400,
            },
            {
              direction: 'i_owe',
              transactionId: debt.id,
              contactId: sam.id,
              amountCents: 500,
            },
            {
              direction: 'i_owe',
              transactionId: debtLea.id,
              contactId: lea.id,
              amountCents: 500,
            },
          ])
          .returning()
        /** Writes an offset of `amount` with these sides, checked at once. */
        const offset = async (
          n: Tx,
          amount: number,
          sides: { receivableId: string; amountCents: number }[],
        ) => {
          const [made] = await n
            .insert(receivableOffsetsTable)
            .values({
              contactId: sam.id,
              amountCents: amount,
              offsetOn: '2026-10-20',
            })
            .returning()
          await n.insert(receivablePaymentsTable).values(
            sides.map((side) => ({
              ...side,
              paidOn: '2026-10-20',
              offsetId: made.id,
            })),
          )
          await n.execute(sql`set constraints all immediate`)
          return made
        }
        const offsetRefused = async (
          constraint: string,
          amount: number,
          sides: { receivableId: string; amountCents: number }[],
        ) => {
          await refused(tx, constraint, (n) => offset(n, amount, sides))
          await tx.execute(sql`set constraints all deferred`)
        }

        await refused(tx, 'receivable_offsets_amount_positive', (n) =>
          n.insert(receivableOffsetsTable).values({
            contactId: sam.id,
            amountCents: 0,
            offsetOn: '2026-10-20',
          }),
        )
        // One side only, two amounts, or another contact's item.
        await offsetRefused('receivable_offsets_balanced', 300, [
          { receivableId: owed.id, amountCents: 300 },
        ])
        await offsetRefused('receivable_offsets_balanced', 300, [
          { receivableId: owed.id, amountCents: 300 },
          { receivableId: owe.id, amountCents: 200 },
        ])
        await offsetRefused('receivable_offsets_balanced', 300, [
          { receivableId: owed.id, amountCents: 300 },
          { receivableId: oweLea.id, amountCents: 300 },
        ])
        // Never past what is left: 400 owed to the owner.
        await offsetRefused('receivables_settled_within_share', 450, [
          { receivableId: owed.id, amountCents: 450 },
          { receivableId: owe.id, amountCents: 450 },
        ])
        // An offset's repayment has no transfer.
        await refused(
          tx,
          'receivable_payments_offset_without_transaction',
          (n) =>
            n.insert(receivablePaymentsTable).values({
              receivableId: owed.id,
              transactionId: paid.id,
              amountCents: 100,
              paidOn: '2026-10-20',
              offsetId: '00000000-0000-4000-8000-000000000099',
            }),
        )

        const made = await offset(tx, 400, [
          { receivableId: owed.id, amountCents: 400 },
          { receivableId: owe.id, amountCents: 400 },
        ])
        // One side can't be unlinked alone.
        await refused(tx, 'receivable_offsets_balanced', async (n) => {
          await n
            .delete(receivablePaymentsTable)
            .where(eq(receivablePaymentsTable.receivableId, owe.id))
          await n.execute(sql`set constraints all immediate`)
        })
        await tx.execute(sql`set constraints all deferred`)
        // Undone as one: both sides go with it.
        await tx
          .delete(receivableOffsetsTable)
          .where(eq(receivableOffsetsTable.id, made.id))
        await tx.execute(sql`set constraints all immediate`)
        const left = await tx
          .select()
          .from(receivablePaymentsTable)
          .where(eq(receivablePaymentsTable.offsetId, made.id))
        expect(left).toEqual([])
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

  describe('dashboard layout (#495)', () => {
    async function widget(
      tx: Tx,
      values: Partial<typeof dashboardWidgetsTable.$inferInsert> = {},
    ) {
      const [created] = await tx
        .insert(dashboardWidgetsTable)
        .values({ type: 'balances', position: 0, ...values })
        .returning()
      return created
    }

    it('takes each element once, at one place each, from 0', async () => {
      await inRollback(async (tx) => {
        await widget(tx)
        await refused(tx, 'dashboard_widgets_type_unique', (n) =>
          widget(n, { position: 1 }),
        )
        await refused(tx, 'dashboard_widgets_position_unique', (n) =>
          widget(n, { type: 'owed' }),
        )
        await refused(tx, 'dashboard_widgets_position_positive', (n) =>
          widget(n, { type: 'owed', position: -1 }),
        )
      })
    })

    it('keeps settings an object', async () => {
      await inRollback(async (tx) => {
        await refused(tx, 'dashboard_widgets_settings_object', (n) =>
          n.execute(
            sql`insert into dashboard_widgets (type, position, settings)
                values ('owed', 0, '[]'::jsonb)`,
          ),
        )
      })
    })

    it('chooses accounts only on the elements that show them, envelopes only on Enveloppes', async () => {
      await inRollback(async (tx) => {
        await refused(tx, 'dashboard_widgets_accounts_chosen_type', (n) =>
          widget(n, { type: 'owed', accountsChosen: true }),
        )
        await refused(tx, 'dashboard_widgets_envelopes_chosen_type', (n) =>
          widget(n, { envelopesChosen: true }),
        )
      })
    })

    it('names accounts and envelopes only while chosen ones are shown', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const [trip] = await tx
          .insert(envelopesTable)
          .values({ name: 'Voyage fictif' })
          .returning()
        const all = await widget(tx)
        const envelopes = await widget(tx, { type: 'envelopes', position: 1 })
        await refused(tx, 'dashboard_widget_accounts_chosen', (n) =>
          n
            .insert(dashboardWidgetAccountsTable)
            .values({ widgetId: all.id, accountId: checking.id, position: 0 }),
        )
        await refused(tx, 'dashboard_widget_envelopes_chosen', (n) =>
          n
            .insert(dashboardWidgetEnvelopesTable)
            .values({ widgetId: envelopes.id, envelopeId: trip.id }),
        )

        await tx
          .update(dashboardWidgetsTable)
          .set({ accountsChosen: true })
          .where(eq(dashboardWidgetsTable.id, all.id))
        await tx
          .insert(dashboardWidgetAccountsTable)
          .values({ widgetId: all.id, accountId: checking.id, position: 0 })
        // Back to « tous » without clearing them: refused.
        await refused(tx, 'dashboard_widget_accounts_chosen', (n) =>
          n
            .update(dashboardWidgetsTable)
            .set({ accountsChosen: false })
            .where(eq(dashboardWidgetsTable.id, all.id)),
        )
        // A deleted account leaves the element by itself.
        await tx.delete(accountsTable).where(eq(accountsTable.id, checking.id))
        const left = await tx
          .select()
          .from(dashboardWidgetAccountsTable)
          .where(eq(dashboardWidgetAccountsTable.widgetId, all.id))
        expect(left).toEqual([])
      })
    })

    it('gives each chosen account its own place, from 0', async () => {
      await inRollback(async (tx) => {
        const checking = await account(tx)
        const savings = await account(tx, {
          name: 'Livret fictif',
          type: 'savings',
        })
        const chosen = await widget(tx, { accountsChosen: true })
        await tx
          .insert(dashboardWidgetAccountsTable)
          .values({ widgetId: chosen.id, accountId: checking.id, position: 0 })
        await refused(tx, 'dashboard_widget_accounts_position_unique', (n) =>
          n.insert(dashboardWidgetAccountsTable).values({
            widgetId: chosen.id,
            accountId: savings.id,
            position: 0,
          }),
        )
        await refused(tx, 'dashboard_widget_accounts_position', (n) =>
          n.insert(dashboardWidgetAccountsTable).values({
            widgetId: chosen.id,
            accountId: savings.id,
            position: -1,
          }),
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
