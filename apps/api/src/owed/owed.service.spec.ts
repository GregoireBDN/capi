import '#/load-env'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BudgetsService } from '#/budgets/budgets.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  importsTable,
  receivablesTable,
  recurringItemsTable,
  transactionsTable,
} from '#/database/schema'
import { normalizeLabel } from '#/imports/normalize/label'
import { RecurringService } from '#/recurring/recurring.service'
import { ManualTransactionsService } from '#/transactions/manual-transactions.service'
import { TransactionsService } from '#/transactions/transactions.service'
import { OwedService } from './owed.service'
import { applyRecurringShares } from './recurring-shares'

/**
 * Money owed (#359) against the migrated test database: the counting rule
 * read through `transaction_lines`, repayments, letting a debt go, shared
 * recurring items and « Quelqu’un a payé pour moi ». Every test runs in a transaction
 * that is rolled back. Synthetic names, labels and amounts only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const NOW = new Date('2026-10-31T11:00:00Z')
const RENT_LABEL = 'PRLV SEPA AGENCE FICTIVE LOYER'

interface Fixture {
  tx: Tx
  owed: OwedService
  transactions: TransactionsService
  manual: ManualTransactionsService
  budgets: BudgetsService
  accountId: string
  restaurants: string
  housing: string
  energy: string
  misc: string
  refunds: string
  /** Inserts a bank row; returns its id. */
  row: (
    date: string,
    amountCents: number,
    label: string,
    categoryId: string,
    extra?: Partial<typeof transactionsTable.$inferInsert>,
  ) => Promise<string>
  /** Money out of a category in a month, positive cents (the owner's part). */
  spent: (categoryId: string, month?: string) => Promise<number>
  /** Income of a month, every category. */
  income: (month?: string) => Promise<number>
}

