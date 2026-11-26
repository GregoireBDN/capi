import '#/load-env'
import { NotFoundException } from '@nestjs/common'
import { eq, inArray } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dataUntilByAccount } from '#/coverage/coverage'
import * as schema from '#/database/schema'
import {
  accountsTable,
  balanceSnapshotsTable,
  budgetsTable,
  categoriesTable,
  categorizationRulesTable,
  contactsTable,
  cryptoHoldingsTable,
  cryptoImportsTable,
  cryptoMovementsTable,
  cryptoWalletKeysTable,
  importsTable,
  type InsertTransaction,
  monthClosesTable,
  receivablePaymentsTable,
  receivablesTable,
  recurringItemsTable,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'
import { AccountsService } from './accounts.service'
import { bankRows } from '#/transactions/testing/bank-rows'

/**
 * Deleting an account (#297) against the migrated test database. Every test
 * runs in a transaction that is rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const NOW = new Date('2019-04-10T10:00:00Z')

describe.skipIf(!process.env.DATABASE_URL)('AccountsService.remove', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, { max: 1 })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  async function inRollback(
    fn: (f: { tx: Tx; service: AccountsService }) => Promise<void>,
  ) {
    await db
      .transaction(async (tx) => {
        await fn({ tx, service: new AccountsService({ db: tx } as never) })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  let hash = 0
  function row(
    accountId: string,
    overrides: Partial<InsertTransaction> = {},
  ): InsertTransaction {
    hash++
    return {
      accountId,
      bookingDate: '2019-03-05',
      amountCents: -2_500,
      rawLabel: 'PAIEMENT CB 0503 VILLE-TEST FAUX MAGASIN',
      kind: 'expense',
      dedupeHash: `delete-account-test-${hash}`,
      ...overrides,
    }
  }

  /** A checking account with every kind of data, and a second one beside it. */
  async function seed(tx: Tx, service: AccountsService) {
    const doomed = await service.create({
      name: 'Compte test à supprimer',
      type: 'checking',
    })
    const kept = await service.create({
      name: 'Compte test gardé',
      type: 'checking',
    })
    const [groceries, outings] = await tx
      .insert(categoriesTable)
      .values([
        {
          slug: 'delete_test_groceries',
          name: 'Courses test',
          kind: 'expense',
        },
        { slug: 'delete_test_outings', name: 'Sorties test', kind: 'expense' },
      ])
      .returning()
    await tx.insert(budgetsTable).values({
      categoryId: groceries.id,
      effectiveFrom: '2019-03-01',
      monthlyTargetCents: 30_000,
    })

    for (const account of [doomed, kept]) {
      const [imported] = await tx
        .insert(importsTable)
        .values({
          accountId: account.id,
          source: 'cic_csv',
          fileName: 'releve-exemple.csv',
          fileHash: `${account.id.replaceAll('-', '')}`.padEnd(64, '0'),
          periodStart: '2019-03-01',
          periodEnd: '2019-03-20',
          committedAt: new Date('2019-03-20T18:00:00Z'),
        })
        .returning()
      const [split] = await tx
        .insert(transactionsTable)
        .values(
          await bankRows(tx, [
            row(account.id, {
              importId: imported.id,
              categoryId: groceries.id,
            }),
            row(account.id, {
              importId: imported.id,
              bookingDate: '2019-03-12',
            }),
            row(account.id, {
              manual: true,
              bookingDate: '2019-03-25',
              dedupeHash: `manual:${account.id}`,
            }),
          ]),
        )
        .returning()
      await tx.insert(transactionSplitsTable).values([
        {
          transactionId: split.id,
          categoryId: groceries.id,
          amountCents: -1_500,
          position: 0,
        },
        {
          transactionId: split.id,
          categoryId: outings.id,
          amountCents: -1_000,
          position: 1,
        },
      ])
      await tx.insert(balanceSnapshotsTable).values({
        accountId: account.id,
        date: '2019-02-28',
        valueCents: 100_000,
      })
      await tx.insert(recurringItemsTable).values({
        accountId: account.id,
        merchantKey: 'TEST STREAMING',
        direction: 'debit',
        name: 'Test streaming',
        status: 'confirmed',
        isFixedCost: true,
        cadence: 'monthly',
        amountType: 'fixed',
        typicalAmountCents: 999,
        confidence: 0.9,
        lastSeenDate: '2019-03-05',
      })
    }

    await tx.insert(categorizationRulesTable).values({
      position: 10_000,
      labelPattern: 'faux magasin',
      accountId: doomed.id,
      categoryId: groceries.id,
    })
    await tx.insert(monthClosesTable).values({
      month: '2019-03',
      closedAt: new Date('2019-04-02T10:00:00Z'),
      report: { synthetic: true } as never,
      reportVersion: 1,
    })
    return { doomed, kept, groceries }
  }

  /** Every row of `accountId` in the tables an account owns. */
  async function rowsOf(tx: Tx, accountId: string) {
    const transactions = await tx
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(eq(transactionsTable.accountId, accountId))
    const count = async (
      table:
        | typeof importsTable
        | typeof balanceSnapshotsTable
        | typeof recurringItemsTable
        | typeof categorizationRulesTable
        | typeof cryptoHoldingsTable
        | typeof cryptoWalletKeysTable
        | typeof cryptoImportsTable
        | typeof cryptoMovementsTable,
    ) =>
      (await tx.select().from(table).where(eq(table.accountId, accountId)))
        .length
    return {
      transactions: transactions.length,
      splits: transactions.length
        ? (
            await tx
              .select()
              .from(transactionSplitsTable)
              .where(
                inArray(
                  transactionSplitsTable.transactionId,
                  transactions.map((t) => t.id),
                ),
              )
          ).length
        : 0,
      imports: await count(importsTable),
      snapshots: await count(balanceSnapshotsTable),
      recurring: await count(recurringItemsTable),
      rules: await count(categorizationRulesTable),
      holdings: await count(cryptoHoldingsTable),
      walletKeys: await count(cryptoWalletKeysTable),
      cryptoImports: await count(cryptoImportsTable),
      movements: await count(cryptoMovementsTable),
    }
  }

  it('counts what deleting the account removes', async () => {
    await inRollback(async ({ tx, service }) => {
      const { doomed } = await seed(tx, service)
      await expect(service.deletionPreview(doomed.id)).resolves.toEqual({
        transactions: 3,
        imports: 1,
        snapshots: 1,
        cryptoHoldings: 0,
        positionStatements: 0,
        dividends: 0,
        walletKeys: 0,
        recurringItems: 1,
        rules: 1,
        envelopeMovements: 0,
        closedMonths: 1,
      })
    })
  })

  it('deletes everything of the account and nothing else', async () => {
    await inRollback(async ({ tx, service }) => {
      const { doomed, kept, groceries } = await seed(tx, service)
      const keptBefore = await rowsOf(tx, kept.id)
      const coverageBefore = await dataUntilByAccount(tx, NOW)
      const budgetsBefore = await tx.select().from(budgetsTable)
      const keptAccountBefore = await service.findOne(kept.id)

      await service.remove(doomed.id)

      expect(await rowsOf(tx, doomed.id)).toEqual({
        transactions: 0,
        splits: 0,
        imports: 0,
        snapshots: 0,
        recurring: 0,
        rules: 0,
        holdings: 0,
        walletKeys: 0,
        cryptoImports: 0,
        movements: 0,
      })
      await expect(service.findOne(doomed.id)).rejects.toThrow(
        NotFoundException,
      )
      // The other account, its coverage, the budgets, categories and the
      // closed month are untouched.
      expect(await rowsOf(tx, kept.id)).toEqual(keptBefore)
      expect(keptBefore).toMatchObject({ transactions: 3, splits: 2 })
      expect(await service.findOne(kept.id)).toEqual(keptAccountBefore)
      const coverageAfter = await dataUntilByAccount(tx, NOW)
      expect(coverageAfter.get(kept.id)).toBe(coverageBefore.get(kept.id))
      expect(coverageAfter.has(doomed.id)).toBe(false)
      expect(await tx.select().from(budgetsTable)).toEqual(budgetsBefore)
      expect(
        await tx
          .select({ id: categoriesTable.id })
          .from(categoriesTable)
          .where(eq(categoriesTable.id, groceries.id)),
      ).toHaveLength(1)
      const [march] = await tx
        .select()
        .from(monthClosesTable)
        .where(eq(monthClosesTable.month, '2019-03'))
      expect(march.report).toEqual({ synthetic: true })
    })
  })

  it('deletes a crypto account with its holdings, keys and exchange imports', async () => {
    await inRollback(async ({ tx, service }) => {
      // An exchange's imports go into an exchange account (#426).
      const wallet = await service.create({
        name: 'Wallet test',
        type: 'crypto',
        cryptoSource: 'exchange',
        cryptoProvider: 'binance',
      })
      await tx.insert(cryptoHoldingsTable).values({
        accountId: wallet.id,
        assetId: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        quantity: '0.5',
      })
      await tx.insert(cryptoWalletKeysTable).values({
        accountId: wallet.id,
        family: 'evm',
        publicKey: '0x000000000000000000000000000000000000dEaD',
        chains: ['ethereum'],
      })
      const [imported] = await tx
        .insert(cryptoImportsTable)
        .values({
          accountId: wallet.id,
          format: 'binance_csv',
          fileName: 'export-exemple.csv',
          fileHash: 'c'.repeat(64),
          preview: {} as never,
        })
        .returning()
      await tx.insert(cryptoMovementsTable).values({
        accountId: wallet.id,
        importId: imported.id,
        occurredAt: new Date('2019-03-01T10:00:00Z'),
        operation: 'Buy',
        kind: 'buy',
        asset: 'BTC',
        quantity: '0.5',
        dedupeHash: 'delete-account-crypto-1',
      })
      await tx.insert(balanceSnapshotsTable).values({
        accountId: wallet.id,
        date: '2019-03-31',
        valueCents: 1_000_000,
        source: 'computed',
      })

      await expect(service.deletionPreview(wallet.id)).resolves.toMatchObject({
        imports: 1,
        snapshots: 1,
        cryptoHoldings: 1,
        positionStatements: 0,
        dividends: 0,
        walletKeys: 1,
      })
      await service.remove(wallet.id)

      expect(await rowsOf(tx, wallet.id)).toMatchObject({
        snapshots: 0,
        holdings: 0,
        walletKeys: 0,
        cryptoImports: 0,
        movements: 0,
      })
      expect(
        await tx
          .select()
          .from(accountsTable)
          .where(eq(accountsTable.id, wallet.id)),
      ).toEqual([])
    })
  })

  it('deletes the shares on its expenses with their repayments, even from another account (#438)', async () => {
    await inRollback(async ({ tx, service }) => {
      const doomed = await service.create({
        name: 'Compte test à supprimer',
        type: 'checking',
      })
      const kept = await service.create({
        name: 'Compte test gardé',
        type: 'checking',
      })
      const [dinner, transfer] = await tx
        .insert(transactionsTable)
        .values(
          await bankRows(tx, [
            row(doomed.id, { amountCents: -9_000 }),
            row(kept.id, {
              amountCents: 2_000,
              kind: 'income',
              rawLabel: 'VIR CONTACT FICTIF',
            }),
          ]),
        )
        .returning()
      const [sam] = await tx
        .insert(contactsTable)
        .values({ name: 'Contact test' })
        .returning()
      const [share] = await tx
        .insert(receivablesTable)
        .values({
          direction: 'owed_to_me',
          transactionId: dinner.id,
          contactId: sam.id,
          amountCents: 6_000,
        })
        .returning()
      await tx.insert(receivablePaymentsTable).values({
        receivableId: share.id,
        transactionId: transfer.id,
        amountCents: 2_000,
        paidOn: '2019-03-06',
      })

      await service.remove(doomed.id)
      expect(await tx.select().from(receivablesTable)).toEqual([])
      expect(await tx.select().from(receivablePaymentsTable)).toEqual([])
      const [left] = await tx
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, transfer.id))
      expect(left.amountCents).toBe(2_000)
    })
  })

  it('answers 404 for an unknown account', async () => {
    await inRollback(async ({ service }) => {
      const unknown = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'
      await expect(service.remove(unknown)).rejects.toThrow(NotFoundException)
      await expect(service.deletionPreview(unknown)).rejects.toThrow(
        NotFoundException,
      )
    })
  })
})
