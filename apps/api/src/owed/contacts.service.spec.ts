import { asSpecOwner } from '#/database/testing/spec-owner'
import '#/load-env'
import { ConflictException } from '@nestjs/common'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  contactsTable,
  recurringItemsTable,
  transactionsTable,
} from '#/database/schema'
import { normalizeLabel } from '#/imports/normalize/label'
import { RecurringService } from '#/recurring/recurring.service'
import { bankRows } from '#/transactions/testing/bank-rows'
import { TransactionsService } from '#/transactions/transactions.service'
import { OwedService } from './owed.service'

/**
 * The contacts' lifecycle (#359, #440) against the migrated test database:
 * a rename shows everywhere (names are joined at read time), a name taken
 * (case ignored) is refused, a contact with a history can't be deleted but
 * can be archived, and an archived one leaves the lists of contacts while
 * its history stays. Every test runs in a transaction that is rolled back.
 * Synthetic names, labels and amounts only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const NOW = new Date('2026-10-31T11:00:00Z')
const TODAY = '2026-10-31'
const RENT_LABEL = 'PRLV SEPA AGENCE FICTIVE LOYER'

interface Fixture {
  tx: Tx
  owed: OwedService
  transactions: TransactionsService
  recurring: RecurringService
  accountId: string
  restaurants: string
  housing: string
  /** Inserts a bank row in an expense category; returns its id. */
  row: (
    date: string,
    amountCents: number,
    label: string,
    categoryId: string,
  ) => Promise<string>
  /** A confirmed monthly rent; returns its id. */
  rentItem: () => Promise<string>
}

