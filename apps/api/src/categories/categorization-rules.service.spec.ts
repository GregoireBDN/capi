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
            priority: 0,
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

    describe('order (#299)', () => {
      it('lists the rules most specific first, whatever their creation order', async () => {
        await withFixture(async ({ service, groceries, salary }) => {
          const broad = await service.create({
            labelPattern: 'FAKEMART',
            categoryId: groceries,
          })
          const longer = await service.create({
            labelPattern: 'FAKEMART EXPRESS',
            categoryId: salary,
          })
          const withAmount = await service.create({
            labelPattern: 'FAKEMART',
            categoryId: salary,
            maxAmountCents: -10_000,
          })
          const regex = await service.create({
            matchType: 'regex',
            labelPattern: '^CB',
            categoryId: groceries,
          })

          expect(longer.rank).toBe(0)
          expect((await service.list()).map((r) => [r.id, r.rank])).toEqual([
            [regex.id, 0],
            [longer.id, 1],
            [withAmount.id, 2],
            [broad.id, 3],
          ])
        })
      })

      it('puts a higher priority first, set on create or update', async () => {
        await withFixture(async ({ service, groceries }) => {
          const specific = await service.create({
            labelPattern: 'FAKEMART EXPRESS',
            categoryId: groceries,
          })
          const pinned = await service.create({
            labelPattern: 'FAKEMART',
            categoryId: groceries,
            priority: 1,
          })
          expect(pinned).toMatchObject({ priority: 1, rank: 0 })

          const updated = await service.update(pinned.id, { priority: 0 })
          expect(updated.rank).toBe(1)
          expect((await service.list()).map((r) => r.id)).toEqual([
            specific.id,
            pinned.id,
          ])
        })
      })
    })

    describe('prefer', () => {
      it('raises the priority just above the other rule, once', async () => {
        await withFixture(async ({ service, groceries, salary }) => {
          const specific = await service.create({
            labelPattern: 'FAKEMART EXPRESS',
            categoryId: salary,
            priority: 2,
          })
          const broad = await service.create({
            labelPattern: 'FAKEMART',
            categoryId: groceries,
          })

          const preferred = await service.prefer(broad.id, specific.id)
          expect(preferred).toMatchObject({ priority: 3, rank: 0 })

          // Already first: unchanged.
          const again = await service.prefer(broad.id, specific.id)
          expect(again).toMatchObject({ priority: 3, rank: 0 })
          const other = await service
            .prefer(specific.id, specific.id)
            .catch((error: unknown) => error)
          expect(other).toBeInstanceOf(BadRequestException)
          await expect(
            service.prefer(broad.id, '00000000-0000-4000-8000-000000000000'),
          ).rejects.toThrow(/overRuleId does not match any rule/)
          await expect(
            service.prefer('00000000-0000-4000-8000-000000000000', broad.id),
          ).rejects.toBeInstanceOf(NotFoundException)
        })
      })
    })

    describe('insights', () => {
      const NOW = new Date('2026-06-15T10:00:00Z')

      it('counts the matches of the last 12 months, and the conflicts', async () => {
        await withFixture(
          async ({ tx, service, accountId, groceries, salary, savings }) => {
            const eats = await service.create({
              labelPattern: 'FAKEEATS DELIVERY',
              categoryId: salary,
            })
            const ride = await service.create({
              labelPattern: 'FAKEEATS',
              categoryId: savings,
            })
            // Same outcome as `eats`: overlapping, not a conflict.
            const same = await service.create({
              labelPattern: 'DELIVERY',
              categoryId: salary,
            })
            const unused = await service.create({
              labelPattern: 'NOTHING MATCHES THIS',
              categoryId: groceries,
            })
            await tx.insert(transactionsTable).values([
              transaction(accountId, {
                bookingDate: '2026-06-01',
                rawLabel: 'CB FAKEEATS DELIVERY 0106',
                categoryId: salary,
                ruleId: eats.id,
              }),
              transaction(accountId, {
                bookingDate: '2026-05-01',
                rawLabel: 'CB FAKEEATS DELIVERY 0105',
                needsReview: true,
              }),
              transaction(accountId, {
                bookingDate: '2026-04-01',
                rawLabel: 'CB FAKEEATS 0104',
                categoryId: savings,
                ruleId: ride.id,
              }),
              // Filed by hand: counted as a match, never as a conflict.
              transaction(accountId, {
                bookingDate: '2026-03-01',
                rawLabel: 'CB FAKEEATS DELIVERY 0103',
                categoryId: groceries,
              }),
              // Older than 12 months: a conflict, not a match.
              transaction(accountId, {
                bookingDate: '2025-06-14',
                rawLabel: 'CB FAKEEATS DELIVERY 1406',
                needsReview: true,
              }),
            ])

            const insights = await service.insights(NOW)

            expect(insights.since).toBe('2025-06-15')
            expect(
              Object.fromEntries(
                insights.rules.map((r) => [r.ruleId, r.matchCount]),
              ),
            ).toEqual({
              [eats.id]: 3,
              [ride.id]: 4,
              [same.id]: 3,
              [unused.id]: 0,
            })
            expect(insights.conflicts).toEqual([
              { winnerRuleId: eats.id, loserRuleId: ride.id, count: 3 },
            ])

            // Making the broad rule win turns the conflict around.
            await service.prefer(ride.id, eats.id)
            const after = await service.insights(NOW)
            expect(after.conflicts).toEqual(
              expect.arrayContaining([
                { winnerRuleId: ride.id, loserRuleId: eats.id, count: 3 },
                { winnerRuleId: ride.id, loserRuleId: same.id, count: 3 },
              ]),
            )
            expect(after.conflicts).toHaveLength(2)
          },
        )
      })

      it('leaves disabled rules out of the conflicts', async () => {
        await withFixture(
          async ({ tx, service, accountId, groceries, salary }) => {
            await service.create({
              labelPattern: 'FAKEMART EXPRESS',
              categoryId: salary,
              enabled: false,
            })
            await service.create({
              labelPattern: 'FAKEMART',
              categoryId: groceries,
            })
            await tx.insert(transactionsTable).values(
              transaction(accountId, {
                bookingDate: '2026-06-01',
                rawLabel: 'CB FAKEMART EXPRESS',
                needsReview: true,
              }),
            )
            const insights = await service.insights(NOW)
            expect(insights.conflicts).toEqual([])
            expect(insights.rules.map((r) => r.matchCount)).toEqual([1, 1])
          },
        )
      })
    })

    describe('matches', () => {
      const NOW = new Date('2026-06-15T10:00:00Z')

      it('lists what the conditions catch over 12 months, most recent first', async () => {
        await withFixture(async ({ tx, service, accountId, groceries }) => {
          const [manual, fresh] = await tx
            .insert(transactionsTable)
            .values([
              transaction(accountId, {
                bookingDate: '2026-02-01',
                rawLabel: 'CB FAKEMART 0102',
                categoryId: groceries,
              }),
              transaction(accountId, {
                bookingDate: '2026-06-10',
                rawLabel: 'CB FAKEMART 1006',
                amountCents: -50_000,
                needsReview: true,
              }),
              transaction(accountId, {
                bookingDate: '2025-01-01',
                rawLabel: 'CB FAKEMART 0101',
              }),
              transaction(accountId, {
                bookingDate: '2026-06-11',
                rawLabel: 'CB OTHER SHOP',
              }),
            ])
            .returning()

          const result = await service.matches(
            { labelPattern: 'fakemart' },
            NOW,
          )
          expect(result).toMatchObject({ since: '2025-06-15', total: 2 })
          expect(
            result.transactions.map((t) => [t.id, t.manual, t.categoryId]),
          ).toEqual([
            [fresh.id, false, null],
            [manual.id, true, groceries],
          ])

          const big = await service.matches(
            { labelPattern: 'fakemart', maxAmountCents: -10_000 },
            NOW,
          )
          expect(big.transactions.map((t) => t.id)).toEqual([fresh.id])
          await expect(
            service.matches({ matchType: 'regex', labelPattern: '(' }, NOW),
          ).rejects.toBeInstanceOf(BadRequestException)
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

      it('follows the computed order, then the priority a conflict fix sets', async () => {
        await withFixture(
          async ({ tx, service, accountId, groceries, salary }) => {
            const broad = await service.create({
              labelPattern: 'FAKEMART',
              categoryId: groceries,
            })
            const narrow = await service.create({
              labelPattern: 'FAKEMART CARTE',
              categoryId: salary,
              kind: 'expense',
            })
            await service.create({
              labelPattern: 'FAKEMART CARTE 4XXX',
              categoryId: salary,
              enabled: false,
            })
            const [row] = await tx
              .insert(transactionsTable)
              .values(transaction(accountId, { needsReview: true }))
              .returning()

            await service.apply()
            expect(await reload(tx, row.id)).toMatchObject({
              categoryId: salary,
              ruleId: narrow.id,
              kind: 'expense',
            })

            await service.prefer(broad.id, narrow.id)
            await service.apply()
            expect(await reload(tx, row.id)).toMatchObject({
              categoryId: groceries,
              ruleId: broad.id,
            })
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

            expect(preview).toMatchObject({
              matched: 3,
              leavingReview: 2,
              released: 0,
              changed: 3,
            })
            expect(preview.transactions).toHaveLength(3)
            expect(
              preview.transactions.every(
                (t) =>
                  t.categoryId === null &&
                  t.nextCategoryId === groceries &&
                  t.nextKind === 'expense',
              ),
            ).toBe(true)
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

      it('previews an edited rule at its own position, with released rows', async () => {
        await withFixture(
          async ({ tx, service, accountId, groceries, salary, savings }) => {
            const first = await service.create({
              labelPattern: 'FAKEMART EXPRESS',
              categoryId: salary,
            })
            const edited = await service.create({
              labelPattern: 'FAKEMART',
              categoryId: groceries,
            })
            const fallback = await service.create({
              labelPattern: 'CB',
              categoryId: savings,
            })
            const [kept, released, newlyMatched, earlierWins] = await tx
              .insert(transactionsTable)
              .values([
                // Owned today, still matched: moves to the new category.
                transaction(accountId, {
                  bookingDate: '2026-01-10',
                  rawLabel: 'CB FAKEMART DRIVE 0101',
                  categoryId: groceries,
                  ruleId: edited.id,
                }),
                // Owned today, no longer matched: the next rule takes it.
                transaction(accountId, {
                  bookingDate: '2026-02-10',
                  rawLabel: 'CB FAKEMART CITY 0202',
                  categoryId: groceries,
                  ruleId: edited.id,
                }),
                // Uncategorized, in review: matched once edited.
                transaction(accountId, {
                  bookingDate: '2026-03-10',
                  rawLabel: 'FAKEMART DRIVE 0303',
                  needsReview: true,
                }),
                // The earlier rule still wins.
                transaction(accountId, {
                  bookingDate: '2026-04-10',
                  rawLabel: 'FAKEMART EXPRESS DRIVE 0404',
                  categoryId: salary,
                  ruleId: first.id,
                  kind: 'income',
                }),
              ])
              .returning()

            const preview = await service.preview({
              ruleId: edited.id,
              labelPattern: 'fakemart drive',
              categoryId: salary,
            })

            expect(preview).toMatchObject({
              matched: 2,
              leavingReview: 1,
              released: 1,
              changed: 3,
            })
            // Most recent first; the row the earlier rule wins is not listed.
            expect(
              preview.transactions.map((t) => [
                t.id,
                t.categoryId,
                t.nextCategoryId,
                t.nextKind,
              ]),
            ).toEqual([
              [newlyMatched.id, null, salary, 'income'],
              [released.id, groceries, savings, 'transfer'],
              [kept.id, groceries, salary, 'income'],
            ])
            expect(preview.transactions.map((t) => t.id)).not.toContain(
              earlierWins.id,
            )

            // Nothing was saved.
            expect(await service.findOne(edited.id)).toMatchObject({
              labelPattern: 'FAKEMART',
              categoryId: groceries,
            })

            // Saving and applying does what the preview said.
            await service.update(edited.id, {
              labelPattern: 'fakemart drive',
              categoryId: salary,
            })
            await service.apply()
            expect(await reload(tx, released.id)).toMatchObject({
              categoryId: savings,
              ruleId: fallback.id,
            })
            expect(await reload(tx, newlyMatched.id)).toMatchObject({
              categoryId: salary,
              ruleId: edited.id,
              needsReview: false,
            })
          },
        )
      })

      it('lists the conflicts of the previewed rule, won and lost', async () => {
        await withFixture(
          async ({ tx, service, accountId, groceries, salary, savings }) => {
            const longer = await service.create({
              labelPattern: 'FAKEMART EXPRESS',
              categoryId: salary,
            })
            const shorter = await service.create({
              labelPattern: 'MART',
              categoryId: savings,
            })
            // Not involved: matches nothing the preview matches.
            await service.create({
              labelPattern: 'OTHER',
              categoryId: savings,
            })
            await tx.insert(transactionsTable).values([
              transaction(accountId, {
                rawLabel: 'CB FAKEMART EXPRESS 0101',
                needsReview: true,
              }),
              transaction(accountId, {
                rawLabel: 'CB FAKEMART 0202',
                needsReview: true,
              }),
              transaction(accountId, {
                rawLabel: 'CB FAKEMART 0303',
                needsReview: true,
              }),
            ])

            const preview = await service.preview({
              labelPattern: 'fakemart',
              categoryId: groceries,
            })
            expect(preview.conflicts).toEqual([
              {
                winnerRuleId: '00000000-0000-0000-0000-000000000000',
                loserRuleId: shorter.id,
                // Not the row the longer rule wins.
                count: 2,
              },
              {
                winnerRuleId: longer.id,
                loserRuleId: '00000000-0000-0000-0000-000000000000',
                count: 1,
              },
            ])
          },
        )
      })

      it('counts a disabled rule as releasing what it categorized', async () => {
        await withFixture(async ({ tx, service, accountId, groceries }) => {
          const rule = await service.create({
            labelPattern: 'FAKEMART',
            categoryId: groceries,
          })
          await tx.insert(transactionsTable).values(
            transaction(accountId, {
              categoryId: groceries,
              ruleId: rule.id,
            }),
          )

          const preview = await service.preview({
            ruleId: rule.id,
            labelPattern: 'FAKEMART',
            categoryId: groceries,
            enabled: false,
          })

          expect(preview).toMatchObject({ matched: 0, released: 1, changed: 1 })
          expect(preview.transactions[0]).toMatchObject({
            nextCategoryId: null,
            nextKind: 'expense',
          })
        })
      })

      it('404s on an unknown rule id', async () => {
        await withFixture(async ({ service, groceries }) => {
          await expect(
            service.preview({
              ruleId: '00000000-0000-4000-8000-000000000000',
              labelPattern: 'FAKEMART',
              categoryId: groceries,
            }),
          ).rejects.toBeInstanceOf(NotFoundException)
        })
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
