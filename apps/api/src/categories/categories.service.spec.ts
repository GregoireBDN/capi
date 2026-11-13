import '#/load-env'
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  budgetsTable,
  categoriesTable,
  categorizationRulesTable,
  deletedDefaultCategoriesTable,
  recurringItemsTable,
  transactionsTable,
} from '#/database/schema'
import type { SelectCategory } from './categories.schema'
import { CategoriesService, compareCategories } from './categories.service'
import { seedDefaultCategories } from './seed-default-categories'

function category(kind: SelectCategory['kind'], name: string): SelectCategory {
  const now = new Date('2026-01-01T00:00:00Z')
  return {
    id: name,
    slug: name,
    name,
    kind,
    color: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

describe('compareCategories', () => {
  it('orders by kind, then by name with French collation', () => {
    const sorted = [
      category('transfer', 'Virement interne'),
      category('transfer', 'Épargne'),
      category('income', 'Salaire'),
      category('expense', 'Loyer'),
      category('expense', 'Énergie'),
      category('expense', 'abonnements'),
    ].sort(compareCategories)

    expect(sorted.map((c) => `${c.kind}/${c.name}`)).toEqual([
      'expense/abonnements',
      'expense/Énergie',
      'expense/Loyer',
      'income/Salaire',
      'transfer/Épargne',
      'transfer/Virement interne',
    ])
  })
})

/**
 * Integration checks against the migrated test database. Each test starts from
 * empty category-related tables inside a transaction that is rolled back.
 * Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

describe.skipIf(!process.env.DATABASE_URL)(
  'CategoriesService (database)',
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
      service: CategoriesService
      accountId: string
    }

    async function withFixture(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          await tx.delete(transactionsTable)
          await tx.delete(recurringItemsTable)
          await tx.delete(budgetsTable)
          await tx.delete(categorizationRulesTable)
          await tx.delete(categoriesTable)
          await tx.delete(deletedDefaultCategoriesTable)
          const [account] = await tx
            .insert(accountsTable)
            .values({ name: 'Test checking', type: 'checking' })
            .returning()
          // The service only reads `db`; the transaction stands in for it, and
          // its own transactions become savepoints.
          const service = new CategoriesService({ db: tx } as never)
          await fn({ tx, service, accountId: account.id })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    let hash = 0
    async function addTransaction(
      tx: Tx,
      accountId: string,
      categoryId: string | null,
    ) {
      hash++
      const [row] = await tx
        .insert(transactionsTable)
        .values({
          accountId,
          bookingDate: '2026-01-15',
          amountCents: -1_234,
          rawLabel: 'PAIEMENT CB TESTVILLE FAKEMART',
          kind: 'expense',
          categoryId,
          dedupeHash: `category-test-${hash}`,
        })
        .returning()
      return row
    }

    describe('create', () => {
      it('generates a slug from the name and keeps default slugs reserved', async () => {
        await withFixture(async ({ service }) => {
          const velo = await service.create({
            name: 'Vélo & sport',
            kind: 'expense',
            color: '#2a78d6',
          })
          // `transport` is a default slug: reserved even when not seeded.
          const transport = await service.create({
            name: 'Transport',
            kind: 'expense',
            color: '#eb6834',
          })

          expect(velo).toMatchObject({
            slug: 'velo_sport',
            name: 'Vélo & sport',
            kind: 'expense',
            color: '#2a78d6',
            archivedAt: null,
          })
          expect(transport.slug).toBe('transport_2')
        })
      })

      it('adds a suffix when the slug is taken by another name', async () => {
        await withFixture(async ({ service }) => {
          await service.create({
            name: 'Vélo',
            kind: 'expense',
            color: '#2a78d6',
          })
          const other = await service.create({
            name: 'Velo !',
            kind: 'expense',
            color: '#2a78d6',
          })
          expect(other.slug).toBe('velo_2')
        })
      })

      it('refuses a name already used, ignoring case and accents', async () => {
        await withFixture(async ({ service }) => {
          await service.create({
            name: 'Crèche',
            kind: 'expense',
            color: '#2a78d6',
          })
          await expect(
            service.create({
              name: ' creche ',
              kind: 'income',
              color: '#2a78d6',
            }),
          ).rejects.toBeInstanceOf(ConflictException)
        })
      })
    })

    describe('update', () => {
      it('renames, recolours, archives and restores', async () => {
        await withFixture(async ({ service }) => {
          const category = await service.create({
            name: 'Test',
            kind: 'expense',
            color: '#2a78d6',
          })

          const renamed = await service.update(category.id, {
            name: 'Test renamed',
            color: '#e34948',
          })
          expect(renamed).toMatchObject({
            slug: category.slug,
            name: 'Test renamed',
            color: '#e34948',
            archivedAt: null,
          })

          const archived = await service.update(category.id, { archived: true })
          expect(archived.archivedAt).toBeInstanceOf(Date)
          const again = await service.update(category.id, { archived: true })
          expect(again.archivedAt).toEqual(archived.archivedAt)
          expect(await service.list()).toEqual([again])

          const restored = await service.update(category.id, {
            archived: false,
          })
          expect(restored.archivedAt).toBeNull()
        })
      })

      it('refuses a name used by another category but accepts its own', async () => {
        await withFixture(async ({ service }) => {
          const a = await service.create({
            name: 'A',
            kind: 'expense',
            color: '#2a78d6',
          })
          await service.create({ name: 'B', kind: 'expense', color: '#2a78d6' })

          await expect(
            service.update(a.id, { name: 'b' }),
          ).rejects.toBeInstanceOf(ConflictException)
          await expect(
            service.update(a.id, { name: 'a' }),
          ).resolves.toMatchObject({
            name: 'a',
          })
        })
      })

      it('changes the kind only while no transaction or budget uses it', async () => {
        await withFixture(async ({ tx, service, accountId }) => {
          const category = await service.create({
            name: 'Test',
            kind: 'expense',
            color: '#2a78d6',
          })
          await expect(
            service.update(category.id, { kind: 'income' }),
          ).resolves.toMatchObject({ kind: 'income' })

          await addTransaction(tx, accountId, category.id)
          await expect(
            service.update(category.id, { kind: 'expense' }),
          ).rejects.toBeInstanceOf(ConflictException)
        })
      })

      it('answers 404 for an unknown category', async () => {
        await withFixture(async ({ service }) => {
          await expect(
            service.update('00000000-0000-4000-8000-000000000000', {
              name: 'X',
            }),
          ).rejects.toBeInstanceOf(NotFoundException)
        })
      })
    })

    describe('remove', () => {
      async function inUse({ tx, service, accountId }: Fixture) {
        const source = await service.create({
          name: 'Source',
          kind: 'expense',
          color: '#2a78d6',
        })
        const target = await service.create({
          name: 'Target',
          kind: 'expense',
          color: '#eb6834',
        })
        const t1 = await addTransaction(tx, accountId, source.id)
        const t2 = await addTransaction(tx, accountId, source.id)
        const untouched = await addTransaction(tx, accountId, target.id)
        const [rule] = await tx
          .insert(categorizationRulesTable)
          .values({
            position: 0,
            labelPattern: 'FAKEMART',
            categoryId: source.id,
          })
          .returning()
        const [recurring] = await tx
          .insert(recurringItemsTable)
          .values({
            accountId,
            merchantKey: 'FAKEMART',
            direction: 'debit',
            name: 'Fakemart',
            categoryId: source.id,
            isFixedCost: false,
            cadence: 'monthly',
            amountType: 'fixed',
            typicalAmountCents: 1_234,
            confidence: 0.9,
            lastSeenDate: '2026-01-15',
          })
          .returning()
        await tx.insert(budgetsTable).values([
          {
            categoryId: source.id,
            effectiveFrom: '2026-01-01',
            monthlyTargetCents: 10_000,
          },
          {
            categoryId: target.id,
            effectiveFrom: '2026-03-01',
            monthlyTargetCents: 20_000,
          },
        ])
        return { source, target, t1, t2, untouched, rule, recurring }
      }

      it('moves transactions, rules, recurring items and budgets to the target', async () => {
        await withFixture(async (f) => {
          const { tx, service } = f
          const { source, target, t1, t2, untouched, rule, recurring } =
            await inUse(f)

          expect(await service.usage(source.id)).toEqual({
            transactions: 2,
            rules: 1,
            budgets: 1,
            recurringItems: 1,
          })

          await service.remove(source.id, target.id)

          const transactions = await tx
            .select({
              id: transactionsTable.id,
              categoryId: transactionsTable.categoryId,
            })
            .from(transactionsTable)
          expect(transactions).toHaveLength(3)
          expect(transactions.every((t) => t.categoryId === target.id)).toBe(
            true,
          )
          expect(transactions.map((t) => t.id).sort()).toEqual(
            [t1.id, t2.id, untouched.id].sort(),
          )
          const [movedRule] = await tx
            .select()
            .from(categorizationRulesTable)
            .where(eq(categorizationRulesTable.id, rule.id))
          expect(movedRule.categoryId).toBe(target.id)
          const [movedRecurring] = await tx
            .select()
            .from(recurringItemsTable)
            .where(eq(recurringItemsTable.id, recurring.id))
          expect(movedRecurring.categoryId).toBe(target.id)
          const budgets = await tx
            .select({
              categoryId: budgetsTable.categoryId,
              effectiveFrom: budgetsTable.effectiveFrom,
              monthlyTargetCents: budgetsTable.monthlyTargetCents,
            })
            .from(budgetsTable)
            .orderBy(asc(budgetsTable.effectiveFrom))
          expect(budgets).toEqual([
            {
              categoryId: target.id,
              effectiveFrom: '2026-01-01',
              monthlyTargetCents: 10_000,
            },
            {
              categoryId: target.id,
              effectiveFrom: '2026-03-01',
              monthlyTargetCents: 30_000,
            },
          ])
          expect((await service.list()).map((c) => c.id)).toEqual([target.id])
        })
      })

      it('refuses to delete a category in use without a target, changing nothing', async () => {
        await withFixture(async (f) => {
          const { tx, service } = f
          const { source } = await inUse(f)

          await expect(service.remove(source.id)).rejects.toBeInstanceOf(
            ConflictException,
          )
          const left = await tx
            .select()
            .from(transactionsTable)
            .where(eq(transactionsTable.categoryId, source.id))
          expect(left).toHaveLength(2)
        })
      })

      it('refuses a target of another kind, itself or unknown', async () => {
        await withFixture(async (f) => {
          const { service } = f
          const { source } = await inUse(f)
          const income = await service.create({
            name: 'Income',
            kind: 'income',
            color: '#1baf7a',
          })

          for (const target of [
            income.id,
            source.id,
            '00000000-0000-4000-8000-000000000000',
          ]) {
            await expect(
              service.remove(source.id, target),
            ).rejects.toBeInstanceOf(BadRequestException)
          }
          expect(await service.usage(source.id)).toMatchObject({
            transactions: 2,
          })
        })
      })

      it('deletes an unused category without a target', async () => {
        await withFixture(async ({ service }) => {
          const category = await service.create({
            name: 'Unused',
            kind: 'transfer',
            color: '#2a78d6',
          })
          await service.remove(category.id)
          expect(await service.list()).toEqual([])
          await expect(service.remove(category.id)).rejects.toBeInstanceOf(
            NotFoundException,
          )
        })
      })

      it('keeps a deleted default category from being seeded again', async () => {
        await withFixture(async ({ tx, service }) => {
          await seedDefaultCategories(tx)
          const custom = await service.create({
            name: 'Custom',
            kind: 'expense',
            color: '#2a78d6',
          })
          const [rent] = await tx
            .select()
            .from(categoriesTable)
            .where(eq(categoriesTable.slug, 'rent'))
          await service.remove(rent.id)

          const result = await seedDefaultCategories(tx)

          expect(result).toMatchObject({ inserted: 0, deleted: 1 })
          const slugs = (await service.list()).map((c) => c.slug)
          expect(slugs).not.toContain('rent')
          expect(slugs).toContain(custom.slug)
          // Its slug stays reserved for new categories too.
          const loyer = await service.create({
            name: 'rent',
            kind: 'expense',
            color: '#2a78d6',
          })
          expect(loyer.slug).toBe('rent_2')
        })
      })
    })
  },
)
