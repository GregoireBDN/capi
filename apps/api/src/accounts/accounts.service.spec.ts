import '#/load-env'
import { NotFoundException, ValidationPipe } from '@nestjs/common'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  balanceSnapshotsTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import { AccountsService } from './accounts.service'
import {
  CreateAccountDto,
  ListAccountsQueryDto,
  UpdateAccountDto,
} from './dto/account.dto'
import { bankRows } from '#/transactions/testing/bank-rows'

/**
 * Integration checks against the migrated database (see
 * `domain-schema.spec.ts`). Every test runs in a transaction that is rolled
 * back, so the local database is left untouched. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

describe.skipIf(!process.env.DATABASE_URL)('AccountsService (database)', () => {
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
        // The service only reads `db`; its own transactions become savepoints.
        await fn({ tx, service: new AccountsService({ db: tx } as never) })
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
      bookingDate: '2026-10-01',
      amountCents: -1_000,
      rawLabel: 'PAIEMENT CB 0110 VILLE-TEST FAUX MAGASIN',
      kind: 'expense',
      dedupeHash: `accounts-test-${hash}`,
      ...overrides,
    } satisfies InsertTransaction
  }

  it('creates accounts at the end of the order and lists them by position', async () => {
    await inRollback(async ({ service }) => {
      const first = await service.create({
        name: 'Test checking',
        type: 'checking',
        institution: 'Test bank',
      })
      const second = await service.create({
        name: 'Test PEA',
        type: 'brokerage',
      })

      expect(second.position).toBe(first.position + 1)
      expect(first).toMatchObject({
        institution: 'Test bank',
        archivedAt: null,
        balanceCents: null,
        balanceDate: null,
      })
      expect(second.institution).toBeNull()

      const ids = (await service.list()).map((a) => a.id)
      expect(ids.indexOf(first.id)).toBeGreaterThanOrEqual(0)
      expect(ids.indexOf(second.id)).toBeGreaterThan(ids.indexOf(first.id))
    })
  })

  it('hides archived accounts unless asked, and restores them', async () => {
    await inRollback(async ({ service }) => {
      const account = await service.create({ name: 'Old', type: 'savings' })

      const archived = await service.update(account.id, { archived: true })
      expect(archived.archivedAt).toBeInstanceOf(Date)
      const again = await service.update(account.id, { archived: true })
      expect(again.archivedAt).toEqual(archived.archivedAt)

      expect((await service.list()).map((a) => a.id)).not.toContain(account.id)
      expect(
        (await service.list({ includeArchived: true })).map((a) => a.id),
      ).toContain(account.id)

      const restored = await service.update(account.id, { archived: false })
      expect(restored.archivedAt).toBeNull()
      expect((await service.list()).map((a) => a.id)).toContain(account.id)
    })
  })

  it('renames, moves and clears the institution', async () => {
    await inRollback(async ({ service }) => {
      const account = await service.create({
        name: 'Test',
        type: 'checking',
        institution: 'Test bank',
      })
      const updated = await service.update(account.id, {
        name: 'Renamed',
        institution: null,
        position: 42,
      })
      expect(updated).toMatchObject({
        name: 'Renamed',
        institution: null,
        position: 42,
        type: 'checking',
      })
      expect(await service.update(account.id, {})).toMatchObject({
        name: 'Renamed',
      })
    })
  })

  it('returns 404 for an unknown account', async () => {
    await inRollback(async ({ service }) => {
      await expect(
        service.update('00000000-0000-4000-8000-000000000000', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  it('uses the end-of-day running balance plus later rows without balance', async () => {
    await inRollback(async ({ tx, service }) => {
      const account = await service.create({ name: 'Test', type: 'checking' })
      // Inserted in reverse order: the end-of-day balance is found by chaining.
      await tx.insert(transactionsTable).values(
        await bankRows(tx, [
          transaction(account.id, {
            bookingDate: '2026-10-02',
            amountCents: -500,
            balanceAfterCents: 9_000,
          }),
          transaction(account.id, {
            bookingDate: '2026-10-02',
            amountCents: -500,
            balanceAfterCents: 9_500,
          }),
          transaction(account.id, {
            bookingDate: '2026-10-01',
            amountCents: 10_000,
            balanceAfterCents: 10_000,
          }),
          // Entered by hand after the last export: no running balance.
          transaction(account.id, {
            bookingDate: '2026-10-05',
            amountCents: -250,
            balanceAfterCents: null,
          }),
        ]),
      )

      const listed = (await service.list()).find((a) => a.id === account.id)
      expect(listed).toMatchObject({
        balanceCents: 8_750,
        balanceDate: '2026-10-05',
      })
    })
  })

  it('sums the amounts when no row has a running balance', async () => {
    await inRollback(async ({ tx, service }) => {
      const account = await service.create({ name: 'Test', type: 'savings' })
      await tx.insert(transactionsTable).values(
        await bankRows(tx, [
          transaction(account.id, {
            amountCents: 20_000,
            bookingDate: '2026-09-01',
          }),
          transaction(account.id, {
            amountCents: -5_000,
            bookingDate: '2026-09-15',
          }),
        ]),
      )
      expect(await service.findOne(account.id)).toMatchObject({
        balanceCents: 15_000,
        balanceDate: '2026-09-15',
      })
    })
  })

  it('returns no balance when the latest balances do not chain', async () => {
    await inRollback(async ({ tx, service }) => {
      const account = await service.create({ name: 'Test', type: 'checking' })
      await tx.insert(transactionsTable).values(
        await bankRows(tx, [
          transaction(account.id, {
            amountCents: -100,
            balanceAfterCents: 1_000,
          }),
          transaction(account.id, {
            amountCents: -100,
            balanceAfterCents: 5_000,
          }),
        ]),
      )
      expect(await service.findOne(account.id)).toMatchObject({
        balanceCents: null,
        balanceDate: null,
      })
    })
  })

  it('anchors history without running balances on the latest snapshot', async () => {
    await inRollback(async ({ tx, service }) => {
      const account = await service.create({ name: 'Test', type: 'checking' })
      await tx.insert(transactionsTable).values(
        await bankRows(tx, [
          // Before the snapshot: already part of the statement balance.
          transaction(account.id, {
            bookingDate: '2026-08-10',
            amountCents: -700,
          }),
          transaction(account.id, {
            bookingDate: '2026-08-31',
            amountCents: -300,
          }),
          // After the snapshot.
          transaction(account.id, {
            bookingDate: '2026-09-03',
            amountCents: -1_200,
          }),
          transaction(account.id, {
            bookingDate: '2026-09-04',
            amountCents: 500,
          }),
        ]),
      )
      await tx.insert(balanceSnapshotsTable).values([
        { accountId: account.id, date: '2026-07-31', valueCents: 1 },
        { accountId: account.id, date: '2026-08-31', valueCents: 50_000 },
      ])

      expect(await service.findOne(account.id)).toMatchObject({
        balanceCents: 49_300,
        balanceDate: '2026-09-04',
      })
    })
  })

  it('prefers whichever of the running balance and the snapshot is newer', async () => {
    await inRollback(async ({ tx, service }) => {
      const running = await service.create({ name: 'Run', type: 'checking' })
      const snapshotted = await service.create({
        name: 'Snap',
        type: 'checking',
      })
      const tie = await service.create({ name: 'Tie', type: 'savings' })
      const onlySnapshot = await service.create({
        name: 'Only snapshot',
        type: 'savings',
      })
      await tx.insert(transactionsTable).values(
        await bankRows(tx, [
          // Running balance on 10-05 is newer than the 09-30 snapshot.
          transaction(running.id, {
            bookingDate: '2026-10-05',
            amountCents: -100,
            balanceAfterCents: 7_000,
          }),
          transaction(running.id, {
            bookingDate: '2026-10-06',
            amountCents: -50,
          }),
          // Snapshot on 10-31 is newer than the 10-05 running balance.
          transaction(snapshotted.id, {
            bookingDate: '2026-10-05',
            amountCents: -100,
            balanceAfterCents: 7_000,
          }),
          transaction(snapshotted.id, {
            bookingDate: '2026-11-02',
            amountCents: -40,
          }),
          // Same day: the snapshot (statement) wins.
          transaction(tie.id, {
            bookingDate: '2026-10-31',
            amountCents: 100,
            balanceAfterCents: 3_000,
          }),
        ]),
      )
      await tx.insert(balanceSnapshotsTable).values([
        { accountId: running.id, date: '2026-09-30', valueCents: 1 },
        { accountId: snapshotted.id, date: '2026-10-31', valueCents: 8_000 },
        { accountId: tie.id, date: '2026-10-31', valueCents: 3_100 },
        { accountId: onlySnapshot.id, date: '2026-10-31', valueCents: 4_200 },
      ])

      const byId = new Map((await service.list()).map((a) => [a.id, a]))
      expect(byId.get(running.id)).toMatchObject({
        balanceCents: 6_950,
        balanceDate: '2026-10-06',
      })
      expect(byId.get(snapshotted.id)).toMatchObject({
        balanceCents: 7_960,
        balanceDate: '2026-11-02',
      })
      expect(byId.get(tie.id)).toMatchObject({
        balanceCents: 3_100,
        balanceDate: '2026-10-31',
      })
      expect(byId.get(onlySnapshot.id)).toMatchObject({
        balanceCents: 4_200,
        balanceDate: '2026-10-31',
      })
    })
  })

  it('uses the latest snapshot of an investment account', async () => {
    await inRollback(async ({ tx, service }) => {
      const pea = await service.create({ name: 'Test PEA', type: 'brokerage' })
      const empty = await service.create({
        name: 'Test crypto',
        type: 'crypto',
      })
      await tx.insert(balanceSnapshotsTable).values([
        { accountId: pea.id, date: '2026-08-31', valueCents: 100_000 },
        { accountId: pea.id, date: '2026-09-30', valueCents: 123_456 },
      ])

      const accounts = await service.list()
      expect(accounts.find((a) => a.id === pea.id)).toMatchObject({
        balanceCents: 123_456,
        balanceDate: '2026-09-30',
      })
      expect(accounts.find((a) => a.id === empty.id)).toMatchObject({
        balanceCents: null,
        balanceDate: null,
      })
    })
  })
})

describe('account DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  })

  function validate<T>(metatype: new () => T, value: unknown, type = 'body') {
    return pipe.transform(value, {
      type: type as 'body' | 'query',
      metatype,
    }) as Promise<T>
  }

  it('parses includeArchived from the query string', async () => {
    await expect(
      validate(ListAccountsQueryDto, { includeArchived: 'true' }, 'query'),
    ).resolves.toMatchObject({ includeArchived: true })
    await expect(
      validate(ListAccountsQueryDto, { includeArchived: 'yes' }, 'query'),
    ).rejects.toThrow()
  })

  it('trims names and turns an empty institution into null', async () => {
    await expect(
      validate(CreateAccountDto, {
        name: '  Test  ',
        type: 'checking',
        institution: '  ',
      }),
    ).resolves.toMatchObject({ name: 'Test', institution: null })
  })

  it.each([
    [{ name: '', type: 'checking' }],
    [{ name: 'Test', type: 'credit_card' }],
    [{ name: 'Test', type: 'checking', balance: 1 }],
  ])('rejects an invalid create body %j', async (body) => {
    await expect(validate(CreateAccountDto, body)).rejects.toThrow()
  })

  it.each([
    [{ name: null }],
    [{ position: -1 }],
    [{ archived: null }],
    [{ type: 'savings' }],
  ])('rejects an invalid update body %j', async (body) => {
    await expect(validate(UpdateAccountDto, body)).rejects.toThrow()
  })
})
