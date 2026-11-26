import '#/load-env'
import { BadRequestException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  contactsTable,
  envelopeMovementsTable,
  envelopesTable,
  receivablesTable,
  transactionsTable,
} from '#/database/schema'
import { OwedService } from '#/owed/owed.service'
import { RecurringService } from '#/recurring/recurring.service'
import { ManualTransactionsService } from '../manual-transactions.service'
import { bankRows } from '../testing/bank-rows'
import { TransactionsService } from '../transactions.service'
import { TransactionEditService } from './transaction-edit.service'

/**
 * The transaction editor's save (#435) against the migrated test database:
 * every change in one go, and nothing at all when one of them is refused.
 * Every test runs in a transaction that is rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const NOW = new Date('2026-10-31T11:00:00Z')

interface Fixture {
  tx: Tx
  edits: TransactionEditService
  manual: ManualTransactionsService
  owed: OwedService
  transactions: TransactionsService
  accountId: string
  groceries: string
  outings: string
  moves: string
  /** A manual expense of `cents` (positive) in groceries, on 2026-10-10. */
  expense: (cents: number) => Promise<string>
  /** An imported row; returns its id. */
  bankRow: (
    amountCents: number,
    label: string,
    kind: 'expense' | 'income' | 'transfer',
  ) => Promise<string>
  /** The row as stored, with what hangs on it. */
  snapshot: (id: string) => Promise<unknown>
}