describe.skipIf(!process.env.DATABASE_URL)('OwedService (database)', () => {
  let client: postgres.Sql
  let db: Db

  beforeAll(() => {
    client = postgres(process.env.DATABASE_URL!, { max: 1 })
    db = drizzle(client, { schema })
  })

  afterAll(async () => {
    await client.end()
  })

  async function withFixture(fn: (f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        const [account] = await tx
          .insert(accountsTable)
          .values({ name: 'Owed checking', type: 'checking' })
          .returning()
        // Bank rows come from an import (#367).
        const [bankImport] = await tx
          .insert(importsTable)
          .values({
            accountId: account.id,
            source: 'cic_csv',
            fileName: 'releve-fictif.csv',
            fileHash: 'fixture',
            committedAt: new Date('2026-10-31T09:00:00Z'),
          })
          .returning()
        const [restaurants, housing, energy, misc, refunds] = await tx
          .insert(categoriesTable)
          .values([
            { slug: 'owed_restaurants', name: 'Restaurants', kind: 'expense' },
            { slug: 'owed_housing', name: 'Logement', kind: 'expense' },
            { slug: 'owed_energy', name: 'Énergie', kind: 'expense' },
            { slug: 'owed_misc', name: 'Divers', kind: 'expense' },
            { slug: 'owed_refunds', name: 'Remboursés', kind: 'income' },
          ])
          .returning()
        const database = { db: tx } as never
        const transactions = new TransactionsService(database)
        const recurring = new RecurringService(database)
        const owed = new OwedService(database, transactions, recurring)
        await fn({
          tx,
          owed,
          transactions,
          manual: new ManualTransactionsService(database, transactions),
          budgets: new BudgetsService(database),
          accountId: account.id,
          restaurants: restaurants.id,
          housing: housing.id,
          energy: energy.id,
          misc: misc.id,
          refunds: refunds.id,
          row: async (date, amountCents, label, categoryId, extra = {}) => {
            const [category] = await tx
              .select({ kind: categoriesTable.kind })
              .from(categoriesTable)
              .where(eq(categoriesTable.id, categoryId))
            const [inserted] = await tx
              .insert(transactionsTable)
              .values({
                accountId: account.id,
                importId: bankImport.id,
                bookingDate: date,
                amountCents,
                rawLabel: label,
                kind: category.kind,
                categoryId,
                dedupeHash: randomUUID().replace(/-/g, ''),
                ...extra,
              })
              .returning({ id: transactionsTable.id })
            return inserted.id
          },
          spent: async (categoryId, month = '2026-10') =>
            0 -
            (await transactions.summary({ month, categoryId })).expenseCents,
          income: async (month = '2026-10') =>
            (await transactions.summary({ month })).incomeCents,
        })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  it('counts the owner’s part, repayments as neither income nor spending, and a debt let go back in (the issue’s example)', async () => {
    await withFixture(
      async ({ owed, row, spent, income, restaurants, housing, refunds }) => {
        const dinner = await row(
          '2026-10-10',
          -9_000,
          'CB PIZZERIA FICTIVE',
          restaurants,
        )
        const rent = await row('2026-10-01', -80_000, RENT_LABEL, housing)
        await owed.createShares({
          transactionId: dinner,
          shares: [
            { contactName: 'Alex', amountCents: 3_000 },
            { contactName: 'Sam', amountCents: 3_000 },
          ],
        })
        const shared = await owed.createShares({
          transactionId: rent,
          shares: [{ contactName: 'Camille', amountCents: 40_000 }],
        })
        expect(shared.shares).toMatchObject([
          { contactName: 'Camille', amountCents: 40_000, state: 'open' },
        ])

        const fromAlex = await row(
          '2026-10-15',
          3_000,
          'VIR ALEX FICTIF',
          refunds,
        )
        const fromCamille = await row(
          '2026-10-20',
          40_000,
          'VIR CAMILLE FICTIVE',
          refunds,
        )
        const summaryBefore = await owed.summary(NOW)
        const id = (name: string, list = summaryBefore.owedToMe.contacts) =>
          list.find((c) => c.name === name)!
        const alexItem = (await owed.contactOwed(id('Alex').contactId, NOW))
          .owedToMe.open[0]
        const camilleItem = (
          await owed.contactOwed(id('Camille').contactId, NOW)
        ).owedToMe.open[0]
        await owed.linkRepayment(
          {
            transactionId: fromAlex,
            items: [{ receivableId: alexItem.id, amountCents: 3_000 }],
          },
          NOW,
        )
        await owed.linkRepayment(
          {
            transactionId: fromCamille,
            items: [{ receivableId: camilleItem.id, amountCents: 40_000 }],
          },
          NOW,
        )

        expect(await spent(restaurants)).toBe(3_000)
        expect(await spent(housing)).toBe(40_000)
        expect(await income()).toBe(0)

        const summary = await owed.summary(NOW)
        expect(summary.owedToMe.totalCents).toBe(3_000)
        expect(
          summary.owedToMe.contacts.map((c) => [c.name, c.owedCents]),
        ).toEqual([['Sam', 3_000]])
        expect(summary.owedToMe.settled.map((c) => c.name)).toEqual([
          'Alex',
          'Camille',
        ])

        const samId = id('Sam').contactId
        const samItem = (await owed.contactOwed(samId, NOW)).owedToMe.open[0]
        const forgiven = await owed.forgive(
          samItem.id,
          { note: 'tant pis' },
          NOW,
        )
        expect(forgiven).toMatchObject({ state: 'forgiven', leftCents: 0 })
        expect(await spent(restaurants)).toBe(6_000)
        expect((await owed.summary(NOW)).owedToMe.totalCents).toBe(0)
        const sam = await owed.contactOwed(samId, NOW)
        expect(sam.owedToMe.open).toEqual([])
        expect(sam.owedToMe.history).toMatchObject([
          { state: 'forgiven', amountCents: 3_000, forgivenNote: 'tant pis' },
        ])
        expect(sam.owedToMe.totals).toMatchObject({
          totalCents: 3_000,
          forgivenCents: 3_000,
          openCents: 0,
        })

        // « Réclamer à nouveau »: back to his part.
        await owed.unforgive(samItem.id)
        expect(await spent(restaurants)).toBe(3_000)
        expect((await owed.summary(NOW)).owedToMe.totalCents).toBe(3_000)
      },
    )
  })

  it('settles several items with one transfer, partly, and leaves the rest of a larger transfer in its category', async () => {
    await withFixture(
      async ({ owed, row, spent, income, housing, energy, refunds }) => {
        const rent = await row('2026-10-01', -80_000, RENT_LABEL, housing)
        const power = await row(
          '2026-10-03',
          -12_000,
          'PRLV ENERGIE FICTIVE',
          energy,
        )
        await owed.createShares({
          transactionId: rent,
          shares: [{ contactName: 'Camille', amountCents: 40_000 }],
        })
        await owed.createShares({
          transactionId: power,
          shares: [{ contactName: 'Camille', amountCents: 6_000 }],
        })
        const transfer = await row('2026-10-20', 30_000, 'VIR CAMILLE', refunds)
        const options = await owed.repaymentOptions(transfer)
        expect(options).toMatchObject({
          direction: 'owed_to_me',
          amountCents: 30_000,
          availableCents: 30_000,
        })
        const [rentItem, energyItem] = options.items
        expect(rentItem.amountCents).toBe(40_000)

        // 300 € for the rent: 100 € + 60 € still owed, both listed.
        await owed.linkRepayment(
          {
            transactionId: transfer,
            items: [{ receivableId: rentItem.id, amountCents: 30_000 }],
          },
          NOW,
        )
        const camille = await owed.contactOwed(rentItem.contactId, NOW)
        expect(camille.owedToMe.open.map((i) => i.leftCents)).toEqual([
          10_000, 6_000,
        ])

        // A 500 € transfer for the rest (160 €): 340 € stay income.
        const bigger = await row('2026-10-25', 50_000, 'VIR CAMILLE', refunds)
        const suggested = await owed.repaymentOptions(bigger)
        expect(suggested.suggestion).toEqual([
          { receivableId: rentItem.id, amountCents: 10_000 },
          { receivableId: energyItem.id, amountCents: 6_000 },
        ])
        const result = await owed.linkRepayment(
          { transactionId: bigger, items: suggested.suggestion },
          NOW,
        )
        expect(result).toMatchObject({ linkedCents: 16_000, restCents: 34_000 })
        expect(await income()).toBe(34_000)
        expect(await spent(housing)).toBe(40_000)
        expect(await spent(energy)).toBe(6_000)
        expect((await owed.summary(NOW)).owedToMe.totalCents).toBe(0)
      },
    )
  })

  it('settles rent and energy with one 460 € transfer', async () => {
    await withFixture(
      async ({ owed, row, income, housing, energy, refunds }) => {
        const rent = await row('2026-10-01', -80_000, RENT_LABEL, housing)
        const power = await row('2026-10-03', -12_000, 'PRLV ENERGIE', energy)
        await owed.createShares({
          transactionId: rent,
          shares: [{ contactName: 'Camille', amountCents: 40_000 }],
        })
        await owed.createShares({
          transactionId: power,
          shares: [{ contactName: 'Camille', amountCents: 6_000 }],
        })
        const transfer = await row('2026-10-28', 46_000, 'VIR CAMILLE', refunds)
        const options = await owed.repaymentOptions(transfer)
        expect(options.exact).toBe(true)
        await owed.linkRepayment(
          { transactionId: transfer, items: options.suggestion },
          NOW,
        )
        const camille = await owed.contactOwed(options.contactId!, NOW)
        expect(camille.owedToMe.open).toEqual([])
        expect(camille.owedToMe.history.map((i) => i.state)).toEqual([
          'repaid',
          'repaid',
        ])
        expect(await income()).toBe(0)
      },
    )
  })

  it('refuses shares above the expense and repayments past the transfer or an item', async () => {
    await withFixture(async ({ owed, row, restaurants, refunds }) => {
      const dinner = await row('2026-10-10', -9_000, 'CB RESTO', restaurants)
      await expect(
        owed.createShares({
          transactionId: dinner,
          shares: [
            { contactName: 'Alex', amountCents: 5_000 },
            { contactName: 'Sam', amountCents: 5_000 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      await owed.createShares({
        transactionId: dinner,
        shares: [{ contactName: 'Alex', amountCents: 3_000 }],
      })
      await expect(
        owed.createShares({
          transactionId: dinner,
          shares: [{ contactName: 'alex', amountCents: 1_000 }],
        }),
      ).rejects.toBeInstanceOf(ConflictException)

      const [item] = (await owed.summary(NOW)).owedToMe.contacts
      const { owedToMe } = await owed.contactOwed(item.contactId, NOW)
      const small = await row('2026-10-15', 2_000, 'VIR ALEX', refunds)
      await expect(
        owed.linkRepayment(
          {
            transactionId: small,
            items: [{ receivableId: owedToMe.open[0].id, amountCents: 2_500 }],
          },
          NOW,
        ),
      ).rejects.toThrow('exceeds the transfer')
      const big = await row('2026-10-16', 9_000, 'VIR ALEX', refunds)
      await expect(
        owed.linkRepayment(
          {
            transactionId: big,
            items: [{ receivableId: owedToMe.open[0].id, amountCents: 3_500 }],
          },
          NOW,
        ),
      ).rejects.toThrow('exceeds what is left')
      // Money out cannot repay what is owed to the owner.
      await expect(
        owed.linkRepayment(
          {
            transactionId: dinner,
            items: [{ receivableId: owedToMe.open[0].id, amountCents: 1_000 }],
          },
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  it('« Quelqu’un a payé pour moi »: the owner’s part is his spending on the day, his repayment neither spending nor income, and a debt let go leaves his spending', async () => {
    await withFixture(
      async ({ owed, row, spent, income, restaurants, misc }) => {
        const debt = await owed.createDebt(
          {
            contactName: 'Sam',
            billCents: 9_000,
            partCents: 3_000,
            categoryId: restaurants,
            bookingDate: '2026-10-12',
          },
          NOW,
        )
        expect(debt).toMatchObject({
          accountId: null,
          paidByContactName: 'Sam',
          amountCents: -3_000,
          shares: [
            { direction: 'i_owe', amountCents: 3_000, billCents: 9_000 },
          ],
        })
        expect(await spent(restaurants)).toBe(3_000)
        const summary = await owed.summary(NOW)
        expect(summary.iOwe.contacts).toMatchObject([
          { name: 'Sam', owedCents: 3_000 },
        ])

        const toSam = await row('2026-10-20', -3_000, 'VIR SAM', misc)
        const options = await owed.repaymentOptions(toSam)
        expect(options).toMatchObject({ direction: 'i_owe', exact: true })
        await owed.linkRepayment(
          { transactionId: toSam, items: options.suggestion },
          NOW,
        )
        expect(await spent(restaurants)).toBe(3_000)
        expect(await spent(misc)).toBe(0)
        expect(await income()).toBe(0)
        expect((await owed.summary(NOW)).iOwe.totalCents).toBe(0)

        // Another one, which Sam lets go: it leaves the owner's spending.
        const second = await owed.createDebt(
          {
            contactName: 'Sam',
            billCents: 6_000,
            partCents: 2_000,
            categoryId: restaurants,
            bookingDate: '2026-10-22',
          },
          NOW,
        )
        expect(await spent(restaurants)).toBe(5_000)
        await owed.forgive(second.shares[0].id, {}, NOW)
        expect(await spent(restaurants)).toBe(3_000)
      },
    )
  })

  it('computes the parts of « Quelqu’un a payé pour moi » and refuses a part above the bill', async () => {
    await withFixture(async ({ owed, restaurants }) => {
      await expect(
        owed.createDebt(
          {
            contactName: 'Sam',
            billCents: 9_000,
            partCents: 9_001,
            categoryId: restaurants,
          },
          NOW,
        ),
      ).rejects.toThrow('partCents cannot exceed billCents')
    })
  })

  it('keeps the two lists apart: Sam owes 75 € and is owed 30 €', async () => {
    await withFixture(async ({ owed, row, restaurants }) => {
      const concert = await row(
        '2026-10-05',
        -15_000,
        'CB BILLETTERIE',
        restaurants,
      )
      await owed.createShares({
        transactionId: concert,
        shares: [{ contactName: 'Sam', amountCents: 7_500 }],
      })
      await owed.createDebt(
        {
          contactName: 'Sam',
          billCents: 9_000,
          partCents: 3_000,
          categoryId: restaurants,
          bookingDate: '2026-10-12',
        },
        NOW,
      )
      const summary = await owed.summary(NOW)
      expect(summary.owedToMe.contacts).toMatchObject([
        { name: 'Sam', owedCents: 7_500 },
      ])
      expect(summary.iOwe.contacts).toMatchObject([
        { name: 'Sam', owedCents: 3_000 },
      ])
      const contacts = await owed.listContacts()
      expect(contacts).toMatchObject([
        { name: 'Sam', owedToMeCents: 7_500, iOweCents: 3_000 },
      ])
    })
  })

  it('shares each later charge of a recurring item, and a new share changes later charges only', async () => {
    await withFixture(
      async ({ tx, owed, row, accountId, housing, refunds }) => {
        const { merchantKey } = normalizeLabel(RENT_LABEL, -80_000)
        const [item] = await tx
          .insert(recurringItemsTable)
          .values({
            accountId,
            merchantKey: merchantKey!,
            direction: 'debit',
            name: 'Loyer',
            status: 'confirmed',
            isFixedCost: true,
            cadence: 'monthly',
            amountType: 'fixed',
            typicalAmountCents: 80_000,
            confidence: 1,
            lastSeenDate: '2026-10-01',
            nextExpectedDate: '2026-11-01',
          })
          .returning()
        const august = await row('2026-08-01', -80_000, RENT_LABEL, housing)
        const september = await row('2026-09-01', -80_000, RENT_LABEL, housing)
        const october = await row('2026-10-01', -80_000, RENT_LABEL, housing)

        const share = await owed.setRecurringShare(
          item.id,
          { contactName: 'Camille', bps: 5_000, from: '2026-09-01' },
          NOW,
        )
        expect(share).toMatchObject({ contactName: 'Camille', bps: 5_000 })
        const amounts = async () =>
          new Map(
            (await tx.select().from(receivablesTable)).map((r) => [
              r.transactionId,
              [r.amountCents, r.origin],
            ]),
          )
        expect(await amounts()).toEqual(
          new Map([
            [september, [40_000, 'recurring']],
            [october, [40_000, 'recurring']],
          ]),
        )
        expect((await amounts()).has(august)).toBe(false)

        // From now on Camille pays a fixed 300 €: later charges only.
        await owed.setRecurringShare(
          item.id,
          {
            contactId: share.contactId,
            amountCents: 30_000,
            from: '2026-09-01',
          },
          NOW,
        )
        const november = await row('2026-11-01', -80_000, RENT_LABEL, housing, {
          createdAt: new Date(Date.now() + 60_000),
        })
        expect(await applyRecurringShares(tx)).toBe(1)
        expect((await amounts()).get(november)).toEqual([30_000, 'recurring'])
        expect((await amounts()).get(october)).toEqual([40_000, 'recurring'])
        // Idempotent.
        expect(await applyRecurringShares(tx)).toBe(0)

        // October's repayment, expected then received.
        const october31 = '2026-10-31'
        const before = await owed.expected('2026-10', october31)
        expect(before).toMatchObject([
          {
            name: 'Loyer',
            contactName: 'Camille',
            expectedCents: 40_000,
            receivedCents: 0,
            status: 'expected',
            date: october31,
          },
        ])
        const transfer = await row('2026-10-28', 40_000, 'VIR CAMILLE', refunds)
        await owed.linkRepayment(
          {
            transactionId: transfer,
            items: [
              { receivableId: before[0].receivableId!, amountCents: 40_000 },
            ],
          },
          NOW,
        )
        expect(await owed.expected('2026-10', october31)).toMatchObject([
          { status: 'received', receivedCents: 40_000 },
        ])
      },
    )
  })

  it('suggests a matching transfer in the review queue', async () => {
    await withFixture(async ({ owed, row, restaurants, refunds }) => {
      const dinner = await row('2026-10-10', -9_000, 'CB RESTO', restaurants)
      await owed.createShares({
        transactionId: dinner,
        shares: [{ contactName: 'Alex', amountCents: 3_000 }],
      })
      const [alex] = await owed.listContacts()
      await owed.updateContact(alex.id, { matchLabels: ['Alex Fictif'] })
      const transfer = await row(
        '2026-10-15',
        3_000,
        'VIR SEPA ALEX FICTIF',
        refunds,
      )
      await row('2026-10-16', 3_000, 'VIR SEPA AUTRE PERSONNE', refunds)
      const suggestions = await owed.repaymentSuggestions(NOW)
      expect(suggestions).toMatchObject([
        {
          transactionId: transfer,
          contactName: 'Alex',
          direction: 'owed_to_me',
          links: [{ amountCents: 3_000 }],
        },
      ])
    })
  })

  it('keeps an unshared month unchanged and refuses to split a shared expense', async () => {
    await withFixture(
      async ({ owed, transactions, row, spent, restaurants, misc }) => {
        const dinner = await row('2026-10-10', -9_000, 'CB RESTO', restaurants)
        expect(await spent(restaurants)).toBe(9_000)
        await owed.replaceShares(dinner, {
          shares: [{ contactName: 'Alex', amountCents: 4_500 }],
        })
        expect(await spent(restaurants)).toBe(4_500)
        await expect(
          transactions.split(dinner, [
            { categoryId: restaurants, amountCents: -6_000 },
            { categoryId: misc, amountCents: -3_000 },
          ]),
        ).rejects.toThrow('shared')
        // « J’ai payé pour quelqu’un » with nobody stops sharing it.
        const after = await owed.replaceShares(dinner, { shares: [] })
        expect(after.shares).toEqual([])
        expect(await spent(restaurants)).toBe(9_000)
      },
    )
  })

  describe('deleting a share repaid or let go (#438)', () => {
    /** A share of 60 € on a 90 € dinner, 20 € of it repaid by transfer. */
    async function repaidShare(
      f: Fixture,
      dinner: string,
      contactName = 'Sam',
    ) {
      const shared = await f.owed.createShares({
        transactionId: dinner,
        shares: [{ contactName, amountCents: 6_000 }],
      })
      const share = shared.shares[0]
      const transfer = await f.row(
        '2026-10-15',
        2_000,
        `VIR ${contactName.toUpperCase()} FICTIF`,
        f.refunds,
      )
      const { payments } = await f.owed.linkRepayment(
        {
          transactionId: transfer,
          items: [{ receivableId: share.id, amountCents: 2_000 }],
        },
        NOW,
      )
      return { share, payment: payments[0] }
    }

    it('refuses to delete a repaid share: the repayment stays neither income nor spending', async () => {
      await withFixture(async (f) => {
        const dinner = await f.row(
          '2026-10-10',
          -9_000,
          'CB PIZZERIA FICTIVE',
          f.restaurants,
        )
        const { share, payment } = await repaidShare(f, dinner)
        expect(await f.income()).toBe(0)
        expect(await f.spent(f.restaurants)).toBe(3_000)

        await expect(f.owed.deleteReceivable(share.id)).rejects.toThrow(
          new ConflictException(
            'A share already repaid or let go cannot be removed',
          ),
        )
        expect(await f.income()).toBe(0)
        expect(await f.spent(f.restaurants)).toBe(3_000)

        // Once the owner unlinks the repayment, the share can go.
        await f.owed.deletePayment(payment.id)
        await f.owed.deleteReceivable(share.id)
        expect(await f.spent(f.restaurants)).toBe(9_000)
      })
    })

    it('refuses to delete a share let go, and deletes an open one', async () => {
      await withFixture(async (f) => {
        const dinner = await f.row(
          '2026-10-10',
          -9_000,
          'CB PIZZERIA FICTIVE',
          f.restaurants,
        )
        const shared = await f.owed.createShares({
          transactionId: dinner,
          shares: [
            { contactName: 'Alex', amountCents: 3_000 },
            { contactName: 'Sam', amountCents: 3_000 },
          ],
        })
        const [alex, sam] = ['Alex', 'Sam'].map(
          (name) => shared.shares.find((s) => s.contactName === name)!,
        )
        await f.owed.forgive(sam.id, {}, NOW)
        await expect(f.owed.deleteReceivable(sam.id)).rejects.toBeInstanceOf(
          ConflictException,
        )
        // An open share goes, its expense stays.
        await f.owed.deleteReceivable(alex.id)
        const after = await f.transactions.findOne(dinner)
        expect(after.shares.map((s) => s.contactName)).toEqual(['Sam'])
        expect(await f.spent(f.restaurants)).toBe(9_000)
      })
    })

    it('refuses to delete a repaid debt « Quelqu’un a payé pour moi » with its expense', async () => {
      await withFixture(async (f) => {
        const debt = await f.owed.createDebt(
          {
            contactName: 'Sam',
            billCents: 9_000,
            partCents: 3_000,
            categoryId: f.restaurants,
            bookingDate: '2026-10-12',
          },
          NOW,
        )
        const toSam = await f.row('2026-10-20', -3_000, 'VIR SAM', f.misc)
        await f.owed.linkRepayment(
          {
            transactionId: toSam,
            items: [{ receivableId: debt.shares[0].id, amountCents: 3_000 }],
          },
          NOW,
        )
        await expect(
          f.owed.deleteReceivable(debt.shares[0].id),
        ).rejects.toBeInstanceOf(ConflictException)
        expect(await f.spent(f.misc)).toBe(0)
        expect(await f.spent(f.restaurants)).toBe(3_000)
      })
    })

    it('refuses to delete a manual expense carrying a repaid or let-go share, and deletes one without', async () => {
      await withFixture(async (f) => {
        const entry = (amountCents: number) =>
          f.manual.create(
            {
              amountCents,
              categoryId: f.restaurants,
              bookingDate: '2026-10-10',
              accountId: f.accountId,
              label: 'Pizzeria fictive',
            },
            NOW,
          )
        const repaid = await entry(9_000)
        await repaidShare(f, repaid.id)
        expect(await f.income()).toBe(0)
        await expect(f.manual.remove(repaid.id)).rejects.toThrow(
          new ConflictException(
            'A share already repaid or let go cannot be removed',
          ),
        )
        expect(await f.income()).toBe(0)
        expect(await f.spent(f.restaurants)).toBe(3_000)

        const forgiven = await entry(4_000)
        const shared = await f.owed.createShares({
          transactionId: forgiven.id,
          shares: [{ contactName: 'Alex', amountCents: 2_000 }],
        })
        await f.owed.forgive(shared.shares[0].id, {}, NOW)
        await expect(f.manual.remove(forgiven.id)).rejects.toBeInstanceOf(
          ConflictException,
        )

        // An open share goes with its expense.
        const open = await entry(5_000)
        await f.owed.createShares({
          transactionId: open.id,
          shares: [{ contactName: 'Camille', amountCents: 2_500 }],
        })
        await f.manual.remove(open.id)
        const left = await f.tx
          .select({ id: receivablesTable.id })
          .from(receivablesTable)
          .where(eq(receivablesTable.transactionId, open.id))
        expect(left).toEqual([])
        expect(await f.spent(f.restaurants)).toBe(3_000 + 4_000)
      })
    })
  })
})