describe.skipIf(!process.env.DATABASE_URL)('Contacts (database)', () => {
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
        await asSpecOwner(tx)
        const [account] = await tx
          .insert(accountsTable)
          .values({ name: 'Contacts checking', type: 'checking' })
          .returning()
        const [restaurants, housing] = await tx
          .insert(categoriesTable)
          .values([
            {
              slug: 'contacts_restaurants',
              name: 'Restaurants',
              kind: 'expense',
            },
            { slug: 'contacts_housing', name: 'Logement', kind: 'expense' },
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
          recurring,
          accountId: account.id,
          restaurants: restaurants.id,
          housing: housing.id,
          row: async (date, amountCents, label, categoryId) => {
            const [inserted] = await tx
              .insert(transactionsTable)
              .values(
                await bankRows(tx, {
                  accountId: account.id,
                  bookingDate: date,
                  amountCents,
                  rawLabel: label,
                  kind: 'expense',
                  categoryId,
                  dedupeHash: randomUUID().replace(/-/g, ''),
                }),
              )
              .returning({ id: transactionsTable.id })
            return inserted.id
          },
          rentItem: async () => {
            const { merchantKey } = normalizeLabel(RENT_LABEL, -80_000)
            const [item] = await tx
              .insert(recurringItemsTable)
              .values({
                accountId: account.id,
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
            return item.id
          },
        })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  it('shows a new name everywhere: the owed lists, the contact’s page, a transaction’s shares and payer, a shared recurring item', async () => {
    await withFixture(
      async ({
        owed,
        transactions,
        recurring,
        row,
        restaurants,
        housing,
        rentItem,
      }) => {
        const dinner = await row(
          '2026-10-10',
          -9_000,
          'CB PIZZERIA FICTIVE',
          restaurants,
        )
        await owed.createShares({
          transactionId: dinner,
          shares: [{ contactName: 'Alex', amountCents: 3_000 }],
        })
        const debt = await owed.createDebt(
          {
            contactName: 'Sam',
            billCents: 6_000,
            partCents: 2_000,
            categoryId: restaurants,
            bookingDate: '2026-10-12',
          },
          NOW,
        )
        const item = await rentItem()
        await row('2026-10-01', -80_000, RENT_LABEL, housing)
        await owed.setRecurringShare(
          item,
          { contactName: 'Camille', bps: 5_000, from: '2026-10-01' },
          NOW,
        )
        const id = async (name: string) =>
          (await owed.listContacts()).find((c) => c.name === name)!.id
        const alex = await id('Alex')
        const sam = await id('Sam')
        const camille = await id('Camille')

        await owed.updateContact(alex, { name: 'Alexis Fictif' })
        await owed.updateContact(sam, { name: 'Samuel Fictif' })
        const renamed = await owed.updateContact(camille, {
          name: 'Camila Fictive',
        })
        expect(renamed).toMatchObject({ id: camille, name: 'Camila Fictive' })

        // « Dépenses partagées »: both lists.
        const summary = await owed.summary(NOW)
        expect(
          summary.owedToMe.contacts.map((c) => [c.contactId, c.name]).sort(),
        ).toEqual(
          [
            [alex, 'Alexis Fictif'],
            [camille, 'Camila Fictive'],
          ].sort(),
        )
        expect(summary.iOwe.contacts).toMatchObject([
          { contactId: sam, name: 'Samuel Fictif' },
        ])
        expect(summary.expected).toMatchObject([
          { contactId: camille, contactName: 'Camila Fictive' },
        ])

        // A contact's page, with the recurring item shared with them.
        const page = await owed.contactOwed(camille, NOW)
        expect(page.contact.name).toBe('Camila Fictive')
        expect(page.sharedItems).toMatchObject([
          { recurringItemId: item, share: { contactName: 'Camila Fictive' } },
        ])
        expect(page.expected).toMatchObject([{ contactName: 'Camila Fictive' }])
        expect((await owed.contactOwed(sam, NOW)).contact.name).toBe(
          'Samuel Fictif',
        )

        // A transaction's shares, and who paid an expense for the owner.
        expect((await transactions.findOne(dinner)).shares).toMatchObject([
          { contactId: alex, contactName: 'Alexis Fictif' },
        ])
        const paidForMe = await transactions.findOne(debt.id)
        expect(paidForMe.paidByContactName).toBe('Samuel Fictif')
        expect(paidForMe.shares).toMatchObject([
          { contactId: sam, contactName: 'Samuel Fictif' },
        ])

        // The shared recurring item.
        const shared = (await recurring.list('confirmed', TODAY)).find(
          (i) => i.id === item,
        )
        expect(shared?.share).toMatchObject({
          contactId: camille,
          contactName: 'Camila Fictive',
        })
      },
    )
  })

  it('refuses a name already taken, case ignored, when adding or renaming', async () => {
    await withFixture(async ({ owed }) => {
      const alex = await owed.createContact({ name: 'Alex' })
      const sam = await owed.createContact({ name: 'Sam' })

      await expect(owed.createContact({ name: 'ALEX' })).rejects.toThrow(
        ConflictException,
      )
      await expect(owed.createContact({ name: 'alex' })).rejects.toThrow(
        'A contact already has this name',
      )
      await expect(
        owed.updateContact(sam.id, { name: 'aLeX' }),
      ).rejects.toThrow(ConflictException)
      // An archived contact still holds its name.
      await owed.updateContact(alex.id, { archived: true })
      await expect(owed.createContact({ name: 'Alex' })).rejects.toThrow(
        ConflictException,
      )
      // A contact may change the case of their own name.
      await expect(
        owed.updateContact(alex.id, { name: 'ALEX' }),
      ).resolves.toMatchObject({ id: alex.id, name: 'ALEX' })
      expect((await owed.listContacts(true)).map((c) => c.name).sort()).toEqual(
        ['ALEX', 'Sam'],
      )
    })
  })

  it('refuses to delete a contact with a share (409) and lets it be archived instead', async () => {
    await withFixture(async ({ tx, owed, row, restaurants }) => {
      const dinner = await row(
        '2026-10-10',
        -9_000,
        'CB PIZZERIA FICTIVE',
        restaurants,
      )
      await owed.createShares({
        transactionId: dinner,
        shares: [{ contactName: 'Alex', amountCents: 3_000 }],
      })
      const [alex] = await owed.listContacts()

      const refused = owed.deleteContact(alex.id)
      await expect(refused).rejects.toThrow(ConflictException)
      await expect(refused).rejects.toThrow('archive it instead')
      expect(await tx.select().from(contactsTable)).toHaveLength(1)

      await owed.updateContact(alex.id, { archived: true })
      expect(await owed.listContacts()).toEqual([])
    })
  })

  it('refuses to delete a contact who owes on « Quelqu’un a payé pour moi » (409)', async () => {
    await withFixture(async ({ owed, restaurants }) => {
      await owed.createDebt(
        {
          contactName: 'Sam',
          billCents: 6_000,
          partCents: 2_000,
          categoryId: restaurants,
          bookingDate: '2026-10-12',
        },
        NOW,
      )
      const [sam] = await owed.listContacts()
      await expect(owed.deleteContact(sam.id)).rejects.toThrow(
        ConflictException,
      )
    })
  })

  it('refuses to delete a contact sharing a recurring item, even before any charge (409)', async () => {
    await withFixture(async ({ owed, rentItem }) => {
      const item = await rentItem()
      // From next month: no charge booked yet, so no share either.
      const share = await owed.setRecurringShare(
        item,
        { contactName: 'Camille', bps: 5_000, from: '2026-11-01' },
        NOW,
      )
      expect(
        (await owed.contactOwed(share.contactId, NOW)).owedToMe.open,
      ).toEqual([])

      await expect(owed.deleteContact(share.contactId)).rejects.toThrow(
        ConflictException,
      )
      // Once the item is no longer shared, nothing holds the contact.
      await owed.clearRecurringShare(item)
      await owed.deleteContact(share.contactId)
      expect(await owed.listContacts(true)).toEqual([])
    })
  })

  it('deletes a contact never used', async () => {
    await withFixture(async ({ tx, owed }) => {
      const unused = await owed.createContact({ name: 'Dominique' })
      const kept = await owed.createContact({ name: 'Morgan' })
      await owed.deleteContact(unused.id)
      expect((await tx.select().from(contactsTable)).map((c) => c.id)).toEqual([
        kept.id,
      ])
      await expect(owed.deleteContact(unused.id)).rejects.toThrow(
        'Contact not found',
      )
    })
  })

  it('leaves an archived contact out of the contacts, keeps their history in « Dépenses partagées », and brings them back', async () => {
    await withFixture(async ({ owed, row, restaurants }) => {
      const dinner = await row(
        '2026-10-10',
        -9_000,
        'CB PIZZERIA FICTIVE',
        restaurants,
      )
      const lunch = await row(
        '2026-10-14',
        -4_000,
        'CB BRASSERIE FICTIVE',
        restaurants,
      )
      await owed.createShares({
        transactionId: dinner,
        shares: [
          { contactName: 'Alex', amountCents: 3_000 },
          { contactName: 'Sam', amountCents: 3_000 },
        ],
      })
      await owed.createShares({
        transactionId: lunch,
        shares: [{ contactName: 'Sam', amountCents: 2_000 }],
      })
      const contacts = await owed.listContacts()
      const alex = contacts.find((c) => c.name === 'Alex')!
      const sam = contacts.find((c) => c.name === 'Sam')!
      // Sam's lunch is let go: one item open, one in the history.
      const lunchShare = (
        await owed.contactOwed(sam.id, NOW)
      ).owedToMe.open.find((i) => i.transactionId === lunch)!
      await owed.forgive(lunchShare.id, {}, NOW)

      const archived = await owed.updateContact(sam.id, { archived: true })
      expect(archived.archivedAt).not.toBeNull()

      expect((await owed.listContacts()).map((c) => c.id)).toEqual([alex.id])
      expect(await owed.listContacts(true)).toMatchObject([
        { id: alex.id, archivedAt: null },
        { id: sam.id, name: 'Sam', owedToMeCents: 3_000 },
      ])

      // GET /api/owed still lists what Sam owes.
      const summary = await owed.summary(NOW)
      expect(summary.owedToMe.totalCents).toBe(6_000)
      expect(summary.owedToMe.contacts).toMatchObject([
        { contactId: alex.id, name: 'Alex', owedCents: 3_000 },
        { contactId: sam.id, name: 'Sam', owedCents: 3_000, openCount: 1 },
      ])
      // Their page keeps the open item and the one let go.
      const page = await owed.contactOwed(sam.id, NOW)
      expect(page.contact.archivedAt).not.toBeNull()
      expect(page.owedToMe.open).toMatchObject([{ transactionId: dinner }])
      expect(page.owedToMe.history).toMatchObject([
        { transactionId: lunch, state: 'forgiven' },
      ])

      // Archiving again keeps the first date; « Rétablir » brings them back.
      const again = await owed.updateContact(sam.id, { archived: true })
      expect(again.archivedAt).toEqual(archived.archivedAt)
      await owed.updateContact(sam.id, { archived: false })
      expect((await owed.listContacts()).map((c) => c.id).sort()).toEqual(
        [alex.id, sam.id].sort(),
      )
    })
  })
})
