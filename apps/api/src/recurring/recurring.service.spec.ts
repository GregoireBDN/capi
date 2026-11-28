import { asSpecOwner } from '#/database/testing/spec-owner'
import '#/load-env'
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  type InsertTransaction,
  recurringItemsTable,
  transactionLinesView,
  transactionsTable,
} from '#/database/schema'
import { addMonths } from './dates'
import { amountRuns, RecurringService } from './recurring.service'
import { bankRows } from '#/transactions/testing/bank-rows'

/**
 * Integration checks against the migrated test database. Each test runs in a
 * transaction that is rolled back, starting without transactions or
 * recurring items. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const TODAY = '2026-11-06'
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

describe.skipIf(!process.env.DATABASE_URL)(
  'RecurringService (database)',
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

    interface Fixture {
      tx: Tx
      service: RecurringService
      checking: string
      savings: string
      subscriptions: string
      rent: string
      groceries: string
      salary: string
      insert: (rows: Partial<InsertTransaction>[]) => Promise<void>
    }

    let sequence = 0

    async function withFixture(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          await asSpecOwner(tx)
          await tx.delete(recurringItemsTable)
          await tx.delete(transactionsTable)
          const [checking, savings] = await tx
            .insert(accountsTable)
            .values([
              { name: 'Test checking', type: 'checking' },
              { name: 'Test savings', type: 'savings' },
            ])
            .returning()
          const categories = await tx
            .insert(categoriesTable)
            .values([
              { slug: 'test_groceries', name: 'Test courses', kind: 'expense' },
              { slug: 'test_salary', name: 'Test salaire', kind: 'income' },
            ])
            .returning()
          const bySlug = new Map(categories.map((c) => [c.slug, c.id]))
          // The fixed-cost default and `isSubscription` follow the real
          // slugs: reuse the seeded categories, or create them.
          await tx
            .insert(categoriesTable)
            .values([
              { slug: 'subscriptions', name: 'Abonnements', kind: 'expense' },
              { slug: 'rent', name: 'Loyer', kind: 'expense' },
            ])
            .onConflictDoNothing()
          const real = new Map(
            (
              await tx
                .select({ id: categoriesTable.id, slug: categoriesTable.slug })
                .from(categoriesTable)
            ).map((c) => [c.slug, c.id]),
          )
          const insert = async (rows: Partial<InsertTransaction>[]) => {
            await tx.insert(transactionsTable).values(
              await bankRows(
                tx,
                rows.map((row) => ({
                  accountId: checking.id,
                  bookingDate: '2026-01-01',
                  amountCents: -100,
                  rawLabel: 'PRLV SEPA DIVERS',
                  kind: 'expense' as const,
                  dedupeHash: `recurring-spec-${++sequence}`,
                  ...row,
                })),
              ),
            )
          }
          await fn({
            tx,
            // The service only reads `db`; its transactions become savepoints.
            service: new RecurringService({ db: tx } as never),
            checking: checking.id,
            savings: savings.id,
            subscriptions: real.get('subscriptions')!,
            rent: real.get('rent')!,
            groceries: bySlug.get('test_groceries')!,
            salary: bySlug.get('test_salary')!,
            insert,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    /** `count` monthly rows ending at `last`. */
    function monthly(
      last: string,
      count: number,
      row: Partial<InsertTransaction> & { amountCents: number },
      amount?: (i: number) => number,
    ): Partial<InsertTransaction>[] {
      return Array.from({ length: count }, (_, i) => ({
        ...row,
        bookingDate: addMonths(last, i - count + 1),
        amountCents: amount ? amount(i) : row.amountCents,
      }))
    }

    async function seedHousehold(f: Fixture) {
      await f.insert([
        ...monthly('2026-10-02', 12, {
          rawLabel: 'PRLV SEPA SOCIETE IMMO EXEMPLE',
          amountCents: -80_000,
          categoryId: f.rent,
        }),
        ...monthly(
          '2026-10-12',
          10,
          {
            rawLabel: 'PRLV SEPA STREAMFLIX',
            amountCents: -1_099,
            categoryId: f.subscriptions,
          },
          (i) => (i < 7 ? -1_099 : -1_299),
        ),
        ...monthly('2026-10-28', 12, {
          rawLabel: 'VIR SEPA EMPLOYEUR EXEMPLE',
          amountCents: 250_000,
          kind: 'income',
          categoryId: f.salary,
        }),
        // Noise: groceries several times a week.
        ...Array.from({ length: 40 }, (_, i) => ({
          rawLabel: 'PAIEMENT CB 0101 PARIS SUPERMARCHE EXEMPLE CARTE 1234',
          bookingDate: addMonths('2026-07-01', 0, 1 + ((i * 3) % 28)),
          amountCents: -(1_000 + ((i * 1_237) % 9_000)),
          categoryId: f.groceries,
        })),
        // Transfers to own savings and one-offs never make a series.
        ...monthly('2026-10-05', 12, {
          rawLabel: 'VIR SEPA LIVRET EXEMPLE',
          amountCents: -20_000,
          kind: 'transfer',
        }),
        ...monthly('2026-10-20', 6, {
          rawLabel: 'PRLV SEPA EXCEPTIONNEL EXEMPLE',
          amountCents: -5_000,
          isOneOff: true,
        }),
      ])
    }

    it('creates suggestions for the active series only', async () => {
      await withFixture(async (f) => {
        await seedHousehold(f)
        const result = await f.service.detect(TODAY)
        expect(result).toMatchObject({
          detectedCount: 3,
          createdCount: 3,
          updatedCount: 0,
          removedCount: 0,
          suggestedCount: 3,
        })
        const items = await f.service.list('suggested')
        expect(items.map((i) => i.merchantKey).sort()).toEqual([
          'EMPLOYEUR EXEMPLE',
          'SOCIETE IMMO EXEMPLE',
          'STREAMFLIX',
        ])
        const stream = items.find((i) => i.merchantKey === 'STREAMFLIX')!
        expect(stream).toMatchObject({
          accountName: 'Test checking',
          direction: 'debit',
          cadence: 'monthly',
          amountType: 'fixed',
          typicalAmountCents: 1_299,
          previousAmountCents: 1_099,
          priceChangeCents: 200,
          priceChangedOn: '2026-08-12',
          monthlyEquivalentCents: 1_299,
          yearlyCostCents: 15_588,
          isSubscription: true,
          isFixedCost: true,
          nextExpectedDate: '2026-11-12',
          active: true,
          occurrenceCount: 10,
          searchText: 'Streamflix',
        })
        // The price history in runs, newest first, over every occurrence.
        expect(stream.amountRuns).toEqual([
          {
            amountCents: 1_299,
            from: '2026-08-12',
            to: '2026-10-12',
            count: 3,
          },
          {
            amountCents: 1_099,
            from: '2026-01-12',
            to: '2026-07-12',
            count: 7,
          },
        ])
        expect(stream.occurrences).toHaveLength(6)
        expect(stream.occurrences[0].date).toBe('2026-10-12')
        const salary = items.find((i) => i.direction === 'credit')!
        expect(salary.isFixedCost).toBe(false)
      })
    })

    it('re-detects idempotently and keeps user decisions', async () => {
      await withFixture(async (f) => {
        await seedHousehold(f)
        await f.service.detect(TODAY)
        const items = await f.service.list()
        const rent = items.find(
          (i) => i.merchantKey === 'SOCIETE IMMO EXEMPLE',
        )!
        const stream = items.find((i) => i.merchantKey === 'STREAMFLIX')!
        await f.service.update(rent.id, {
          status: 'confirmed',
          name: 'Loyer',
          notes: 'Bail 2025',
        })
        await f.service.update(stream.id, { status: 'dismissed' })

        const again = await f.service.detect(TODAY)
        expect(again).toMatchObject({
          createdCount: 0,
          updatedCount: 3,
          removedCount: 0,
          suggestedCount: 1,
        })
        const after = await f.service.list()
        expect(after).toHaveLength(3)
        expect(after.find((i) => i.id === rent.id)).toMatchObject({
          status: 'confirmed',
          name: 'Loyer',
          notes: 'Bail 2025',
        })
        // Dismissed items are never suggested again.
        expect(after.find((i) => i.id === stream.id)?.status).toBe('dismissed')
      })
    })

    it('removes suggestions that are no longer detected', async () => {
      await withFixture(async (f) => {
        await seedHousehold(f)
        await f.service.detect(TODAY)
        // The streaming charges are flagged one-off: no series any more.
        await f.tx
          .update(transactionsTable)
          .set({ isOneOff: true })
          .where(eq(transactionsTable.rawLabel, 'PRLV SEPA STREAMFLIX'))
        const result = await f.service.detect(TODAY)
        expect(result.removedCount).toBe(1)
        expect(
          (await f.service.list()).map((i) => i.merchantKey),
        ).not.toContain('STREAMFLIX')
      })
    })

    it('sums confirmed active items: fixed, variable, subscriptions, credits', async () => {
      await withFixture(async (f) => {
        await seedHousehold(f)
        await f.insert(
          monthly('2026-10-15', 6, {
            rawLabel: 'PRLV SEPA SALLE SPORT EXEMPLE',
            amountCents: -3_000,
          }),
        )
        await f.service.detect(TODAY)
        const items = await f.service.list()
        const confirmed = await f.service.confirm([
          ...items.map((i) => i.id),
          UNKNOWN_ID,
        ])
        expect(confirmed.confirmedCount).toBe(4)

        const summary = await f.service.summary()
        // Rent 800 + streaming 12.99 fixed; gym 30 not a fixed cost.
        expect(summary.debits.fixed).toEqual({
          yearlyCents: (80_000 + 1_299) * 12,
          monthlyCents: 81_299,
          count: 2,
        })
        expect(summary.debits.variable).toEqual({
          yearlyCents: 36_000,
          monthlyCents: 3_000,
          count: 1,
        })
        expect(summary.debits.subscriptions.count).toBe(1)
        expect(summary.debits.yearlyCents).toBe(
          summary.debits.fixed.yearlyCents +
            summary.debits.variable.yearlyCents,
        )
        expect(summary.debits.monthlyCents).toBe(
          Math.round(summary.debits.yearlyCents / 12),
        )
        expect(summary.credits).toEqual({
          yearlyCents: 3_000_000,
          monthlyCents: 250_000,
          count: 1,
        })
        expect(summary.suggestedCount).toBe(0)
      })
    })

    it('applies a cadence override to the costs and next date', async () => {
      await withFixture(async (f) => {
        await f.insert(
          monthly('2026-10-03', 4, {
            rawLabel: 'PRLV SEPA ASSUREUR EXEMPLE',
            amountCents: -6_000,
          }),
        )
        await f.service.detect(TODAY)
        const [item] = await f.service.list()
        const updated = await f.service.update(item.id, { cadence: 'yearly' })
        expect(updated).toMatchObject({
          cadence: 'yearly',
          detectedCadence: 'monthly',
          cadenceOverridden: true,
          yearlyCostCents: 6_000,
          monthlyEquivalentCents: 500,
        })
        const reset = await f.service.update(item.id, { cadence: 'monthly' })
        expect(reset.cadenceOverridden).toBe(false)
      })
    })

    it('validates updates', async () => {
      await withFixture(async (f) => {
        await expect(
          f.service.update(UNKNOWN_ID, { status: 'confirmed' }),
        ).rejects.toBeInstanceOf(NotFoundException)
        await f.insert(
          monthly('2026-10-03', 4, {
            rawLabel: 'PRLV SEPA ASSUREUR EXEMPLE',
            amountCents: -6_000,
          }),
        )
        await f.service.detect(TODAY)
        const [item] = await f.service.list()
        await expect(
          f.service.update(item.id, { categoryId: UNKNOWN_ID }),
        ).rejects.toBeInstanceOf(BadRequestException)
        const updated = await f.service.update(item.id, {
          categoryId: f.rent,
          isFixedCost: true,
          notes: null,
        })
        expect(updated).toMatchObject({ categoryId: f.rent, isFixedCost: true })
      })
    })

    describe('cancellation (endedOn)', () => {
      /** Streaming (12.99 €, the 12th) and rent confirmed; salary too. */
      async function confirmedHousehold(f: Fixture) {
        await seedHousehold(f)
        await f.service.detect(TODAY)
        const items = await f.service.list()
        await f.service.confirm(items.map((i) => i.id))
        const stream = items.find((i) => i.merchantKey === 'STREAMFLIX')!
        return stream.id
      }

      it('takes a past, today or future end date, and reactivates', async () => {
        await withFixture(async (f) => {
          const id = await confirmedHousehold(f)
          const full = await f.service.summary(TODAY)
          expect(full.debits.subscriptions.count).toBe(1)

          // Future: cancelled after the November charge, still counted.
          const future = await f.service.update(
            id,
            { endedOn: '2026-11-13' },
            TODAY,
          )
          expect(future).toMatchObject({
            endedOn: '2026-11-13',
            ended: false,
            chargedAfterEnd: null,
          })
          expect(await f.service.summary(TODAY)).toEqual(full)
          // The day it ends, it leaves the totals.
          const onEnd = await f.service.summary('2026-11-13')
          expect(onEnd.debits.subscriptions.count).toBe(0)
          expect(onEnd.endedCount).toBe(1)

          // Today and past.
          for (const endedOn of [TODAY, '2026-10-13']) {
            const item = await f.service.update(id, { endedOn }, TODAY)
            expect(item).toMatchObject({ endedOn, ended: true })
            const summary = await f.service.summary(TODAY)
            expect(summary.debits.subscriptions).toEqual({
              monthlyCents: 0,
              yearlyCents: 0,
              count: 0,
            })
            expect(summary.debits.fixed.yearlyCents).toBe(
              full.debits.fixed.yearlyCents - 15_588,
            )
            expect(summary.debits.yearlyCents).toBe(
              full.debits.yearlyCents - 15_588,
            )
            expect(summary.endedCount).toBe(1)
            expect(summary.inactiveCount).toBe(0)
          }

          // Reactivated: counted again.
          const back = await f.service.update(id, { endedOn: null }, TODAY)
          expect(back).toMatchObject({
            endedOn: null,
            ended: false,
            chargedAfterEnd: null,
          })
          expect(await f.service.summary(TODAY)).toEqual(full)
        })
      })

      it('flags a charge booked on or after the end date', async () => {
        await withFixture(async (f) => {
          const id = await confirmedHousehold(f)
          // Cancelled from October 12: the October 12 charge went through.
          const onDay = await f.service.update(id, { endedOn: '2026-10-12' })
          expect(onDay.chargedAfterEnd).toBe('2026-10-12')
          const before = await f.service.update(id, { endedOn: '2026-09-20' })
          expect(before.chargedAfterEnd).toBe('2026-10-12')
          const after = await f.service.update(id, { endedOn: '2026-10-13' })
          expect(after.chargedAfterEnd).toBeNull()
          // The November charge after the end, as the next import brings it.
          await f.insert([
            {
              rawLabel: 'PRLV SEPA STREAMFLIX',
              bookingDate: '2026-11-12',
              amountCents: -1_299,
              categoryId: f.subscriptions,
            },
          ])
          const [charged] = await f.service
            .list('confirmed', '2026-11-14')
            .then((items) => items.filter((i) => i.id === id))
          expect(charged).toMatchObject({
            endedOn: '2026-10-13',
            ended: true,
            chargedAfterEnd: '2026-11-12',
          })
        })
      })

      it('is never changed by a detection run', async () => {
        await withFixture(async (f) => {
          const id = await confirmedHousehold(f)
          await f.service.update(id, { endedOn: '2026-10-13' })
          await f.insert([
            {
              rawLabel: 'PRLV SEPA STREAMFLIX',
              bookingDate: '2026-11-12',
              amountCents: -1_299,
              categoryId: f.subscriptions,
            },
          ])
          await f.service.detect('2026-11-14')
          const [row] = await f.tx
            .select()
            .from(recurringItemsTable)
            .where(eq(recurringItemsTable.id, id))
          expect(row).toMatchObject({
            status: 'confirmed',
            endedOn: '2026-10-13',
            lastSeenDate: '2026-11-12',
          })
        })
      })

      it('accepts an end date on confirmed items only', async () => {
        await withFixture(async (f) => {
          await seedHousehold(f)
          await f.service.detect(TODAY)
          const [item] = await f.service.list('suggested')
          await expect(
            f.service.update(item.id, { endedOn: '2026-11-13' }),
          ).rejects.toBeInstanceOf(BadRequestException)
          await f.service.update(item.id, { status: 'dismissed' })
          await expect(
            f.service.update(item.id, { endedOn: null }),
          ).rejects.toBeInstanceOf(BadRequestException)
          // Confirmed and cancelled in one request.
          const confirmed = await f.service.update(item.id, {
            status: 'confirmed',
            endedOn: '2026-11-13',
          })
          expect(confirmed.endedOn).toBe('2026-11-13')
          // Dismissing it is not a cancellation.
          await expect(
            f.service.update(item.id, {
              status: 'dismissed',
              endedOn: '2026-11-14',
            }),
          ).rejects.toBeInstanceOf(BadRequestException)
          // Dismissed, it loses its end date (a database rule since #367).
          const dismissed = await f.service.update(item.id, {
            status: 'dismissed',
          })
          expect(dismissed).toMatchObject({
            status: 'dismissed',
            endedOn: null,
          })
        })
      })
    })

    it('marks a confirmed series inactive once it stops', async () => {
      await withFixture(async (f) => {
        await f.insert(
          monthly('2026-07-09', 6, {
            rawLabel: 'PRLV SEPA VIDEO EXEMPLE',
            amountCents: -899,
          }),
        )
        await f.service.detect(TODAY)
        const [item] = await f.service.list()
        await f.service.update(item.id, { status: 'confirmed' })
        // Three more months of data, without the subscription.
        await f.insert([
          { rawLabel: 'PRLV SEPA AUTRE EXEMPLE', bookingDate: '2026-10-20' },
        ])
        const [after] = await f.service.list('confirmed')
        expect(after.active).toBe(false)
        expect((await f.service.summary()).inactiveCount).toBe(1)
        // Inactive series are not suggested; the confirmed one is kept.
        const result = await f.service.detect(TODAY)
        expect(result.removedCount).toBe(0)
        expect(await f.service.list()).toHaveLength(1)
      })
    })

    describe('prepaid subscriptions (#314)', () => {
      const VPS = 'PRLV SEPA HEBERGEUR VPS EXEMPLE'

      async function paymentId(f: Fixture, date: string): Promise<string> {
        const [row] = await f.tx
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(eq(transactionsTable.bookingDate, date))
        return row.id
      }

      it('declares a debit as a 24-month plan: monthly cost, renewal, totals', async () => {
        await withFixture(async (f) => {
          await f.insert([
            {
              rawLabel: VPS,
              bookingDate: '2025-11-07',
              amountCents: -18_000,
              categoryId: f.subscriptions,
            },
          ])
          const { item, previousStatus } = await f.service.declarePrepaid(
            { transactionId: await paymentId(f, '2025-11-07'), termMonths: 24 },
            TODAY,
          )
          expect(previousStatus).toBeNull()
          expect(item).toMatchObject({
            status: 'confirmed',
            termMonths: 24,
            isFixedCost: true,
            isSubscription: true,
            typicalAmountCents: 18_000,
            monthlyEquivalentCents: 750,
            yearlyCostCents: 9_000,
            renewalDate: '2027-11-07',
            nextExpectedDate: '2027-11-07',
            active: true,
            occurrenceCount: 1,
            renewalReminder: false,
          })
          const summary = await f.service.summary(TODAY)
          expect(summary.debits.subscriptions).toEqual({
            monthlyCents: 750,
            yearlyCents: 9_000,
            count: 1,
          })
          // The payment counts as a one-off in averages.
          const [line] = await f.tx
            .select({
              isOneOff: transactionLinesView.isOneOff,
              prepaidItemId: transactionLinesView.prepaidItemId,
            })
            .from(transactionLinesView)
          expect(line).toEqual({ isOneOff: true, prepaidItemId: item.id })
        })
      })

      it('never lets a detection run overwrite the term', async () => {
        await withFixture(async (f) => {
          // Two yearly charges: the detector sees a yearly series.
          await f.insert([
            { rawLabel: VPS, bookingDate: '2024-11-07', amountCents: -9_000 },
            { rawLabel: VPS, bookingDate: '2025-11-07', amountCents: -9_000 },
          ])
          await f.service.detect(TODAY)
          const [suggested] = await f.service.list('suggested', TODAY)
          expect(suggested.cadence).toBe('yearly')
          const { item, previousStatus } = await f.service.declarePrepaid(
            { transactionId: await paymentId(f, '2025-11-07'), termMonths: 12 },
            TODAY,
          )
          expect(previousStatus).toBe('suggested')
          expect(item.id).toBe(suggested.id)
          await f.service.detect(TODAY)
          const [after] = await f.service.list(undefined, TODAY)
          expect(after).toMatchObject({
            status: 'confirmed',
            termMonths: 12,
            renewalDate: '2026-11-07',
            monthlyEquivalentCents: 750,
            occurrenceCount: 1,
          })
        })
      })

      it('attaches a charge within the renewal window as the next payment', async () => {
        await withFixture(async (f) => {
          await f.insert([
            { rawLabel: VPS, bookingDate: '2024-11-29', amountCents: -24_000 },
            // Too early for the renewal (2025-11-29 ± 30 days).
            { rawLabel: VPS, bookingDate: '2025-06-03', amountCents: -1_500 },
          ])
          const { item } = await f.service.declarePrepaid(
            { transactionId: await paymentId(f, '2024-11-29'), termMonths: 12 },
            TODAY,
          )
          expect(item.renewalDate).toBe('2025-11-29')
          await f.insert([
            { rawLabel: VPS, bookingDate: '2025-12-02', amountCents: -26_400 },
          ])
          await f.service.detect(TODAY)
          const [after] = await f.service.list('confirmed', TODAY)
          expect(after).toMatchObject({
            occurrenceCount: 2,
            typicalAmountCents: 26_400,
            priceChangeCents: 2_400,
            lastSeenDate: '2025-12-02',
            renewalDate: '2026-12-02',
            monthlyEquivalentCents: 2_200,
            // At most 30 days before the renewal: keep or cancel it.
            renewalReminder: true,
          })
          const early = await f.service.list('confirmed', '2026-11-01')
          expect(early[0].renewalReminder).toBe(false)
          const kept = await f.service.update(
            after.id,
            { keepRenewal: true },
            '2026-11-02',
          )
          expect(kept.renewalReminder).toBe(false)
          // Cancelled at the renewal: nothing expected on or after it.
          const ended = await f.service.update(
            after.id,
            { endedOn: '2026-12-02', keepRenewal: false },
            '2026-11-02',
          )
          expect(ended).toMatchObject({ ended: false, renewalReminder: false })
        })
      })

      it('refuses anything but an expense, and a payment declared twice', async () => {
        await withFixture(async (f) => {
          await f.insert([
            {
              rawLabel: 'VIR SEPA EMPLOYEUR EXEMPLE',
              bookingDate: '2026-10-28',
              amountCents: 250_000,
              kind: 'income',
            },
            { rawLabel: VPS, bookingDate: '2026-10-07', amountCents: -18_000 },
          ])
          await expect(
            f.service.declarePrepaid(
              {
                transactionId: await paymentId(f, '2026-10-28'),
                termMonths: 12,
              },
              TODAY,
            ),
          ).rejects.toBeInstanceOf(BadRequestException)
          const transactionId = await paymentId(f, '2026-10-07')
          await f.service.declarePrepaid(
            { transactionId, termMonths: 24 },
            TODAY,
          )
          await expect(
            f.service.declarePrepaid({ transactionId, termMonths: 12 }, TODAY),
          ).rejects.toBeInstanceOf(ConflictException)
          await expect(
            f.service.declarePrepaid(
              { transactionId: UNKNOWN_ID, termMonths: 12 },
              TODAY,
            ),
          ).rejects.toBeInstanceOf(NotFoundException)
        })
      })

      it('changes the term, makes the item ordinary again, removes it', async () => {
        await withFixture(async (f) => {
          await f.insert([
            { rawLabel: VPS, bookingDate: '2026-10-07', amountCents: -18_000 },
          ])
          const transactionId = await paymentId(f, '2026-10-07')
          const { item } = await f.service.declarePrepaid(
            { transactionId, termMonths: 24 },
            TODAY,
          )
          const longer = await f.service.update(
            item.id,
            { termMonths: 36 },
            TODAY,
          )
          expect(longer).toMatchObject({
            monthlyEquivalentCents: 500,
            renewalDate: '2029-10-07',
          })
          const ordinary = await f.service.update(
            item.id,
            { termMonths: null },
            TODAY,
          )
          expect(ordinary).toMatchObject({
            termMonths: null,
            renewalDate: null,
          })
          const [linked] = await f.tx
            .select({ prepaidItemId: transactionsTable.prepaidItemId })
            .from(transactionsTable)
          expect(linked.prepaidItemId).toBeNull()
          // Setting a term again links the latest debit of the series.
          const again = await f.service.update(
            item.id,
            { termMonths: 12 },
            TODAY,
          )
          expect(again).toMatchObject({
            occurrenceCount: 1,
            renewalDate: '2027-10-07',
          })
          await expect(
            f.service.update(
              item.id,
              { keepRenewal: true, termMonths: null },
              TODAY,
            ),
          ).rejects.toBeInstanceOf(BadRequestException)
          await f.service.remove(item.id)
          expect(await f.service.list(undefined, TODAY)).toHaveLength(0)
        })
      })
    })

    describe('quarterly and yearly charges as prepaid ones (#439)', () => {
      const INSURANCE = 'PRLV SEPA ASSURANCE HABITATION EXEMPLE'
      const WATER = 'PRLV SEPA EAU EXEMPLE'

      /** Every line of the transactions, as the statistics read them. */
      async function lines(f: Fixture) {
        return f.tx
          .select({
            date: transactionLinesView.bookingDate,
            amountCents: transactionLinesView.amountCents,
            isOneOff: transactionLinesView.isOneOff,
            prepaidItemId: transactionLinesView.prepaidItemId,
          })
          .from(transactionLinesView)
          .orderBy(transactionLinesView.bookingDate)
      }

      it('makes a confirmed yearly series prepaid for 12 months', async () => {
        await withFixture(async (f) => {
          await f.insert([
            {
              rawLabel: INSURANCE,
              bookingDate: '2024-11-25',
              amountCents: -12_000,
            },
            {
              rawLabel: INSURANCE,
              bookingDate: '2025-11-25',
              amountCents: -12_000,
            },
          ])
          await f.service.detect(TODAY)
          const [suggested] = await f.service.list('suggested', TODAY)
          expect(suggested).toMatchObject({
            cadence: 'yearly',
            termMonths: null,
          })
          const before = {
            yearly: suggested.yearlyCostCents,
            monthly: suggested.monthlyEquivalentCents,
          }

          expect(
            (await f.service.confirm([suggested.id], TODAY)).confirmedCount,
          ).toBe(1)
          const [item] = await f.service.list('confirmed', TODAY)
          expect(item).toMatchObject({
            termMonths: 12,
            occurrenceCount: 2,
            renewalDate: '2026-11-25',
            nextExpectedDate: '2026-11-25',
            // 19 days before the renewal: keep or cancel it.
            renewalReminder: true,
            active: true,
            yearlyCostCents: before.yearly,
            monthlyEquivalentCents: before.monthly,
          })
          // From 30 days before the renewal, not 31.
          expect(
            (await f.service.list('confirmed', '2026-10-25'))[0]
              .renewalReminder,
          ).toBe(false)
          expect(
            (await f.service.list('confirmed', '2026-10-26'))[0]
              .renewalReminder,
          ).toBe(true)
          // Each charge counted once, in its month, out of averages.
          expect(await lines(f)).toEqual([
            {
              date: '2024-11-25',
              amountCents: -12_000,
              isOneOff: true,
              prepaidItemId: item.id,
            },
            {
              date: '2025-11-25',
              amountCents: -12_000,
              isOneOff: true,
              prepaidItemId: item.id,
            },
          ])
          // The totals count it once a year, as before.
          const summary = await f.service.summary(TODAY)
          expect(summary.debits.yearlyCents).toBe(before.yearly)
          expect(summary.debits.count).toBe(1)
          // A detection run keeps it as it is.
          await f.service.detect(TODAY)
          expect((await f.service.list('confirmed', TODAY))[0]).toMatchObject({
            termMonths: 12,
            occurrenceCount: 2,
          })
        })
      })

      it('makes a quarterly series prepaid for 3 months, from the editor too', async () => {
        await withFixture(async (f) => {
          await f.insert(
            ['2026-02-10', '2026-05-10', '2026-08-10'].map((bookingDate) => ({
              rawLabel: WATER,
              bookingDate,
              amountCents: -9_000,
            })),
          )
          await f.service.detect(TODAY)
          const [suggested] = await f.service.list('suggested', TODAY)
          expect(suggested.cadence).toBe('quarterly')
          const item = await f.service.update(
            suggested.id,
            { name: 'Eau', status: 'confirmed' },
            TODAY,
          )
          expect(item).toMatchObject({
            status: 'confirmed',
            termMonths: 3,
            occurrenceCount: 3,
            renewalDate: '2026-11-10',
            renewalReminder: true,
            yearlyCostCents: suggested.yearlyCostCents,
            monthlyEquivalentCents: 3_000,
          })
          expect(
            (await lines(f)).every(
              (l) => l.isOneOff && l.prepaidItemId === item.id,
            ),
          ).toBe(true)
        })
      })

      it('leaves monthly series and credits alone', async () => {
        await withFixture(async (f) => {
          await seedHousehold(f)
          await f.service.detect(TODAY)
          const items = await f.service.list(undefined, TODAY)
          await f.service.confirm(
            items.map((i) => i.id),
            TODAY,
          )
          for (const item of await f.service.list(undefined, TODAY)) {
            expect(item.termMonths).toBeNull()
          }
          expect((await lines(f)).some((l) => l.prepaidItemId !== null)).toBe(
            false,
          )
        })
      })

      it('keeps the owner’s choice: the term cleared stays cleared', async () => {
        await withFixture(async (f) => {
          await f.insert([
            {
              rawLabel: INSURANCE,
              bookingDate: '2024-11-25',
              amountCents: -12_000,
            },
            {
              rawLabel: INSURANCE,
              bookingDate: '2025-11-25',
              amountCents: -12_000,
            },
          ])
          await f.service.detect(TODAY)
          const [suggested] = await f.service.list('suggested', TODAY)
          // Confirmed and made ordinary in one request.
          const ordinary = await f.service.update(
            suggested.id,
            { status: 'confirmed', termMonths: null },
            TODAY,
          )
          expect(ordinary).toMatchObject({
            status: 'confirmed',
            termMonths: null,
          })
          await f.service.detect(TODAY)
          expect(
            (await f.service.list('confirmed', TODAY))[0].termMonths,
          ).toBeNull()
          expect((await lines(f)).some((l) => l.prepaidItemId !== null)).toBe(
            false,
          )
        })
      })

      it('clears the term when the item leaves « confirmé »', async () => {
        await withFixture(async (f) => {
          await f.insert([
            {
              rawLabel: INSURANCE,
              bookingDate: '2024-11-25',
              amountCents: -12_000,
            },
            {
              rawLabel: INSURANCE,
              bookingDate: '2025-11-25',
              amountCents: -12_000,
            },
          ])
          await f.service.detect(TODAY)
          const [suggested] = await f.service.list('suggested', TODAY)
          await f.service.confirm([suggested.id], TODAY)
          const back = await f.service.update(
            suggested.id,
            { status: 'suggested' },
            TODAY,
          )
          expect(back).toMatchObject({
            status: 'suggested',
            termMonths: null,
            renewalReminder: false,
          })
          expect((await lines(f)).some((l) => l.prepaidItemId !== null)).toBe(
            false,
          )
          // A term confirms the item it is set on; never with another status.
          await expect(
            f.service.update(
              suggested.id,
              { status: 'dismissed', termMonths: 12 },
              TODAY,
            ),
          ).rejects.toBeInstanceOf(BadRequestException)
          const prepaid = await f.service.update(
            suggested.id,
            { termMonths: 12 },
            TODAY,
          )
          expect(prepaid).toMatchObject({ status: 'confirmed', termMonths: 12 })
        })
      })

      it('links the series of a prepaid item without payment on detection', async () => {
        await withFixture(async (f) => {
          await f.insert([
            {
              rawLabel: INSURANCE,
              bookingDate: '2024-11-25',
              amountCents: -12_000,
            },
            {
              rawLabel: INSURANCE,
              bookingDate: '2025-11-25',
              amountCents: -12_000,
            },
          ])
          await f.service.detect(TODAY)
          // As the migration leaves a confirmed yearly item.
          await f.tx
            .update(recurringItemsTable)
            .set({ status: 'confirmed', termMonths: 12 })
          await f.service.detect(TODAY)
          const [item] = await f.service.list('confirmed', TODAY)
          expect(item).toMatchObject({ termMonths: 12, occurrenceCount: 2 })
          expect(
            (await lines(f)).every((l) => l.prepaidItemId === item.id),
          ).toBe(true)
        })
      })
    })
  },
)

describe('amountRuns', () => {
  const at = (date: string, amountCents: number) => ({ date, amountCents })

  it('groups consecutive equal amounts, newest first, at most four runs', () => {
    expect(amountRuns([])).toEqual([])
    expect(
      amountRuns([
        at('2026-01-05', 100),
        at('2026-02-05', 100),
        at('2026-03-05', 120),
        at('2026-04-05', 100),
        at('2026-05-05', 130),
        at('2026-06-05', 140),
        at('2026-07-05', 140),
      ]),
    ).toEqual([
      { amountCents: 140, from: '2026-06-05', to: '2026-07-05', count: 2 },
      { amountCents: 130, from: '2026-05-05', to: '2026-05-05', count: 1 },
      { amountCents: 100, from: '2026-04-05', to: '2026-04-05', count: 1 },
      { amountCents: 120, from: '2026-03-05', to: '2026-03-05', count: 1 },
    ])
  })
})