describe.skipIf(!process.env.DATABASE_URL)(
  'TransactionEditService (database)',
  () => {
    let client: postgres.Sql
    let db: Db

    beforeAll(() => {
      client = postgres(process.env.DATABASE_URL!, { max: 1 })
      db = drizzle(client, { schema })
    })

    afterAll(async () => {
      await client.end()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    async function withFixture(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          const [account] = await tx
            .insert(accountsTable)
            .values({ name: 'Edit checking', type: 'checking' })
            .returning()
          const [groceries, outings, moves] = await tx
            .insert(categoriesTable)
            .values([
              { slug: 'edit_groceries', name: 'Courses', kind: 'expense' },
              { slug: 'edit_outings', name: 'Sorties', kind: 'expense' },
              { slug: 'edit_moves', name: 'Entre comptes', kind: 'transfer' },
            ])
            .returning()
          const database = { db: tx } as never
          const transactions = new TransactionsService(database)
          const recurring = new RecurringService(database)
          const owed = new OwedService(database, transactions, recurring)
          const manual = new ManualTransactionsService(database, transactions)
          await fn({
            tx,
            edits: new TransactionEditService(database),
            manual,
            owed,
            transactions,
            accountId: account.id,
            groceries: groceries.id,
            outings: outings.id,
            moves: moves.id,
            expense: async (cents) => {
              const created = await manual.create(
                {
                  amountCents: cents,
                  direction: 'out',
                  kind: 'expense',
                  categoryId: groceries.id,
                  bookingDate: '2026-10-10',
                  label: 'Marché fictif',
                  accountId: account.id,
                },
                NOW,
              )
              return created.id
            },
            bankRow: async (amountCents, label, kind) => {
              const [row] = await tx
                .insert(transactionsTable)
                .values(
                  await bankRows(tx, {
                    accountId: account.id,
                    bookingDate: '2026-10-12',
                    amountCents,
                    rawLabel: label,
                    kind,
                    dedupeHash: randomUUID().replace(/-/g, ''),
                  }),
                )
                .returning({ id: transactionsTable.id })
              return row.id
            },
            snapshot: async (id) => {
              const found = await transactions.findOne(id)
              return {
                amountCents: found.amountCents,
                bookingDate: found.bookingDate,
                rawLabel: found.rawLabel,
                categoryId: found.categoryId,
                kind: found.kind,
                note: found.note,
                isOneOff: found.isOneOff,
                needsReview: found.needsReview,
                splits: found.splits.map((s) => [s.categoryId, s.amountCents]),
                shares: found.shares.map((s) => [s.contactName, s.amountCents]),
                repayments: found.repayments.map((r) => r.amountCents),
                prepaidItemId: found.prepaidItemId,
              }
            },
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    it('applies the fields, the shares and the prepaid term in one save', async () => {
      await withFixture(async ({ edits, expense, outings }) => {
        const id = await expense(6_000)

        const saved = await edits.save(
          id,
          {
            manual: { amountCents: 6_500, label: 'Concert fictif' },
            changes: {
              categoryId: outings,
              note: 'Avec Camille',
              isOneOff: true,
            },
            shares: {
              shares: [{ contactName: 'Camille Fictive', amountCents: 3_250 }],
            },
            prepaidTermMonths: 12,
          },
          NOW,
        )

        expect(saved).toMatchObject({
          amountCents: -6_500,
          rawLabel: 'Concert fictif',
          categoryId: outings,
          note: 'Avec Camille',
          isOneOff: true,
          prepaidTermMonths: 12,
        })
        expect(saved.prepaidItemId).not.toBeNull()
        expect(saved.shares).toMatchObject([
          { contactName: 'Camille Fictive', amountCents: 3_250 },
        ])
      })
    })

    it('leaves everything unchanged when a later change is refused', async () => {
      await withFixture(async ({ tx, edits, expense, outings, snapshot }) => {
        const id = await expense(6_000)
        const before = await snapshot(id)

        await expect(
          edits.save(
            id,
            {
              manual: { label: 'Autre libellé' },
              changes: { categoryId: outings, note: 'Une note' },
              prepaidTermMonths: 12,
              // More than the expense: refused, after the fields applied.
              shares: {
                shares: [{ contactName: 'Sam Fictif', amountCents: 9_000 }],
              },
            },
            NOW,
          ),
        ).rejects.toThrow(BadRequestException)

        expect(await snapshot(id)).toEqual(before)
        // Not even the contact the shares named.
        const contacts = await tx
          .select()
          .from(contactsTable)
          .where(eq(contactsTable.name, 'Sam Fictif'))
        expect(contacts).toEqual([])
      })
    })

    it('rolls back everything when the last step fails (forced)', async () => {
      await withFixture(
        async ({ edits, owed, bankRow, expense, moves, snapshot }) => {
          // Someone owes the owner on an expense; a transfer comes in.
          const expenseId = await expense(4_000)
          const shared = await owed.replaceShares(expenseId, {
            shares: [{ contactName: 'Camille Fictive', amountCents: 2_000 }],
          })
          const transferId = await bankRow(
            2_000,
            'VIR SEPA RECU CAMILLE FICTIVE',
            'transfer',
          )
          const before = await snapshot(transferId)
          vi.spyOn(OwedService.prototype, 'linkRepayment').mockRejectedValue(
            new Error('forced failure'),
          )

          await expect(
            edits.save(
              transferId,
              {
                changes: {
                  categoryId: moves,
                  note: 'Remboursement',
                  isOneOff: true,
                },
                repayments: {
                  link: {
                    items: [
                      {
                        receivableId: shared.shares[0].id,
                        amountCents: 2_000,
                      },
                    ],
                  },
                },
              },
              NOW,
            ),
          ).rejects.toThrow('forced failure')

          expect(await snapshot(transferId)).toEqual(before)
        },
      )
    })

    it('links and unlinks repayments, then changes the fields', async () => {
      await withFixture(
        async ({ tx, edits, owed, bankRow, expense, moves }) => {
          const expenseId = await expense(4_000)
          const shared = await owed.replaceShares(expenseId, {
            shares: [{ contactName: 'Camille Fictive', amountCents: 2_000 }],
          })
          const receivableId = shared.shares[0].id
          const transferId = await bankRow(
            1_500,
            'VIR SEPA RECU CAMILLE FICTIVE',
            'transfer',
          )

          const linked = await edits.save(
            transferId,
            {
              changes: { categoryId: moves },
              repayments: {
                link: { items: [{ receivableId, amountCents: 1_500 }] },
              },
            },
            NOW,
          )
          expect(linked.categoryId).toBe(moves)
          expect(linked.repayments).toMatchObject([{ amountCents: 1_500 }])

          const unlinked = await edits.save(
            transferId,
            {
              repayments: { unlink: [linked.repayments[0].id] },
              changes: { note: 'Pas un remboursement' },
            },
            NOW,
          )
          expect(unlinked.repayments).toEqual([])
          expect(unlinked.note).toBe('Pas un remboursement')
          const [receivable] = await tx
            .select()
            .from(receivablesTable)
            .where(eq(receivablesTable.id, receivableId))
          expect(receivable).toBeDefined()
        },
      )
    })

    it('lowers an amount together with its shares', async () => {
      await withFixture(async ({ edits, owed, expense }) => {
        const id = await expense(6_000)
        const shared = await owed.replaceShares(id, {
          shares: [{ contactName: 'Camille Fictive', amountCents: 5_000 }],
        })
        const contactId = shared.shares[0].contactId

        const saved = await edits.save(
          id,
          {
            manual: { amountCents: 3_000 },
            shares: { shares: [{ contactId, amountCents: 1_500 }] },
          },
          NOW,
        )

        expect(saved.amountCents).toBe(-3_000)
        expect(saved.shares).toMatchObject([{ amountCents: 1_500 }])
      })
    })

    it('ends a split and files the transaction in one category', async () => {
      await withFixture(
        async ({ edits, transactions, expense, groceries, outings }) => {
          const id = await expense(6_000)
          await transactions.split(id, [
            { categoryId: groceries, amountCents: -4_000 },
            { categoryId: outings, amountCents: -2_000 },
          ])

          const saved = await edits.save(
            id,
            { split: null, manual: { amountCents: 7_000 } },
            NOW,
          )

          expect(saved.splits).toEqual([])
          expect(saved.amountCents).toBe(-7_000)
        },
      )
    })

    it('refuses the manual fields of a bank row and a payment of another transaction', async () => {
      await withFixture(
        async ({ edits, owed, bankRow, expense, moves, snapshot }) => {
          const bankId = await bankRow(-2_500, 'PAIEMENT CB FICTIF', 'expense')
          await expect(
            edits.save(bankId, { manual: { amountCents: 100 } }, NOW),
          ).rejects.toThrow(BadRequestException)

          const expenseId = await expense(4_000)
          const shared = await owed.replaceShares(expenseId, {
            shares: [{ contactName: 'Camille Fictive', amountCents: 2_000 }],
          })
          const transferId = await bankRow(
            1_000,
            'VIR SEPA RECU CAMILLE FICTIVE',
            'transfer',
          )
          const link = await owed.linkRepayment(
            {
              transactionId: transferId,
              items: [
                { receivableId: shared.shares[0].id, amountCents: 1_000 },
              ],
            },
            NOW,
          )
          const otherId = await bankRow(
            500,
            'VIR SEPA RECU AUTRE FICTIF',
            'transfer',
          )
          const before = await snapshot(transferId)
          await expect(
            edits.save(
              otherId,
              {
                changes: { categoryId: moves },
                repayments: { unlink: [link.payments[0].id] },
              },
              NOW,
            ),
          ).rejects.toThrow(BadRequestException)
          expect(await snapshot(transferId)).toEqual(before)
        },
      )
    })

    it('refuses a save with nothing in it', async () => {
      await withFixture(async ({ edits, expense }) => {
        const id = await expense(1_000)
        await expect(edits.save(id, { changes: {} }, NOW)).rejects.toThrow(
          /Nothing to update/,
        )
      })
    })

    it('attaches, changes and detaches an envelope with the other fields (#430)', async () => {
      await withFixture(async ({ tx, edits, expense, bankRow, accountId }) => {
        await bankRow(100_000, 'VIR SALAIRE TEST', 'income')
        const [envelope] = await tx
          .insert(envelopesTable)
          .values({ name: 'Voyage test' })
          .returning()
        await tx.insert(envelopeMovementsTable).values({
          envelopeId: envelope.id,
          accountId,
          amountCents: 30_000,
          onDate: '2026-10-01',
          reason: 'start',
        })
        const id = await expense(12_000)

        const attached = await edits.save(
          id,
          {
            envelope: { envelopeId: envelope.id },
            changes: { note: 'Billets' },
          },
          NOW,
        )
        expect(attached).toMatchObject({
          envelopeId: envelope.id,
          envelopeAmountCents: 12_000,
          note: 'Billets',
        })

        // Part of it only: detached then attached again, in one save.
        expect(
          await edits.save(
            id,
            { envelope: { envelopeId: envelope.id, amountCents: 5_000 } },
            NOW,
          ),
        ).toMatchObject({ envelopeId: envelope.id, envelopeAmountCents: 5_000 })

        // More than it holds: refused, and the note stays as it was.
        await expect(
          edits.save(
            id,
            {
              envelope: { envelopeId: envelope.id, amountCents: 40_000 },
              changes: { note: 'Changée' },
            },
            NOW,
          ),
        ).rejects.toBeInstanceOf(BadRequestException)
        const [row] = await tx
          .select({ note: transactionsTable.note })
          .from(transactionsTable)
          .where(eq(transactionsTable.id, id))
        expect(row.note).toBe('Billets')

        expect(await edits.save(id, { envelope: null }, NOW)).toMatchObject({
          envelopeId: null,
          envelopeAmountCents: null,
        })
      })
    })
  },
)
