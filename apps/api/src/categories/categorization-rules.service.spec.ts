import '#/load-env'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  categorizationRulesTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import {
  APPLY_CHUNK_SIZE,
  CategorizationRulesService,
} from './categorization-rules.service'

/**
 * Integration checks against the migrated database (see
 * `domain-schema.spec.ts`). Each test starts from empty rule and transaction
 * tables inside a transaction that is rolled back, so the local database is
 * left untouched. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

describe.skipIf(!process.env.DATABASE_URL)(
  'CategorizationRulesService (database)',
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
      service: CategorizationRulesService
      accountId: string
      groceries: string
      salary: string
      savings: string
    }

    async function withFixture(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          await tx.delete(transactionsTable)
          await tx.delete(categorizationRulesTable)
          const [account] = await tx
            .insert(accountsTable)
            .values({ name: 'Test checking', type: 'checking' })
            .returning()
          const categories = await tx
            .insert(categoriesTable)
            .values([
              {
                slug: 'test_groceries',
                name: 'Test groceries',
                kind: 'expense',
              },
              { slug: 'test_salary', name: 'Test salary', kind: 'income' },
              { slug: 'test_savings', name: 'Test savings', kind: 'transfer' },
            ])
            .returning()
          const bySlug = new Map(categories.map((c) => [c.slug, c.id]))
          // The service only reads `db`; the transaction stands in for it, and
          // its own transactions become savepoints.
          const service = new CategorizationRulesService({ db: tx } as never)
          await fn({
            tx,
            service,
            accountId: account.id,
            groceries: bySlug.get('test_groceries')!,
            salary: bySlug.get('test_salary')!,
            savings: bySlug.get('test_savings')!,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    let hash = 0
    function transaction(
      accountId: string,
      overrides: Partial<InsertTransaction> = {},
    ) {
      hash++
      return {
        accountId,
        bookingDate: '2026-01-15',
        amountCents: -1_234,
        rawLabel: 'PAIEMENT CB 1501 TESTVILLE FAKEMART CARTE 4XXX0000',
        kind: 'expense',
        dedupeHash: `test-hash-${hash}`,
        ...overrides,
      } satisfies InsertTransaction
    }

    async function reload(tx: Tx, id: string) {
      const [row] = await tx
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, id))
      return row
    }

    describe('create', () => {
      it('rejects an invalid regex with a clear 400 and saves nothing', async () => {
        await withFixture(async ({ tx, service, groceries }) => {
          const attempt = service.create({
            matchType: 'regex',
            labelPattern: 'FAKEMART (',
            categoryId: groceries,
          })

          await expect(attempt).rejects.toBeInstanceOf(BadRequestException)
          await expect(attempt).rejects.toThrow(
            /^labelPattern is not a valid regular expression: /,
          )
          expect(await tx.select().from(categorizationRulesTable)).toHaveLength(
            0,
          )
        })
      })

      it('rejects min > max, an unknown category or an unknown account', async () => {
        await withFixture(async ({ service, groceries }) => {
          await expect(
            service.create({
              labelPattern: 'FAKEMART',
              categoryId: groceries,
              minAmountCents: -100,
              maxAmountCents: -200,
            }),
          ).rejects.toThrow(/minAmountCents must be less than or equal/)
          await expect(
            service.create({
              labelPattern: 'FAKEMART',
              categoryId: '00000000-0000-4000-8000-000000000000',
            }),
          ).rejects.toThrow(/categoryId does not match any category/)
          await expect(
            service.create({
              labelPattern: 'FAKEMART',
              categoryId: groceries,
              accountId: '00000000-0000-4000-8000-000000000000',
            }),
          ).rejects.toThrow(/accountId does not match any account/)
        })
      })

      it('appends rules at the end with defaults', async () => {
        await withFixture(async ({ service, groceries, salary }) => {
          const first = await service.create({
            labelPattern: 'FAKEMART',
            categoryId: groceries,
            merchant: '',
          })
          const second = await service.create({
            matchType: 'regex',
            labelPattern: '^VIR .* FAKE EMPLOYER',
            categoryId: salary,
          })

          expect(first).toMatchObject({
            position: 0,
            enabled: true,
            matchType: 'contains',
            accountId: null,
            kind: null,
            merchant: null,
          })
          expect(second.position).toBe(1)
        })
      })
    })

    describe('update', () => {
      it('validates the merged rule', async () => {
        await withFixture(async ({ service, groceries }) => {
          const rule = await service.create({
            labelPattern: 'FAKEMART [',
            categoryId: groceries,
            minAmountCents: -500,
          })

          // Valid as `contains`, invalid once switched to `regex`.
          await expect(
            service.update(rule.id, { matchType: 'regex' }),
          ).rejects.toThrow(/not a valid regular expression/)
          await expect(
            service.update(rule.id, { maxAmountCents: -600 }),
          ).rejects.toThrow(/minAmountCents must be less than or equal/)

          const updated = await service.update(rule.id, {
            labelPattern: 'FAKEMART',
            minAmountCents: null,
            kind: 'transfer',
          })
          expect(updated).toMatchObject({
            labelPattern: 'FAKEMART',
            minAmountCents: null,
            kind: 'transfer',
            matchType: 'contains',
          })
        })
      })

      it('404s on an unknown rule', async () => {
        await withFixture(async ({ service }) => {
          await expect(
            service.update('00000000-0000-4000-8000-000000000000', {
              enabled: false,
            }),
          ).rejects.toBeInstanceOf(NotFoundException)
        })
      })
    })

    describe('reorder', () => {
      it('sets positions from the order of the ids', async () => {
        await withFixture(async ({ service, groceries }) => {
          const a = await service.create({
            labelPattern: 'AAA',
            categoryId: groceries,
          })
          const b = await service.create({
            labelPattern: 'BBB',
            categoryId: groceries,
          })
          const c = await service.create({
            labelPattern: 'CCC',
            categoryId: groceries,
          })

          const reordered = await service.reorder([c.id, a.id, b.id])

          expect(reordered.map((r) => [r.id, r.position])).toEqual([
            [c.id, 0],
            [a.id, 1],
            [b.id, 2],
          ])
          expect((await service.list()).map((r) => r.id)).toEqual([
            c.id,
            a.id,
            b.id,
          ])
        })
      })

      it('rejects a list that is not exactly the current rules', async () => {
        await withFixture(async ({ service, groceries }) => {
          const a = await service.create({
            labelPattern: 'AAA',
            categoryId: groceries,
          })
          const b = await service.create({
            labelPattern: 'BBB',
            categoryId: groceries,
          })
          const unknown = '00000000-0000-4000-8000-000000000000'

          for (const ids of [[a.id], [a.id, b.id, unknown], [a.id, a.id]]) {
            await expect(service.reorder(ids)).rejects.toThrow(
              /every categorization rule exactly once/,
            )
          }
          expect((await service.list()).map((r) => r.id)).toEqual([a.id, b.id])
        })
      })
    })

    describe('apply', () => {
      it('never overwrites a manual category and re-runs rule-made ones', async () => {
        await withFixture(
          async ({ tx, service, accountId, groceries, salary, savings }) => {
            const staleRule = await service.create({
              labelPattern: 'NO LONGER MATCHES',
              categoryId: salary,
            })
            const transferRule = await service.create({
              labelPattern: 'VIR LIVRET TEST',
              categoryId: groceries,
              kind: 'transfer',
            })
            const groceriesRule = await service.create({
              labelPattern: 'fakemart',
              categoryId: groceries,
              merchant: 'Fakemart',
            })

            const [manual, uncategorized, transfer, ruleMade, unmatched] =
              await tx
                .insert(transactionsTable)
                .values([
                  // Filed by hand under savings: must stay as is.
                  transaction(accountId, {
                    categoryId: savings,
                    kind: 'transfer',
                  }),
                  transaction(accountId, { needsReview: true }),
                  transaction(accountId, {
                    rawLabel: 'VIR LIVRET TEST 0000000',
                    amountCents: -50_000,
                  }),
                  // Categorized by a rule that no longer matches it.
                  transaction(accountId, {
                    rawLabel: 'PRLV SEPA FAKEMART REF 42',
                    categoryId: salary,
                    ruleId: staleRule.id,
                    kind: 'income',
                  }),
                  transaction(accountId, {
                    rawLabel: 'VIR SEPA RECU /DE NOBODY',
                    amountCents: 10_000,
                    categoryId: salary,
                    ruleId: staleRule.id,
                    kind: 'income',
                  }),
                ])
                .returning()

            const result = await service.apply()

            expect(result).toEqual({
              scanned: 4,
              matched: 3,
              unmatched: 1,
              updated: 4,
              manualSkipped: 1,
            })
            expect(await reload(tx, manual.id)).toMatchObject({
              categoryId: savings,
              ruleId: null,
              kind: 'transfer',
              merchant: null,
            })
            expect(await reload(tx, uncategorized.id)).toMatchObject({
              categoryId: groceries,
              ruleId: groceriesRule.id,
              kind: 'expense',
              merchant: 'Fakemart',
              needsReview: false,
            })
            expect(await reload(tx, transfer.id)).toMatchObject({
              categoryId: groceries,
              ruleId: transferRule.id,
              kind: 'transfer',
            })
            expect(await reload(tx, ruleMade.id)).toMatchObject({
              categoryId: groceries,
              ruleId: groceriesRule.id,
              kind: 'expense',
            })
            expect(await reload(tx, unmatched.id)).toMatchObject({
              categoryId: null,
              ruleId: null,
              kind: 'income',
              needsReview: true,
            })

            // Idempotent: a second run changes nothing.
            expect((await service.apply()).updated).toBe(0)
          },
        )
      })

      it('processes more transactions than one chunk', async () => {
        await withFixture(async ({ tx, service, accountId, groceries }) => {
          await service.create({
            labelPattern: 'FAKEMART',
            categoryId: groceries,
          })
          const total = APPLY_CHUNK_SIZE * 2 + 7
          await tx
            .insert(transactionsTable)
            .values(Array.from({ length: total }, () => transaction(accountId)))

          const result = await service.apply()

          expect(result).toMatchObject({
            scanned: total,
            matched: total,
            updated: total,
          })
          const rows = await tx
            .select({ categoryId: transactionsTable.categoryId })
            .from(transactionsTable)
            .orderBy(asc(transactionsTable.id))
          expect(rows.every((r) => r.categoryId === groceries)).toBe(true)
        })
      })
    })

    describe('remove', () => {
      it('re-runs the remaining rules on the transactions the rule categorized', async () => {
        await withFixture(
          async ({ tx, service, accountId, groceries, salary }) => {
            const specific = await service.create({
              labelPattern: 'FAKEMART EXPRESS',
              categoryId: salary,
            })
            const generic = await service.create({
              labelPattern: 'FAKEMART',
              categoryId: groceries,
            })
            const [covered] = await tx
              .insert(transactionsTable)
              .values(
                transaction(accountId, {
                  rawLabel: 'CB FAKEMART EXPRESS 0101',
                }),
              )
              .returning()
            await service.apply()
            expect((await reload(tx, covered.id)).ruleId).toBe(specific.id)
            // Categorized by the rule earlier, though it would not match today.
            const [orphaned] = await tx
              .insert(transactionsTable)
              .values(
                transaction(accountId, {
                  rawLabel: 'CB OTHER SHOP 0101',
                  categoryId: salary,
                  ruleId: specific.id,
                  kind: 'income',
                }),
              )
              .returning()

            await service.remove(specific.id)

            expect(await service.list()).toHaveLength(1)
            expect(await reload(tx, covered.id)).toMatchObject({
              categoryId: groceries,
              ruleId: generic.id,
              kind: 'expense',
            })
            expect(await reload(tx, orphaned.id)).toMatchObject({
              categoryId: null,
              ruleId: null,
              kind: 'expense',
              needsReview: true,
            })
          },
        )
      })
    })

    describe('suggest', () => {
      it('proposes a rule for an existing category only', async () => {
        await withFixture(async ({ service, accountId, groceries }) => {
          const input = {
            rawLabel: 'PAIEMENT CB 1501 TESTVILLE FAKEMART CARTE 4XXX0000',
            merchant: null,
            amountCents: -1_234,
            accountId,
          }

          await expect(
            service.suggest({ ...input, categoryId: groceries }),
          ).resolves.toMatchObject({
            matchType: 'contains',
            labelPattern: 'TESTVILLE FAKEMART',
            categoryId: groceries,
          })
          await expect(
            service.suggest({
              ...input,
              categoryId: '00000000-0000-4000-8000-000000000000',
            }),
          ).rejects.toBeInstanceOf(BadRequestException)
        })
      })
    })

    describe('apply (kind of unmatched rows)', () => {
      it('keeps the kind set by hand on an uncategorized row', async () => {
        await withFixture(async ({ tx, service, accountId }) => {
          const [marked] = await tx
            .insert(transactionsTable)
            .values(
              transaction(accountId, {
                rawLabel: 'VIR MYSELF OTHER BANK',
                kind: 'transfer',
                needsReview: true,
              }),
            )
            .returning()

          const result = await service.apply()

          expect(result).toMatchObject({ unmatched: 1, updated: 0 })
          expect(await reload(tx, marked.id)).toMatchObject({
            categoryId: null,
            kind: 'transfer',
            needsReview: true,
          })
        })
      })
    })

    describe('preview', () => {
      it('counts what a new rule would categorize, without saving it', async () => {
        await withFixture(
          async ({ tx, service, accountId, groceries, salary }) => {
            const earlier = await service.create({
              labelPattern: 'FAKEMART EXPRESS',
              categoryId: salary,
            })
            await tx.insert(transactionsTable).values([
              // Uncategorized, in review: would leave the queue.
              transaction(accountId, { needsReview: true }),
              transaction(accountId, {
                rawLabel: 'CB FAKEMART 0202',
                needsReview: true,
              }),
              // Uncategorized but already reviewed: categorized, not counted
              // as leaving the queue.
              transaction(accountId, { rawLabel: 'CB FAKEMART 0303' }),
              // Filed by hand: apply never touches it.
              transaction(accountId, {
                rawLabel: 'CB FAKEMART 0404',
                categoryId: salary,
                needsReview: true,
              }),
              // An earlier rule wins.
              transaction(accountId, {
                rawLabel: 'CB FAKEMART EXPRESS 0505',
                categoryId: salary,
                ruleId: earlier.id,
                kind: 'income',
              }),
              // Does not match.
              transaction(accountId, {
                rawLabel: 'CB OTHER SHOP',
                needsReview: true,
              }),
            ])

            const preview = await service.preview({
              labelPattern: 'fakemart',
              categoryId: groceries,
            })

            expect(preview).toEqual({ matched: 3, leavingReview: 2 })
            expect(await service.list()).toHaveLength(1)

            // Creating and applying the rule does what the preview said.
            await service.create({
              labelPattern: 'fakemart',
              categoryId: groceries,
            })
            await service.apply()
            const inReview = await tx
              .select({ id: transactionsTable.id })
              .from(transactionsTable)
              .where(eq(transactionsTable.needsReview, true))
            expect(inReview).toHaveLength(2)
          },
        )
      })

      it('validates the rule like create does', async () => {
        await withFixture(async ({ service, groceries }) => {
          await expect(
            service.preview({
              matchType: 'regex',
              labelPattern: 'FAKEMART (',
              categoryId: groceries,
            }),
          ).rejects.toBeInstanceOf(BadRequestException)
        })
      })
    })
  },
)
