import '#/load-env'
import { randomUUID } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import { CategorizationRulesService } from '#/categories/categorization-rules.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  cryptoHoldingsTable,
  cryptoImportsTable,
  cryptoMovementsTable,
  transactionsTable,
} from '#/database/schema'
import { knownAsset } from '#/imports/crypto/assets'
import { computeHoldings } from '#/imports/crypto/holdings'
import {
  linkNewCryptoTransfers,
  storeWithdrawalCosts,
} from '#/imports/crypto/movement-links'
import { MovementsService } from '#/investments/movements.service'
import type {
  AccountType,
  TransactionKind,
} from '#/database/schema/domain-enums'
import { InvestmentsService } from '#/investments/investments.service'
import { TransactionsService } from '#/transactions/transactions.service'
import { linkMatchingTransfers } from './link-transfers'
import { bankRows } from '#/transactions/testing/bank-rows'

/**
 * Transfers linked to the owner's other accounts (#296), against the test
 * database, each test in a rolled-back transaction. Synthetic data only: two
 * cash accounts, a brokerage (PEA), a crypto exchange and a wallet.
 */

type Db = PostgresJsDatabase<typeof schema>
const ROLLBACK = Symbol('rollback')
const NOW = new Date('2026-11-05T10:00:00Z')

describe.skipIf(!process.env.DATABASE_URL)('transfer links (database)', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, { max: 1 })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  interface Fixture {
    tx: Db
    accounts: AccountsService
    transactions: TransactionsService
    rules: CategorizationRulesService
    investments: InvestmentsService
    ids: Record<'checking' | 'livret' | 'pea' | 'exchange' | 'wallet', string>
    transferCategory: string
    expenseCategory: string
    row: (
      accountId: string,
      bookingDate: string,
      amountCents: number,
      options?: {
        kind?: TransactionKind
        counterpartAccountId?: string | null
        rawLabel?: string
      },
    ) => Promise<string>
    counterpart: (id: string) => Promise<string | null>
  }

  async function inRollback(fn: (f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        const database = { db: tx } as never
        const accounts = new AccountsService(database)
        const transactions = new TransactionsService(database)
        const rules = new CategorizationRulesService(database)
        const investments = new InvestmentsService(database, accounts)
        const account = async (type: AccountType, name: string) =>
          (await accounts.create({ name, type, institution: 'Test bank' })).id
        const ids = {
          checking: await account('checking', 'Test checking'),
          livret: await account('savings', 'Test livret'),
          pea: await account('brokerage', 'Test PEA'),
          exchange: await account('crypto', 'Test exchange'),
          wallet: await account('crypto', 'Test wallet'),
        }
        const category = async (kind: TransactionKind) => {
          const [created] = await tx
            .insert(categoriesTable)
            .values({
              slug: `test-${kind}-${randomUUID().slice(0, 8)}`,
              name: `Test ${kind}`,
              kind,
            })
            .returning({ id: categoriesTable.id })
          return created.id
        }
        const transferCategory = await category('transfer')
        const expenseCategory = await category('expense')
        const row: Fixture['row'] = async (
          accountId,
          bookingDate,
          amountCents,
          options = {},
        ) => {
          const [created] = await tx
            .insert(transactionsTable)
            .values(
              await bankRows(tx, {
                accountId,
                bookingDate,
                amountCents,
                rawLabel: options.rawLabel ?? 'VIR TEST',
                kind: options.kind ?? 'transfer',
                counterpartAccountId: options.counterpartAccountId ?? null,
                dedupeHash: randomUUID().replaceAll('-', ''),
              }),
            )
            .returning({ id: transactionsTable.id })
          return created.id
        }
        const counterpart = async (id: string) => {
          const [found] = await tx
            .select({ c: transactionsTable.counterpartAccountId })
            .from(transactionsTable)
            .where(eq(transactionsTable.id, id))
          return found.c
        }
        await fn({
          tx: tx as unknown as Db,
          accounts,
          transactions,
          rules,
          investments,
          ids,
          transferCategory,
          expenseCategory,
          row,
          counterpart,
        })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  it('links both sides of a transfer between two cash accounts', async () => {
    await inRollback(async ({ tx, ids, row, counterpart }) => {
      const out = await row(ids.checking, '2026-10-01', -300_00)
      const arrival = await row(ids.livret, '2026-10-02', 300_00)
      const expense = await row(ids.livret, '2026-10-02', 300_00, {
        kind: 'income',
      })
      const far = await row(ids.livret, '2026-10-20', -300_00)

      expect(await linkMatchingTransfers(tx, [out, far, expense])).toBe(1)
      expect(await counterpart(out)).toBe(ids.livret)
      expect(await counterpart(arrival)).toBe(ids.checking)
      expect(await counterpart(expense)).toBeNull()
      expect(await counterpart(far)).toBeNull()

      // Already linked rows are left alone.
      expect(await linkMatchingTransfers(tx, [out, arrival])).toBe(0)
    })
  })

  it('links a transfer by hand and unlinks it when it stops being one', async () => {
    await inRollback(async ({ transactions, ids, row }) => {
      const id = await row(ids.checking, '2026-10-05', -500_00)
      const linked = await transactions.update(id, {
        counterpartAccountId: ids.pea,
      })
      expect(linked.counterpartAccountId).toBe(ids.pea)
      expect(linked.counterpartAccountName).toBe('Test PEA')

      await expect(
        transactions.update(id, { counterpartAccountId: ids.checking }),
      ).rejects.toBeInstanceOf(BadRequestException)

      const expense = await row(ids.checking, '2026-10-05', -20_00, {
        kind: 'expense',
      })
      await expect(
        transactions.update(expense, { counterpartAccountId: ids.pea }),
      ).rejects.toBeInstanceOf(BadRequestException)
      // Unless it becomes a transfer in the same change.
      const nowTransfer = await transactions.update(expense, {
        kind: 'transfer',
        counterpartAccountId: ids.pea,
      })
      expect(nowTransfer.counterpartAccountId).toBe(ids.pea)

      const asExpense = await transactions.update(id, { kind: 'expense' })
      expect(asExpense.counterpartAccountId).toBeNull()

      const listed = await transactions.list({
        counterpartAccountId: ids.pea,
      })
      expect(listed.items.map((item) => item.id)).toEqual([expense])
    })
  })

  it('sets a rule’s destination on the transfers it files', async () => {
    await inRollback(
      async ({
        rules,
        ids,
        row,
        counterpart,
        transferCategory,
        expenseCategory,
      }) => {
        await expect(
          rules.create({
            labelPattern: 'TESTBROKER',
            categoryId: expenseCategory,
            counterpartAccountId: ids.pea,
          }),
        ).rejects.toBeInstanceOf(BadRequestException)

        await rules.create({
          labelPattern: 'TESTBROKER',
          categoryId: transferCategory,
          counterpartAccountId: ids.pea,
        })
        const toBroker = await row(ids.checking, '2026-10-07', -1_000_00, {
          kind: 'expense',
          rawLabel: 'VIR TESTBROKER PEA',
        })
        const handLinked = await row(ids.checking, '2026-10-08', -50_00, {
          rawLabel: 'VIR TESTBROKER',
          counterpartAccountId: ids.livret,
        })
        await rules.apply()
        expect(await counterpart(toBroker)).toBe(ids.pea)
        // A link set earlier is kept.
        expect(await counterpart(handLinked)).toBe(ids.livret)
      },
    )
  })

  it('derives the contributions of an investment account from its transfers', async () => {
    await inRollback(async ({ investments, transactions, ids, row }) => {
      await investments.upsert(
        ids.pea,
        '2026-06-30',
        { valueCents: 4_000_00, contributionsCents: 3_800_00 },
        NOW,
      )
      await investments.upsert(
        ids.pea,
        '2026-10-31',
        { valueCents: 5_600_00, contributionsCents: 9_999_00 },
        NOW,
      )
      await row(ids.checking, '2026-07-03', -1_000_00, {
        counterpartAccountId: ids.pea,
      })
      await row(ids.checking, '2026-09-03', -1_000_00, {
        counterpartAccountId: ids.pea,
      })
      // Money back from the PEA.
      await row(ids.checking, '2026-10-15', 500_00, {
        counterpartAccountId: ids.pea,
      })
      // After the latest value: not in it yet.
      await row(ids.checking, '2026-11-02', -200_00, {
        counterpartAccountId: ids.pea,
      })
      // A transfer to the exchange: crypto keeps its holdings' cost basis.
      await row(ids.checking, '2026-10-10', -700_00, {
        counterpartAccountId: ids.exchange,
      })

      const performance = await investments.performance(ids.pea, NOW)
      expect(performance.contributionsSource).toBe('links')
      // 3 800 typed on 30 June + 1 000 + 1 000 − 500.
      expect(performance.contributionsCents).toBe(5_300_00)
      expect(performance.gainCents).toBe(300_00)
      expect(performance.typedContributionsCents).toBe(9_999_00)
      expect(performance.linkedTransfersCount).toBe(4)
      expect(performance.linkedAfterValueCents).toBe(200_00)
      expect(
        performance.contributionsHistory.map((p) => p.contributionsCents),
      ).toEqual([3_800_00, 5_300_00])

      const summary = await investments.summary(NOW)
      const pea = summary.accounts.find((a) => a.id === ids.pea)!
      expect(pea.contributionsCents).toBe(5_300_00)
      const exchange = summary.accounts.find((a) => a.id === ids.exchange)!
      expect(exchange.linkedTransfersCount).toBe(0)

      const flows = await investments.flows('2026-07-01', '2026-11-05')
      expect(flows.depositsCents).toBe(2_900_00)
      expect(flows.withdrawalsCents).toBe(500_00)
      expect(flows.accounts.map((a) => [a.name, a.netCents])).toEqual([
        ['Test PEA', 1_700_00],
        ['Test exchange', 700_00],
      ])
      expect(flows.months.map((m) => [m.month, m.netCents])).toEqual([
        ['2026-11', 200_00],
        ['2026-10', 200_00],
        ['2026-09', 1_000_00],
        ['2026-07', 1_000_00],
      ])

      // Linked transfers stay transfers: never income or expense.
      const totals = await transactions.summary({ accountId: ids.checking })
      expect(totals.incomeCents).toBe(0)
      expect(totals.expenseCents).toBe(0)
      expect(totals.transferCount).toBe(5)
    })
  })

  it('follows the coins from the exchange to the wallet, at their average cost', async () => {
    await inRollback(async ({ tx, ids, row, investments }) => {
      const movements = new MovementsService({ db: tx } as never)
      // Bank → exchange: two transfers of 500 €.
      await row(ids.checking, '2026-09-01', -500_00, {
        counterpartAccountId: ids.exchange,
      })
      await row(ids.checking, '2026-10-01', -500_00, {
        counterpartAccountId: ids.exchange,
      })
      const [cryptoImport] = await tx
        .insert(cryptoImportsTable)
        .values({
          accountId: ids.exchange,
          format: 'binance_csv',
          fileName: 'test.csv',
          fileHash: 'f'.repeat(64),
          preview: {} as never,
          committedAt: NOW,
        })
        .returning()
      const line = (
        at: string,
        kind: 'buy' | 'withdrawal',
        asset: string,
        quantity: string,
      ) => ({
        accountId: ids.exchange,
        importId: cryptoImport.id,
        occurredAt: new Date(at),
        operation: kind,
        kind,
        asset,
        quantity,
        dedupeHash: randomUUID().replaceAll('-', ''),
      })
      // 0.02 BTC bought for 1 000 €, then half of it withdrawn.
      const written = await tx
        .insert(cryptoMovementsTable)
        .values([
          line('2026-09-02T10:00:00Z', 'buy', 'EUR', '-400'),
          line('2026-09-02T10:00:00Z', 'buy', 'BTC', '0.008'),
          line('2026-10-02T10:00:00Z', 'buy', 'EUR', '-600'),
          line('2026-10-02T10:00:00Z', 'buy', 'BTC', '0.012'),
          line('2026-10-20T23:30:00Z', 'withdrawal', 'BTC', '-0.01'),
        ])
        .returning()
      const costs = new Map<string, number | null>()
      const held = computeHoldings(
        written.map((m) => ({ ...m, occurredAt: m.occurredAt.toISOString() })),
        knownAsset,
        costs,
      )
      expect(held[0]).toMatchObject({ quantity: '0.01', investedCents: 500_00 })
      await storeWithdrawalCosts(tx, costs)

      // The wallet holds BTC: the withdrawal is linked to it.
      await tx.insert(cryptoHoldingsTable).values({
        accountId: ids.wallet,
        assetId: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        quantity: '0.01',
        location: 'Ledger',
        origin: 'manual',
      })
      const withdrawal = written.at(-1)!
      expect(
        await linkNewCryptoTransfers(
          tx,
          ids.exchange,
          written.map((m) => m.id),
          new Map([['BTC', knownAsset('BTC')!]]),
        ),
      ).toBe(1)

      await investments.upsert(
        ids.wallet,
        '2026-11-01',
        { valueCents: 650_00 },
        NOW,
      )
      const wallet = await investments.performance(ids.wallet, NOW)
      expect(wallet.contributionsSource).toBe('links')
      expect(wallet.contributionsCents).toBe(500_00)
      expect(wallet.gainCents).toBe(150_00)

      const listed = await movements.list('2026-09-01', '2026-11-05')
      expect(
        listed.items.map((m) => [
          m.date,
          m.source,
          m.from?.name,
          m.to?.name,
          m.amountCents,
          m.quantity,
        ]),
      ).toEqual([
        // 23:30 UTC on 20 October is the 21st in Paris.
        [
          '2026-10-21',
          'crypto',
          'Test exchange',
          'Test wallet',
          500_00,
          '0.010000000000000000',
        ],
        ['2026-10-01', 'bank', 'Test checking', 'Test exchange', 500_00, null],
        ['2026-09-01', 'bank', 'Test checking', 'Test exchange', 500_00, null],
      ])
      const ofWallet = await movements.list(
        '2026-09-01',
        '2026-11-05',
        ids.wallet,
      )
      expect(ofWallet.items).toHaveLength(1)

      // Unlinked by hand: the wallet's contributions are unknown again.
      const unlinked = await movements.linkCrypto(withdrawal.id, null)
      expect(unlinked.to).toBeNull()
      expect(
        (await investments.performance(ids.wallet, NOW)).contributionsCents,
      ).toBeNull()
      await expect(
        movements.linkCrypto(withdrawal.id, ids.checking),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        movements.linkCrypto(written[0].id, ids.wallet),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  it('unlinks the other side when an account is deleted (#297)', async () => {
    await inRollback(async ({ accounts, tx, ids, row, counterpart }) => {
      const out = await row(ids.checking, '2026-10-01', -300_00)
      await row(ids.livret, '2026-10-01', 300_00)
      expect(await linkMatchingTransfers(tx, [out])).toBe(1)
      await accounts.remove(ids.livret)
      expect(await counterpart(out)).toBeNull()
    })
  })

  it('unlinks the transfers of a deleted account', async () => {
    await inRollback(async ({ tx, ids, row, counterpart }) => {
      const id = await row(ids.checking, '2026-10-05', -100_00, {
        counterpartAccountId: ids.wallet,
      })
      await tx.delete(accountsTable).where(eq(accountsTable.id, ids.wallet))
      expect(await counterpart(id)).toBeNull()
    })
  })
})
