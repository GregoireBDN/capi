import '#/load-env'
import { BadRequestException, Logger } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  cryptoImportsTable,
  cryptoMovementsTable,
  cryptoTransferLinksTable,
} from '#/database/schema'
import { CryptoCostBasisService, cryptoInvestedNow } from './cost-basis.service'
import { realisedGains } from './crypto.service'
import { CryptoPendingService } from './pending/crypto-pending.service'

/**
 * The cost follows the coins (#373), against the dedicated test database
 * (see `vitest.config.ts`): every test in a rolled-back transaction.
 * Synthetic accounts, quantities and amounts only.
 */

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')
const at = (day: string, hour = 10) =>
  new Date(`2026-${day}T${String(hour).padStart(2, '0')}:00:00Z`)
const NOW = at('11-05', 12)

describe.skipIf(!process.env.DATABASE_URL)(
  'CryptoCostBasisService and « À préciser » (database)',
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
      tx: Db
      costBasis: CryptoCostBasisService
      pending: CryptoPendingService
      /** A crypto account. */
      account: (
        name: string,
        source: 'exchange' | 'wallet' | 'manual',
      ) => Promise<string>
      /** Export lines of an exchange; returns their ids in order. */
      lines: (
        accountId: string,
        rows: [Date, string, string, string, number?][],
      ) => Promise<string[]>
      /** A complete read of a wallet holding these quantities. */
      read: (
        accountId: string,
        when: Date,
        held: Record<string, string>,
      ) => Promise<number>
      invested: (accountId: string) => Promise<number | undefined>
    }

    async function inRollback(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          const database = { db: tx } as never
          const costBasis = new CryptoCostBasisService(database)
          const pending = new CryptoPendingService(database, costBasis)
          const account: Fixture['account'] = async (name, source) => {
            const [row] = await tx
              .insert(accountsTable)
              .values({
                name,
                type: 'crypto',
                cryptoSource: source,
                cryptoProvider: source === 'exchange' ? 'coinbase' : null,
              })
              .returning()
            return row.id
          }
          let sequence = 0
          const lines: Fixture['lines'] = async (accountId, rows) => {
            const [imported] = await tx
              .insert(cryptoImportsTable)
              .values({
                accountId,
                format: 'coinbase_csv',
                fileName: 'export-exemple.csv',
                fileHash: String(++sequence).padStart(64, '0'),
                committedAt: NOW,
              })
              .returning()
            const written = await tx
              .insert(cryptoMovementsTable)
              .values(
                rows.map(([when, kind, asset, quantity, eurCents]) => ({
                  accountId,
                  importId: imported.id,
                  occurredAt: when,
                  operation: kind,
                  kind: kind as never,
                  asset,
                  quantity,
                  eurCents: eurCents ?? null,
                  dedupeHash: `line-${++sequence}`,
                })),
              )
              .returning({ id: cryptoMovementsTable.id })
            return written.map((row) => row.id)
          }
          const read: Fixture['read'] = (accountId, when, held) =>
            costBasis.observe(
              tx,
              accountId,
              Object.entries(held).map(([symbol, quantity]) => ({
                assetId: symbol === 'BTC' ? 'bitcoin' : 'ethereum',
                symbol,
                quantity,
              })),
              when,
              'wallet_sync',
            )
          const invested = async (accountId: string) =>
            cryptoInvestedNow(await costBasis.load(tx), accountId, NOW)
              ?.investedCents
          await fn({
            tx: tx as unknown as Db,
            costBasis,
            pending,
            account,
            lines,
            read,
            invested,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    it('Coinbase → Ledger → Binance, sold: the cost follows the coins, nothing typed', async () => {
      await inRollback(
        async ({ tx, costBasis, account, lines, read, invested }) => {
          const coinbase = await account('Coinbase', 'exchange')
          const binance = await account('Binance', 'exchange')
          const ledger = await account('Ledger', 'wallet')
          // The Ledger's first read: empty.
          expect(await read(ledger, at('01-01'), {})).toBe(0)
          await lines(coinbase, [
            [at('02-01'), 'buy', 'BTC', '1', 3_000_000],
            [at('02-02'), 'withdrawal', 'BTC', '-0.5'],
          ])
          // The next read sees them, a network fee paid in coins aside.
          expect(await read(ledger, at('02-03'), { BTC: '0.4999' })).toBe(1)
          expect(await costBasis.match(tx)).toBe(1)
          expect(await invested(coinbase)).toBe(1_500_000)
          expect(await invested(ledger)).toBe(1_500_000)

          // 0,2 BTC to Binance, sold for 8 000 €, the euros sent to the bank.
          await lines(binance, [
            [at('03-05'), 'deposit', 'BTC', '0.1999'],
            [at('03-06'), 'sell', 'BTC', '-0.1999'],
            [at('03-06'), 'sell', 'EUR', '8000'],
            [at('03-08'), 'withdrawal', 'EUR', '-8000'],
          ])
          expect(await read(ledger, at('03-10'), { BTC: '0.2999' })).toBe(1)
          expect(await costBasis.match(tx)).toBe(1)
          const basis = await costBasis.load(tx)
          // 0,2 of the 0,4999 BTC left with their share of the cost.
          expect(cryptoInvestedNow(basis, ledger, NOW)?.investedCents).toBe(
            Math.round((1_500_000 * 2_999) / 4_999),
          )
          expect(cryptoInvestedNow(basis, binance, NOW)?.investedCents).toBe(0)
          expect(realisedGains(basis, binance, '2026-11-05')).toMatchObject({
            count: 1,
            unknownCount: 0,
          })
          // Linked both ways, each side naming the other account.
          const named = await tx
            .select({
              id: cryptoMovementsTable.id,
              accountId: cryptoMovementsTable.accountId,
              other: cryptoMovementsTable.counterpartAccountId,
            })
            .from(cryptoMovementsTable)
          const links = await tx.select().from(cryptoTransferLinksTable)
          expect(links).toHaveLength(2)
          for (const link of links) {
            const out = named.find((row) => row.id === link.outMovementId)!
            const into = named.find((row) => row.id === link.inMovementId)!
            expect(out.other).toBe(into.accountId)
            expect(into.other).toBe(out.accountId)
            expect(link.matched).toBe('auto')
          }
        },
      )
    })

    it('two wallets hold BTC: a tie links nothing and asks the owner', async () => {
      await inRollback(
        async ({ tx, costBasis, pending, account, lines, read }) => {
          const coinbase = await account('Coinbase', 'exchange')
          const ledger = await account('Ledger', 'wallet')
          const trezor = await account('Trezor', 'wallet')
          await read(ledger, at('01-01'), {})
          await read(trezor, at('01-01'), {})
          const [, withdrawal] = await lines(coinbase, [
            [at('02-01'), 'buy', 'BTC', '1', 3_000_000],
            [at('02-02'), 'withdrawal', 'BTC', '-0.5'],
          ])
          await read(ledger, at('02-03'), { BTC: '0.4999' })
          await read(trezor, at('02-03'), { BTC: '0.4999' })
          expect(await costBasis.match(tx)).toBe(0)
          const asked = await pending.list(ledger)
          expect(asked.items).toMatchObject([
            {
              type: 'arrival',
              symbol: 'BTC',
              quantity: '0.4999',
              candidates: [{ movementId: withdrawal, accountName: 'Coinbase' }],
            },
          ])
          // « Depuis une plateforme »: the owner picks the withdrawal.
          const answered = await pending.answer(asked.items[0].movementId, {
            answer: 'transfer',
            counterpartMovementId: withdrawal,
          })
          expect(answered.items).toEqual([])
          expect(answered.answered).toMatchObject([
            { answer: 'transfer', counterpartAccountName: 'Coinbase' },
          ])
          const trezorAsked = await pending.list(trezor)
          expect(trezorAsked.items[0].candidates).toEqual([])
        },
      )
    })

    it('0,1 BTC from an unknown wallet: named until answered, a gift costs 0, the rest still counted', async () => {
      await inRollback(async ({ pending, account, read, invested }) => {
        const ledger = await account('Ledger', 'wallet')
        await read(ledger, at('01-01'), {})
        await read(ledger, at('02-03'), { BTC: '0.1' })
        const asked = await pending.list(ledger)
        expect(asked.items).toMatchObject([
          { type: 'arrival', quantity: '0.1', candidates: [] },
        ])
        const before = await (async () => invested(ledger))()
        expect(before).toBe(0)
        await expect(
          pending.answer(asked.items[0].movementId, { answer: 'disposed' }),
        ).rejects.toBeInstanceOf(BadRequestException)
        const gift = await pending.answer(asked.items[0].movementId, {
          answer: 'gift',
        })
        expect(gift.items).toEqual([])
        expect(gift.answered).toMatchObject([{ answer: 'gift', costCents: 0 }])
        // Taken back: asked again; bought elsewhere at a cost.
        const again = await pending.clear(asked.items[0].movementId)
        expect(again.items).toHaveLength(1)
        await pending.answer(asked.items[0].movementId, {
          answer: 'bought',
          costCents: 300_000,
        })
        expect(await invested(ledger)).toBe(300_000)
      })
    })

    it('a link removed by hand stays removed', async () => {
      await inRollback(
        async ({ tx, costBasis, pending, account, lines, read }) => {
          const coinbase = await account('Coinbase', 'exchange')
          const ledger = await account('Ledger', 'wallet')
          await read(ledger, at('01-01'), {})
          await lines(coinbase, [
            [at('02-01'), 'buy', 'BTC', '1', 3_000_000],
            [at('02-02'), 'withdrawal', 'BTC', '-0.5'],
          ])
          await read(ledger, at('02-03'), { BTC: '0.5' })
          expect(await costBasis.match(tx)).toBe(1)
          const [arrival] = (await pending.list(ledger)).answered
          const unlinked = await pending.unlink(arrival.movementId)
          expect(unlinked.items).toHaveLength(1)
          expect(await costBasis.match(tx)).toBe(0)
          expect(await tx.select().from(cryptoTransferLinksTable)).toEqual([])
          // A departure answered « Vendus ou donnés » leaves at average cost.
          await read(ledger, at('03-01'), { BTC: '0.25' })
          const departure = (await pending.list(ledger)).items.find(
            (item) => item.type === 'departure',
          )!
          const after = await pending.answer(departure.movementId, {
            answer: 'disposed',
          })
          expect(after.items.map((item) => item.type)).toEqual(['arrival'])
        },
      )
    })

    it('asks for the cost of an opening position beyond what was sent to it', async () => {
      await inRollback(
        async ({ tx, pending, account, lines, read, invested }) => {
          const coinbase = await account('Coinbase', 'exchange')
          const ledger = await account('Ledger', 'wallet')
          const [, withdrawal] = await lines(coinbase, [
            [at('02-01'), 'buy', 'BTC', '1', 3_000_000],
            [at('02-02'), 'withdrawal', 'BTC', '-0.5'],
          ])
          // First read, long after: 0,7 BTC, 0,5 of them from Coinbase.
          await read(ledger, at('04-01'), { BTC: '0.7' })
          const asked = await pending.list(ledger)
          expect(asked.items).toMatchObject([
            {
              type: 'opening',
              quantity: '0.7',
              candidates: [{ movementId: withdrawal }],
            },
          ])
          await pending.answer(asked.items[0].movementId, {
            answer: 'transfer',
            counterpartMovementId: withdrawal,
          })
          const [named] = await tx
            .select()
            .from(cryptoMovementsTable)
            .where(eq(cryptoMovementsTable.id, withdrawal))
          expect(named.counterpartAccountId).toBe(ledger)
          const rest = await pending.list(ledger)
          expect(rest.items).toMatchObject([
            { type: 'opening', quantity: '0.2' },
          ])
          await pending.answer(rest.items[0].movementId, {
            answer: 'bought',
            costCents: 500_000,
          })
          expect(await invested(ledger)).toBe(1_500_000 + 500_000)
          expect((await pending.list(ledger)).items).toEqual([])
        },
      )
    })

    it('never logs quantities, values or addresses', async () => {
      const logged: unknown[] = []
      for (const level of ['log', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(Logger.prototype, level).mockImplementation(
          (...args: unknown[]) => {
            logged.push(...args)
          },
        )
      }
      await inRollback(async ({ tx, costBasis, account, lines, read }) => {
        const coinbase = await account('Coinbase', 'exchange')
        const ledger = await account('Ledger', 'wallet')
        await read(ledger, at('01-01'), {})
        await lines(coinbase, [
          [at('02-01'), 'buy', 'BTC', '1.2345', 3_000_000],
          [at('02-02'), 'withdrawal', 'BTC', '-0.6789'],
        ])
        await read(ledger, at('02-03'), { BTC: '0.6788' })
        await costBasis.match(tx)
      })
      vi.restoreAllMocks()
      const text = JSON.stringify(logged)
      expect(text).toContain('Crypto transfers linked: 1')
      for (const secret of ['0.6788', '0.6789', '1.2345', '30000']) {
        expect(text).not.toContain(secret)
      }
    })
  },
)
